import { parse } from "csv-parse/sync";
import { readFileSync, writeFileSync } from "fs";

function csvEscape(v: string | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const rows = parse(readFileSync("consensus/outreach_messages.csv", "utf-8"), {
  columns: true,
  skip_empty_lines: true,
  bom: true,
}) as Record<string, string>[];

// Pools of subject templates. Each returns a subject string.
// Variables: ${first} ${org} ${firstOrTitle}
//
// Strategy per segment:
// - Wes → C-level: measured, peer-tone, low-commitment hooks, sometimes name
// - JB → non-C-level: slightly warmer, event-forward, sometimes "hey {name}"
// - Founders: can tilt toward the Wednesday dinner framing
// - Large org execs: lean on professionalism / "while you're at Consensus"

type Ctx = { first: string; org: string; isFounder: boolean; isCLevel: boolean; isLargeOrg: boolean };

const wesPool: ((c: Ctx) => string)[] = [
  (c) => `${c.first}, while you're at Consensus`,
  (c) => `Quick note before Consensus Miami`,
  (c) => `Something small during Consensus week`,
  (c) => c.isFounder ? `A founders' dinner ask, ${c.first}` : `Worth a look for Consensus week`,
  (c) => c.org ? `${c.org}-adjacent: FP Block at Consensus` : `FP Block at Consensus — worth a look`,
  (c) => `${c.first} — a Wednesday dinner at Consensus`,
  (c) => c.isFounder ? `Two rooms for founders at Consensus` : `Two rooms at Consensus worth a look`,
  (c) => `${c.first}, ahead of your Consensus week`,
];

const jbPool: ((c: Ctx) => string)[] = [
  (c) => `Hey ${c.first} — an invite for Consensus week`,
  (c) => `${c.first}, something for your Miami week`,
  (c) => `Quick invite while you're at Consensus`,
  (c) => `Consensus week in Miami — small room`,
  (c) => c.isFounder ? `${c.first}, a founders' dinner at Consensus` : `${c.first}, an invite during Consensus`,
  (c) => c.org ? `Hey ${c.first} — ${c.org} at Consensus` : `Hey ${c.first} — ahead of Consensus`,
  (c) => `Something small during Consensus, ${c.first}`,
  (c) => `${c.first} — two FP Block rooms in Miami`,
];

// Deterministic pick from pool based on person_id hash
function hashPick<T>(pool: T[], personId: string): T {
  let h = 0;
  for (let i = 0; i < personId.length; i++) h = (h * 31 + personId.charCodeAt(i)) | 0;
  return pool[Math.abs(h) % pool.length];
}

function getFirstName(full: string): string {
  if (!full) return "";
  const trimmed = full.replace(/^(Dr\.|Mr\.|Mrs\.|Ms\.|Rep\.|Sen\.|Senator|Prof\.)\s+/i, "");
  return trimmed.split(/\s+/)[0] ?? "";
}

function titleCaseOrg(org: string): string {
  return org.trim();
}

const updated = rows.map((r) => {
  const first = getFirstName(r.full_name);
  const ctx: Ctx = {
    first,
    org: titleCaseOrg(r.org_name || ""),
    isFounder: r.is_founder === "true",
    isCLevel: r.is_c_level === "true",
    isLargeOrg: r.is_large_org === "true",
  };
  const pool = r.sender_email === "wes@gofpblock.com" ? wesPool : jbPool;
  const pick = hashPick(pool, r.person_id);
  const subject = pick(ctx).replace(/\s+/g, " ").trim();
  return { ...r, subject };
});

// Write back
const headers = Object.keys(updated[0]);
const lines = [headers.join(",")];
for (const r of updated) {
  lines.push(headers.map((h) => csvEscape(r[h])).join(","));
}
writeFileSync("consensus/outreach_messages.csv", lines.join("\n") + "\n", "utf8");
console.log(`✓ Updated ${updated.length} subject lines in consensus/outreach_messages.csv`);

// Print distribution
const counts = new Map<string, number>();
updated.forEach((r) => counts.set(r.subject, (counts.get(r.subject) ?? 0) + 1));
const topRepeated = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
console.log(`\nTop 10 most-used subjects:`);
topRepeated.forEach(([s, n]) => console.log(`  ${n}× — ${s}`));
console.log(`\nUnique subject lines: ${counts.size}`);

// Also back-propagate to agent outputs so merge stays in sync if re-run
for (let i = 1; i <= 5; i++) {
  const path = `consensus/outreach_agent_outputs/agent_${i}.json`;
  const arr = JSON.parse(readFileSync(path, "utf-8")) as { person_id: string; subject: string; body: string; notes?: string }[];
  const byId = new Map(updated.map((u) => [u.person_id, u.subject]));
  arr.forEach((m) => {
    const s = byId.get(m.person_id);
    if (s) m.subject = s;
  });
  writeFileSync(path, JSON.stringify(arr, null, 2), "utf8");
}
console.log(`\n✓ Back-propagated subjects to agent_1..5.json`);
