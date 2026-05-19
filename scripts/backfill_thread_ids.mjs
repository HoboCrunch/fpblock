// Backfill thread_id for existing inbound_emails rows.
//
// Each row's message_id is a JMAP Email ID scoped to a specific Fastmail
// account, so we look it up against the matching identity's token to get
// the JMAP threadId, then UPDATE.
//
// Idempotent: skips rows that already have thread_id set.
// Run:  node scripts/backfill_thread_ids.mjs [--apply]

import { config } from "dotenv";
config({ path: new URL("../.env.local", import.meta.url).pathname });

const APPLY = process.argv.includes("--apply");

const IDENTITIES = [
  { identity: "jb@gofpblock.com", envVar: "FASTMAIL_API_KEY_JB" },
  { identity: "wes@gofpblock.com", envVar: "FASTMAIL_API_KEY_WES" },
];

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.NEXT_SUPABASE_SECRET_KEY;
if (!SUPABASE_URL || !SERVICE) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_SUPABASE_SECRET_KEY");
  process.exit(1);
}

const sbHeaders = {
  apikey: SERVICE,
  Authorization: `Bearer ${SERVICE}`,
  "Content-Type": "application/json",
};

async function getSession(apiKey) {
  const r = await fetch("https://api.fastmail.com/jmap/session", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!r.ok) throw new Error(`session ${r.status}`);
  return r.json();
}

async function jmap(apiUrl, apiKey, methodCalls) {
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

let totalUpdated = 0;
let totalAlreadySet = 0;
let totalMissing = 0;

for (const { identity, envVar } of IDENTITIES) {
  const apiKey = process.env[envVar];
  if (!apiKey) {
    console.warn(`${identity}: ${envVar} missing, skipping`);
    continue;
  }
  const session = await getSession(apiKey);
  const accountId = session.primaryAccounts["urn:ietf:params:jmap:mail"];
  const apiUrl = session.apiUrl;

  // Page through this identity's rows
  const rows = [];
  let from = 0;
  const page = 1000;
  while (true) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/inbound_emails?account_email=eq.${identity}&select=id,message_id,thread_id&order=received_at.desc`,
      { headers: { ...sbHeaders, Range: `${from}-${from + page - 1}` } }
    );
    const batch = await res.json();
    if (!batch.length) break;
    rows.push(...batch);
    if (batch.length < page) break;
    from += page;
  }
  console.log(`\n${identity}: ${rows.length} rows`);

  let updated = 0;
  let alreadySet = 0;
  let missing = 0;

  const chunk = 50;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const ids = slice.filter((r) => !r.thread_id).map((r) => r.message_id);
    alreadySet += slice.length - ids.length;
    if (!ids.length) continue;

    const out = await jmap(apiUrl, apiKey, [
      [
        "Email/get",
        { accountId, ids, properties: ["id", "threadId"] },
        "g",
      ],
    ]);
    const list = out.methodResponses[0][1]?.list || [];
    const byId = new Map(list.map((e) => [e.id, e.threadId]));

    for (const row of slice) {
      if (row.thread_id) continue;
      const tid = byId.get(row.message_id);
      if (!tid) {
        missing++;
        continue;
      }
      console.log(`  ${row.id}  thread=${tid}`);
      if (APPLY) {
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/inbound_emails?id=eq.${row.id}`,
          {
            method: "PATCH",
            headers: { ...sbHeaders, Prefer: "return=minimal" },
            body: JSON.stringify({ thread_id: tid }),
          }
        );
        if (!res.ok) {
          console.error(`    update failed: ${res.status} ${await res.text()}`);
          continue;
        }
      }
      updated++;
    }
  }

  console.log(
    `${identity}: ${APPLY ? "updated" : "would update"} ${updated}, already-set ${alreadySet}, missing-from-jmap ${missing}`
  );
  totalUpdated += updated;
  totalAlreadySet += alreadySet;
  totalMissing += missing;
}

console.log(
  `\nTotal ${APPLY ? "updated" : "would update"}: ${totalUpdated}; already-set ${totalAlreadySet}; missing ${totalMissing}`
);
if (!APPLY) console.log("Re-run with --apply to commit changes.");
