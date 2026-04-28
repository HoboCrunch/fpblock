import { parse } from "csv-parse/sync";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { config } from "dotenv";

config({ path: ".env.local" });

type ContactRow = Record<string, string>;

const INPUT = "consensus/consensus_contacts_enriched.csv";
const OUT_DIR = "consensus/outreach_agent_inputs";

const rows = parse(readFileSync(INPUT, "utf-8"), {
  columns: true,
  skip_empty_lines: true,
  bom: true,
}) as ContactRow[];

const speakers = rows.filter((r) => r.consensus_direct_participant === "true");
console.log(`Total speakers: ${speakers.length}`);

function nz(s: string): string | null {
  return s?.trim() ? s.trim() : null;
}

function classify(r: ContactRow) {
  const title = (r.title ?? "").toLowerCase();
  const seniority = (r.seniority ?? "").toLowerCase();

  const isFounder =
    /\bfounder\b|\bco[- ]?founder\b/.test(title) || seniority === "founder";

  const cLevelTitle =
    /\bceo\b|\bcto\b|\bcfo\b|\bcoo\b|\bcmo\b|\bciso\b|\bcso\b|\bcpo\b|\bcro\b|\bcio\b|\bchief\b|\bpresident\b|\bchairman\b|\bchairperson\b|\bchair\b|\bmanaging partner\b|\bmanaging director\b|\bgeneral partner\b|\bexecutive director\b/.test(
      title
    );
  const isCLevel = cLevelTitle || seniority === "c_suite";

  const empCount = r.org_employee_count ? parseInt(r.org_employee_count, 10) : null;
  const isLargeOrg = empCount != null && empCount >= 500;

  return { isFounder, isCLevel, isLargeOrg };
}

const enriched = speakers.map((r) => {
  const { isFounder, isCLevel, isLargeOrg } = classify(r);
  return {
    ...r,
    is_founder: isFounder ? "true" : "false",
    is_c_level: isCLevel ? "true" : "false",
    is_large_org: isLargeOrg ? "true" : "false",
    sender_email: isCLevel ? "wes@gofpblock.com" : "jb@gofpblock.com",
    landing_page: isCLevel ? "https://fpblock.com/wes" : "https://fpblock.com/jb",
  };
});

// Segment summary
const seg = new Map<string, number>();
enriched.forEach((e) => {
  const key = `${e.is_c_level === "true" ? "C" : "nC"}|${e.is_founder === "true" ? "F" : "nF"}|${e.is_large_org === "true" ? "L" : "S"}`;
  seg.set(key, (seg.get(key) ?? 0) + 1);
});
console.log("Segment distribution (C/nC | F/nF | L/S):");
for (const [k, v] of [...seg.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);

// How many have contactable email?
const withEmail = enriched.filter((e) => e.email).length;
console.log(`\nSpeakers with email: ${withEmail}/${enriched.length}`);
console.log(`Wes targets (C-level): ${enriched.filter((e) => e.is_c_level === "true").length}`);
console.log(`JB targets (non-C-level): ${enriched.filter((e) => e.is_c_level === "false").length}`);

// Split into N chunks for parallel agents
const N_AGENTS = 5;
const chunkSize = Math.ceil(enriched.length / N_AGENTS);
mkdirSync(OUT_DIR, { recursive: true });

// Keep only the fields agents need (trim noise)
const agentFields = [
  "person_id",
  "full_name",
  "email",
  "linkedin_url",
  "twitter_handle",
  "title",
  "seniority",
  "department",
  "is_founder",
  "is_c_level",
  "is_large_org",
  "sender_email",
  "landing_page",
  "consensus_talk_title",
  "org_name",
  "org_industry",
  "org_description",
  "org_employee_count",
  "org_hq_location",
  "org_icp_score",
  "org_icp_reason",
  "org_category",
];

for (let i = 0; i < N_AGENTS; i++) {
  const chunk = enriched.slice(i * chunkSize, (i + 1) * chunkSize);
  const trimmed = chunk.map((r) => {
    const o: Record<string, string> = {};
    for (const f of agentFields) o[f] = r[f] ?? "";
    return o;
  });
  const path = `${OUT_DIR}/agent_${i + 1}.json`;
  writeFileSync(path, JSON.stringify(trimmed, null, 2), "utf8");
  console.log(`→ ${path} (${trimmed.length} speakers)`);
}

// Write a combined classified CSV for reference
const allHeaders = Object.keys(enriched[0]);
const csvLines = [allHeaders.join(",")];
for (const r of enriched) {
  csvLines.push(
    allHeaders
      .map((h) => {
        const v = r[h] ?? "";
        return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
      })
      .join(",")
  );
}
writeFileSync("consensus/speakers_classified.csv", csvLines.join("\n") + "\n", "utf8");
console.log(`\n→ consensus/speakers_classified.csv (${enriched.length} rows)`);
