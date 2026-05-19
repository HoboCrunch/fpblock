// One-shot: re-fetch To/Cc/Bcc for every inbound_emails row from Fastmail and
// re-assign account_email based on which managed identity is in the recipients.
//
// Background: until this fix, both jb@ and wes@ identities shared the same
// Fastmail JMAP inbox and the global UNIQUE(message_id) constraint meant the
// first inserter won — wes lost ~48 rows to jb. This script corrects historical
// account_email values without re-running the JMAP fetch loop.
//
// Run:  node scripts/backfill_inbox_account_email.mjs [--apply]
// Without --apply it prints what would change (dry run).

import { config } from "dotenv";
config({ path: new URL("../.env.local", import.meta.url).pathname });

const APPLY = process.argv.includes("--apply");

const apiKey = process.env.FASTMAIL_API_KEY_JB;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.NEXT_SUPABASE_SECRET_KEY;
if (!apiKey || !SUPABASE_URL || !SERVICE) {
  console.error("Missing env: FASTMAIL_API_KEY_JB / NEXT_PUBLIC_SUPABASE_URL / NEXT_SUPABASE_SECRET_KEY");
  process.exit(1);
}

const IDENTITIES = ["jb@gofpblock.com", "wes@gofpblock.com"].map((e) =>
  e.toLowerCase()
);

const sbHeaders = {
  apikey: SERVICE,
  Authorization: `Bearer ${SERVICE}`,
  "Content-Type": "application/json",
};

const session = await fetch("https://api.fastmail.com/jmap/session", {
  headers: { Authorization: `Bearer ${apiKey}` },
}).then((r) => r.json());
const accountId = Object.values(session.primaryAccounts)[0];
const apiUrl = session.apiUrl;

async function jmap(methodCalls) {
  const r = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
      methodCalls,
    }),
  });
  if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
  return r.json();
}

// Page through all rows
const rows = [];
let from = 0;
const pageSize = 1000;
while (true) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/inbound_emails?select=id,message_id,account_email&order=received_at.desc`,
    { headers: { ...sbHeaders, Range: `${from}-${from + pageSize - 1}` } }
  );
  const batch = await res.json();
  if (!batch.length) break;
  rows.push(...batch);
  if (batch.length < pageSize) break;
  from += pageSize;
}
console.log(`Loaded ${rows.length} inbound_emails rows.`);

// Resolve recipients in JMAP batches of 50
let updates = 0;
let unchanged = 0;
let missing = 0;
const chunk = 50;
for (let i = 0; i < rows.length; i += chunk) {
  const slice = rows.slice(i, i + chunk);
  const ids = slice.map((r) => r.message_id);
  const out = await jmap([
    [
      "Email/get",
      { accountId, ids, properties: ["id", "to", "cc", "bcc"] },
      "g",
    ],
  ]);
  const list = out.methodResponses[0][1].list;
  const byId = new Map(list.map((e) => [e.id, e]));

  const pending = [];
  for (const row of slice) {
    const email = byId.get(row.message_id);
    if (!email) {
      missing++;
      continue;
    }
    const recipients = [
      ...(email.to || []),
      ...(email.cc || []),
      ...(email.bcc || []),
    ]
      .map((r) => r.email?.toLowerCase())
      .filter(Boolean);
    const matched = IDENTITIES.find((id) => recipients.includes(id));
    if (!matched) {
      // No managed identity in recipients — leave alone
      unchanged++;
      continue;
    }
    if (matched === row.account_email.toLowerCase()) {
      unchanged++;
      continue;
    }
    pending.push({ id: row.id, from: row.account_email, to: matched });
  }

  for (const u of pending) {
    console.log(`  ${u.id}  ${u.from}  →  ${u.to}`);
    if (APPLY) {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/inbound_emails?id=eq.${u.id}`,
        {
          method: "PATCH",
          headers: { ...sbHeaders, Prefer: "return=minimal" },
          body: JSON.stringify({ account_email: u.to }),
        }
      );
      if (!res.ok) {
        console.error(`    update failed: ${res.status} ${await res.text()}`);
        continue;
      }
    }
    updates++;
  }
}

console.log(
  `\n${APPLY ? "Applied" : "Would apply"}: ${updates} updates, ${unchanged} unchanged, ${missing} not found in Fastmail`
);
if (!APPLY) console.log("Re-run with --apply to commit changes.");
