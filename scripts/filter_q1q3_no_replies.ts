// Filter email-napalm.csv to Q1-Q3 recipients who have NOT replied to wes@/jb@.
// "Replied" = an inbound_email exists for account_email IN (wes@,jb@) whose
// lowercased from_address matches the recipient's lowercased email.

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

config({ path: ".env.local" });

const ACCOUNTS = ["wes@gofpblock.com", "jb@gofpblock.com"];
const SOURCE = "email-napalm.csv";
const OUT = "email-napalm-no-replies.csv";
const SEND_LOG = "consensus/miami_dinner_send_log.jsonl";
const FASTMAIL_SENT_PATH = "scripts/_fastmail_sent_to.json";
const QUADRANTS = new Set(["1", "2", "3", "4"]);
const CAMPAIGN_SUBJECT_RE = /Consensus Miami Dinner With Ex-Microsoft Exec/i;
const PERSONAL_DOMAINS = new Set([
  "gmail.com", "hotmail.com", "yahoo.com", "outlook.com",
  "icloud.com", "protonmail.com", "aol.com", "live.com", "me.com",
]);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_SUPABASE_SECRET_KEY!
);

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let i = 0, field = "", row: string[] = [], inQ = false;
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 2; continue; }
      if (c === '"') { inQ = false; i++; continue; }
      field += c; i++;
    } else {
      if (c === '"') { inQ = true; i++; continue; }
      if (c === ",") { row.push(field); field = ""; i++; continue; }
      if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
      if (c === "\r") { i++; continue; }
      field += c; i++;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function csv(v: string | null | undefined): string {
  if (v == null) return "";
  const s = String(v).replace(/\r\n/g, "\n");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Build SendGrid messageId → recipient person_id map from the send log.
function loadSendLogIndex(): { msgIdToPerson: Map<string, string>; msgIdToEmail: Map<string, string> } {
  const msgIdToPerson = new Map<string, string>();
  const msgIdToEmail = new Map<string, string>();
  const lines = readFileSync(SEND_LOG, "utf8").trim().split("\n").filter(Boolean);
  for (const line of lines) {
    try {
      const e = JSON.parse(line);
      if (e.status !== "success" || e.dry_run || !e.messageId || !e.person_id) continue;
      msgIdToPerson.set(e.messageId, e.person_id);
      if (e.email) msgIdToEmail.set(e.messageId, String(e.email).toLowerCase());
    } catch {
      // skip
    }
  }
  return { msgIdToPerson, msgIdToEmail };
}

// Extract local-parts (the SendGrid X-Message-Id) from In-Reply-To and References.
function extractMessageIdLocalParts(headers: Record<string, unknown> | null): string[] {
  if (!headers) return [];
  const candidates = [
    headers["In-Reply-To"], headers["in-reply-to"],
    headers["References"], headers["references"],
  ].filter((v): v is string => typeof v === "string");
  const out: string[] = [];
  for (const value of candidates) {
    for (const m of value.match(/<([^@>]+)@[^>]+>/g) ?? []) {
      const lp = m.match(/<([^@>]+)@/);
      if (lp) out.push(lp[1]);
    }
  }
  return out;
}

async function fetchReplies(msgIdToPerson: Map<string, string>): Promise<{
  addresses: Set<string>;
  personIds: Set<string>;
  campaignReplyDomains: Set<string>;
  campaignReplyAddresses: Set<string>;
}> {
  const addresses = new Set<string>();
  const personIds = new Set<string>();
  const campaignReplyDomains = new Set<string>();
  const campaignReplyAddresses = new Set<string>();
  let threadHits = 0;
  let inboundCount = 0;
  for (const account of ACCOUNTS) {
    const PAGE = 1000;
    let from = 0;
    let perAccount = 0;
    while (true) {
      const { data, error } = await supabase
        .from("inbound_emails")
        .select("from_address, person_id, raw_headers, subject")
        .eq("account_email", account)
        .order("received_at", { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const r of data) {
        inboundCount++;
        const addr = (r.from_address || "").toLowerCase().trim();
        if (addr) addresses.add(addr);
        if (r.person_id) personIds.add(r.person_id);
        // Thread match: any local-part in In-Reply-To/References that we sent.
        for (const lp of extractMessageIdLocalParts(r.raw_headers as Record<string, unknown> | null)) {
          const pid = msgIdToPerson.get(lp);
          if (pid) {
            personIds.add(pid);
            threadHits++;
          }
        }
        // Campaign-reply domain extraction (subject scoped to our campaign).
        if (CAMPAIGN_SUBJECT_RE.test(r.subject ?? "") && addr) {
          campaignReplyAddresses.add(addr);
          const domain = addr.split("@")[1];
          if (domain && !PERSONAL_DOMAINS.has(domain)) campaignReplyDomains.add(domain);
        }
      }
      perAccount += data.length;
      if (data.length < PAGE) break;
      from += PAGE;
    }
    console.log(`  ${account}: ${perAccount} inbound_emails rows`);
  }
  console.log(`Total inbound rows scanned:        ${inboundCount}`);
  console.log(`Unique reply from-addresses:       ${addresses.size}`);
  console.log(`Unique campaign repliers:          ${campaignReplyAddresses.size}`);
  console.log(`Corporate domains of repliers:     ${campaignReplyDomains.size} (${[...campaignReplyDomains].sort().join(", ")})`);
  console.log(`Correlated person_ids:             ${personIds.size}`);
  console.log(`  (thread-match In-Reply-To hits:  ${threadHits})`);
  return { addresses, personIds, campaignReplyDomains, campaignReplyAddresses };
}

async function main() {
  console.log("Loading send log...");
  const { msgIdToPerson } = loadSendLogIndex();
  console.log(`  send log entries (with messageId+person_id): ${msgIdToPerson.size}`);
  console.log("Fetching inbound emails for", ACCOUNTS.join(", "), "...");
  const { addresses: repliedAddresses, personIds: repliedPersonIds, campaignReplyDomains, campaignReplyAddresses } = await fetchReplies(msgIdToPerson);
  // Union: repliedAddresses already includes campaign repliers (campaign repliers ⊂ all from-addresses).
  for (const a of campaignReplyAddresses) repliedAddresses.add(a);

  const fastmailSentAddrs = new Set<string>();
  if (existsSync(FASTMAIL_SENT_PATH)) {
    const j = JSON.parse(readFileSync(FASTMAIL_SENT_PATH, "utf8")) as { addresses?: string[] };
    for (const a of j.addresses ?? []) fastmailSentAddrs.add(a.toLowerCase().trim());
    console.log(`Fastmail Sent recipients (wes/jb outbound): ${fastmailSentAddrs.size}`);
  } else {
    console.log(`(no ${FASTMAIL_SENT_PATH} — skipping Fastmail Sent dedupe)`);
  }

  const text = readFileSync(SOURCE, "utf8");
  const rows = parseCsv(text);
  const headers = rows[0];
  const idx = Object.fromEntries(headers.map((h, i) => [h, i] as const));

  const out: string[] = [headers.join(",")];
  const stats = { q1: 0, q2: 0, q3: 0, q4: 0, kept: 0, repliedByEmail: 0, repliedByPerson: 0, repliedByDomain: 0, fastmailSent: 0, otherQuad: 0, noEmail: 0, dupe: 0 };
  const seenEmail = new Set<string>();
  const fastmailExcluded: string[] = [];
  const domainExcluded: string[] = [];

  for (const r of rows.slice(1)) {
    const q = r[idx["quadrant"]];
    if (!QUADRANTS.has(q)) { stats.otherQuad++; continue; }
    const email = (r[idx["email"]] || "").toLowerCase().trim();
    const pid = r[idx["person_id"]];
    if (!email) { stats.noEmail++; continue; }
    if (repliedAddresses.has(email)) { stats.repliedByEmail++; continue; }
    if (pid && repliedPersonIds.has(pid)) { stats.repliedByPerson++; continue; }
    const recipientDomain = email.split("@")[1] ?? "";
    if (recipientDomain && campaignReplyDomains.has(recipientDomain)) {
      stats.repliedByDomain++;
      domainExcluded.push(`${email} (${recipientDomain})`);
      continue;
    }
    if (fastmailSentAddrs.has(email)) {
      stats.fastmailSent++;
      fastmailExcluded.push(email);
      continue;
    }
    if (seenEmail.has(email)) { stats.dupe++; continue; }
    seenEmail.add(email);
    out.push(headers.map((h) => csv(r[idx[h]])).join(","));
    stats.kept++;
    if (q === "1") stats.q1++;
    else if (q === "2") stats.q2++;
    else if (q === "3") stats.q3++;
    else if (q === "4") stats.q4++;
  }

  writeFileSync(OUT, out.join("\n") + "\n");
  console.log(`\nWrote: ${OUT}`);
  console.log(`Kept (Q1-4, unique, no reply): ${stats.kept}  [Q1=${stats.q1}, Q2=${stats.q2}, Q3=${stats.q3}, Q4=${stats.q4}]`);
  console.log(`Excluded — replied (from match):    ${stats.repliedByEmail}`);
  console.log(`Excluded — replied (person match):  ${stats.repliedByPerson}`);
  console.log(`Excluded — replied (domain match):  ${stats.repliedByDomain}`);
  if (domainExcluded.length) for (const x of domainExcluded) console.log(`  ${x}`);
  console.log(`Excluded — Fastmail Sent recipient: ${stats.fastmailSent}`);
  if (fastmailExcluded.length) console.log(`  ${fastmailExcluded.join(", ")}`);
  console.log(`Excluded — duplicate email:         ${stats.dupe}`);
  console.log(`Excluded — no email:                ${stats.noEmail}`);
  console.log(`Excluded — out-of-scope quadrant:   ${stats.otherQuad}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
