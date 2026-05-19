// Pull all email addresses Wes and JB have replied/sent-to from Fastmail's Sent mailbox.
// Output: scripts/_fastmail_sent_to.json — { addresses: string[], count, sample }

import { config } from "dotenv";
import { writeFileSync } from "node:fs";

config({ path: ".env.local" });

const SESSION_URL = "https://api.fastmail.com/jmap/session";
const ACCOUNTS: { identity: string; envVar: string }[] = [
  { identity: "wes@gofpblock.com", envVar: "FASTMAIL_API_KEY_WES" },
  { identity: "jb@gofpblock.com", envVar: "FASTMAIL_API_KEY_JB" },
];
const OUT = "scripts/_fastmail_sent_to.json";
const PAGE_SIZE = 200;
const MAX_PAGES = 100; // 20k messages cap; way more than needed

interface Session {
  apiUrl: string;
  primaryAccounts: Record<string, string>;
  accounts: Record<string, { name: string }>;
}

async function getSession(apiKey: string): Promise<Session> {
  const r = await fetch(SESSION_URL, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!r.ok) throw new Error(`session ${r.status}`);
  return r.json();
}

async function jmap(apiUrl: string, apiKey: string, methodCalls: unknown[]): Promise<{ methodResponses: unknown[][] }> {
  const r = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
      methodCalls,
    }),
  });
  if (!r.ok) throw new Error(`jmap ${r.status} ${await r.text()}`);
  return r.json();
}

async function findSentMailboxId(apiUrl: string, apiKey: string, accountId: string): Promise<string | null> {
  const res = await jmap(apiUrl, apiKey, [["Mailbox/query", { accountId, filter: { role: "sent" } }, "q"]]);
  const [, result] = res.methodResponses[0] as [string, { ids: string[] }];
  return result.ids?.[0] ?? null;
}

async function pullSentRecipients(apiUrl: string, apiKey: string, accountId: string, fromEmail: string): Promise<{ to: Set<string>; messages: number }> {
  const sentId = await findSentMailboxId(apiUrl, apiKey, accountId);
  if (!sentId) throw new Error(`no Sent mailbox for ${fromEmail}`);

  const to = new Set<string>();
  let messages = 0;
  let position = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await jmap(apiUrl, apiKey, [
      ["Email/query", {
        accountId,
        filter: { inMailbox: sentId, from: fromEmail },
        sort: [{ property: "receivedAt", isAscending: false }],
        position,
        limit: PAGE_SIZE,
        calculateTotal: page === 0,
      }, "q"],
      ["Email/get", {
        accountId,
        "#ids": { resultOf: "q", name: "Email/query", path: "/ids" },
        properties: ["id", "to", "cc"],
      }, "g"],
    ]);
    const [, qResult] = res.methodResponses[0] as [string, { ids: string[]; total?: number }];
    const [, gResult] = res.methodResponses[1] as [string, { list: { id: string; to?: { email: string }[] | null; cc?: { email: string }[] | null }[] }];
    const list = gResult?.list ?? [];
    if (list.length === 0) break;
    for (const m of list) {
      messages++;
      for (const r of m.to ?? []) if (r.email) to.add(r.email.toLowerCase().trim());
      for (const r of m.cc ?? []) if (r.email) to.add(r.email.toLowerCase().trim());
    }
    if (list.length < PAGE_SIZE) break;
    position += PAGE_SIZE;
  }
  return { to, messages };
}

async function main() {
  const all = new Set<string>();
  const summary: Record<string, { messages: number; uniqueRecipients: number }> = {};

  for (const { identity, envVar } of ACCOUNTS) {
    const apiKey = process.env[envVar];
    if (!apiKey) {
      console.warn(`  ${identity}: ${envVar} not set — skipping`);
      summary[identity] = { messages: 0, uniqueRecipients: 0 };
      continue;
    }
    const session = await getSession(apiKey);
    const apiUrl = session.apiUrl;
    const mailAccountId = session.primaryAccounts["urn:ietf:params:jmap:mail"];
    if (!mailAccountId) throw new Error(`no mail account in session for ${identity}`);

    const { to, messages } = await pullSentRecipients(apiUrl, apiKey, mailAccountId, identity);
    summary[identity] = { messages, uniqueRecipients: to.size };
    for (const a of to) all.add(a);
    console.log(`  ${identity}: ${messages} sent messages, ${to.size} unique recipient addrs`);
  }

  const out = {
    generatedAt: new Date().toISOString(),
    accounts: summary,
    totalUniqueRecipients: all.size,
    addresses: [...all].sort(),
  };
  writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(`Total unique addresses Wes/JB sent to: ${all.size}`);
  console.log(`Wrote: ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
