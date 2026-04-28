import { parse } from "csv-parse/sync";
import { readFileSync, writeFileSync, mkdirSync } from "fs";

const INPUT = "consensus/consensus_contacts_enriched.csv";
const OUT_DIR = "consensus/employee_agent_inputs";

const rows = parse(readFileSync(INPUT, "utf-8"), {
  columns: true,
  skip_empty_lines: true,
  bom: true,
}) as Record<string, string>[];

const employees = rows.filter((r) => r.consensus_direct_participant === "false");
console.log(`Total employees: ${employees.length}`);

function classify(r: Record<string, string>) {
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

const enriched = employees.map((r) => {
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

const withEmail = enriched.filter((e) => e.email).length;
const wes = enriched.filter((e) => e.is_c_level === "true").length;
const jb = enriched.filter((e) => e.is_c_level === "false").length;
console.log(`  With email:           ${withEmail}`);
console.log(`  Wes targets (C-level):${wes}`);
console.log(`  JB targets (other):   ${jb}`);
console.log(`  Founders:             ${enriched.filter((e) => e.is_founder === "true").length}`);
console.log(`  Large org:            ${enriched.filter((e) => e.is_large_org === "true").length}`);

// 8 shards
const N = 8;
const chunkSize = Math.ceil(enriched.length / N);
mkdirSync(OUT_DIR, { recursive: true });

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
  "org_name",
  "org_industry",
  "org_description",
  "org_employee_count",
  "org_hq_location",
  "org_icp_score",
  "org_icp_reason",
  "org_category",
  "consensus_role",
  "consensus_sponsor_tier",
];

for (let i = 0; i < N; i++) {
  const chunk = enriched.slice(i * chunkSize, (i + 1) * chunkSize);
  if (chunk.length === 0) continue;
  const trimmed = chunk.map((r) => {
    const o: Record<string, string> = {};
    for (const f of agentFields) o[f] = r[f] ?? "";
    return o;
  });
  const path = `${OUT_DIR}/agent_${i + 1}.json`;
  writeFileSync(path, JSON.stringify(trimmed, null, 2), "utf8");
  console.log(`→ ${path} (${trimmed.length} employees)`);
}

// Classified reference CSV
const allHeaders = Object.keys(enriched[0]);
const lines = [allHeaders.join(",")];
for (const r of enriched) {
  lines.push(
    allHeaders
      .map((h) => {
        const v = r[h] ?? "";
        return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
      })
      .join(",")
  );
}
writeFileSync("consensus/employees_classified.csv", lines.join("\n") + "\n", "utf8");
console.log(`\n→ consensus/employees_classified.csv (${enriched.length} rows)`);
