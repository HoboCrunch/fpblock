import { parse } from "csv-parse/sync";
import { readFileSync, writeFileSync } from "fs";

const speakers = parse(readFileSync("consensus/speakers_classified.csv", "utf-8"), {
  columns: true,
  skip_empty_lines: true,
  bom: true,
}) as Record<string, string>[];

const speakerById = new Map<string, Record<string, string>>();
speakers.forEach((s) => speakerById.set(s.person_id, s));

type Msg = { person_id: string; subject: string; body: string; notes?: string };
const allMsgs: Msg[] = [];
for (let i = 1; i <= 5; i++) {
  const msgs = JSON.parse(readFileSync(`consensus/outreach_agent_outputs/agent_${i}.json`, "utf-8")) as Msg[];
  allMsgs.push(...msgs);
}
console.log(`Merged ${allMsgs.length} messages from 5 agent outputs`);

const msgById = new Map<string, Msg>();
allMsgs.forEach((m) => msgById.set(m.person_id, m));

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
  "consensus_talk_title",
  "agent_notes",
];

const lines = [headers.join(",")];
let missing = 0;
let noEmail = 0;
const speakerList = speakers.slice().sort((a, b) => {
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

for (const s of speakerList) {
  const m = msgById.get(s.person_id);
  if (!m) {
    missing++;
    continue;
  }
  if (!s.email) noEmail++;
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
      s.consensus_talk_title,
      m.notes ?? "",
    ]
      .map(csvEscape)
      .join(",")
  );
}

const out = "consensus/outreach_messages.csv";
writeFileSync(out, lines.join("\n") + "\n", "utf8");
console.log(`\n✓ Wrote ${lines.length - 1} rows → ${out}`);
console.log(`  Missing messages (no agent output for speaker): ${missing}`);
console.log(`  Rows without email on record: ${noEmail}`);

// Summary by sender / segment
const wes = speakerList.filter((s) => msgById.has(s.person_id) && s.sender_email === "wes@gofpblock.com").length;
const jb = speakerList.filter((s) => msgById.has(s.person_id) && s.sender_email === "jb@gofpblock.com").length;
const founders = speakerList.filter((s) => msgById.has(s.person_id) && s.is_founder === "true").length;
const cLevel = speakerList.filter((s) => msgById.has(s.person_id) && s.is_c_level === "true").length;
const large = speakerList.filter((s) => msgById.has(s.person_id) && s.is_large_org === "true").length;

console.log(`\n=== Breakdown ===`);
console.log(`  Wes (C-level):    ${wes}`);
console.log(`  JB (other):       ${jb}`);
console.log(`  Founders:         ${founders}`);
console.log(`  C-level:          ${cLevel}`);
console.log(`  Large org (500+): ${large}`);

// Average body length check
const wordCounts = allMsgs.map((m) => m.body.split(/\s+/).length);
const avgWords = Math.round(wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length);
const minW = Math.min(...wordCounts);
const maxW = Math.max(...wordCounts);
console.log(`\nBody length: avg ${avgWords} words, range ${minW}–${maxW}`);
