import { parse } from "csv-parse/sync";
import { readFileSync, writeFileSync } from "fs";

const speakers = parse(readFileSync("consensus/employees_classified.csv", "utf-8"), {
  columns: true,
  skip_empty_lines: true,
  bom: true,
}) as Record<string, string>[];

const byId = new Map<string, Record<string, string>>();
speakers.forEach((s) => byId.set(s.person_id, s));

type Msg = { person_id: string; subject: string; body: string; notes?: string };
const all: Msg[] = [];
for (let i = 1; i <= 8; i++) {
  const path = `consensus/employee_agent_outputs/agent_${i}.json`;
  const msgs = JSON.parse(readFileSync(path, "utf-8")) as Msg[];
  all.push(...msgs);
}
console.log(`Merged ${all.length} messages from 8 agent outputs`);
const msgById = new Map<string, Msg>();
all.forEach((m) => msgById.set(m.person_id, m));

function csvEscape(v: string | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const headers = [
  "person_id",
  "full_name",
  "email",
  "linkedin_url",
  "twitter_handle",
  "title",
  "org_name",
  "is_founder",
  "is_c_level",
  "is_large_org",
  "sender_email",
  "landing_page",
  "subject",
  "body",
  "org_icp_score",
  "consensus_sponsor_tier",
  "consensus_role",
  "agent_notes",
];

const lines = [headers.join(",")];
let missing = 0;
const ordered = speakers.slice().sort((a, b) => {
  const ac = a.is_c_level === "true" ? 0 : 1;
  const bc = b.is_c_level === "true" ? 0 : 1;
  if (ac !== bc) return ac - bc;
  const af = a.is_founder === "true" ? 0 : 1;
  const bf = b.is_founder === "true" ? 0 : 1;
  if (af !== bf) return af - bf;
  const ai = parseInt(a.org_icp_score || "0", 10);
  const bi = parseInt(b.org_icp_score || "0", 10);
  return bi - ai;
});

for (const s of ordered) {
  const m = msgById.get(s.person_id);
  if (!m) {
    missing++;
    continue;
  }
  lines.push(
    [
      s.person_id,
      s.full_name,
      s.email,
      s.linkedin_url,
      s.twitter_handle,
      s.title,
      s.org_name,
      s.is_founder,
      s.is_c_level,
      s.is_large_org,
      s.sender_email,
      s.landing_page,
      m.subject,
      m.body,
      s.org_icp_score,
      s.consensus_sponsor_tier,
      s.consensus_role,
      m.notes ?? "",
    ]
      .map(csvEscape)
      .join(",")
  );
}

const out = "consensus/outreach_messages_employees.csv";
writeFileSync(out, lines.join("\n") + "\n", "utf8");
console.log(`\n✓ Wrote ${lines.length - 1} rows → ${out}`);
console.log(`  Missing messages: ${missing}`);

// Stats
const wordCounts = all.map((m) => m.body.split(/\s+/).length);
const avg = Math.round(wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length);
const min = Math.min(...wordCounts);
const max = Math.max(...wordCounts);
const overSpec = wordCounts.filter((w) => w > 80).length;
const underSpec = wordCounts.filter((w) => w < 55).length;
console.log(`\nBody length: avg ${avg} words, range ${min}–${max}`);
console.log(`  Over 80 words: ${overSpec}`);
console.log(`  Under 55 words: ${underSpec}`);

// Banned phrase scan
const banned = ["on behalf of", "Catching that", "FP Block is hosting", "I hope this finds you well", "Looking forward to hearing", "our kind of room", "this cycle", "saw you're speaking at consensus", "on the consensus stage"];
console.log(`\nBanned phrase scan:`);
for (const b of banned) {
  const hits = all.filter((m) => m.body.toLowerCase().includes(b.toLowerCase())).length;
  console.log(`  ${hits ? "FOUND" : "clean"}: "${b}" — ${hits}`);
}

// Sender distribution
const wes = ordered.filter((s) => s.sender_email === "wes@gofpblock.com").length;
const jb = ordered.filter((s) => s.sender_email === "jb@gofpblock.com").length;
const withEmail = ordered.filter((s) => s.email).length;
console.log(`\nSenders: ${wes} wes@ / ${jb} jb@`);
console.log(`With email (can send): ${withEmail} / ${ordered.length}`);
