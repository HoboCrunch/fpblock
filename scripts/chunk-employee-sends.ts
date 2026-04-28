import { parse } from "csv-parse/sync";
import { readFileSync, writeFileSync } from "fs";

const INPUT = "consensus/outreach_messages_employees.csv";

type Row = Record<string, string>;
const rows = parse(readFileSync(INPUT, "utf-8"), {
  columns: true,
  skip_empty_lines: true,
  bom: true,
}) as Row[];

const withEmail = rows.filter((r) => r.email);
console.log(`Total with email: ${withEmail.length}`);

// Cohort classifier — returns 1..10 per the schedule
function cohort(r: Row): number {
  const tier = r.consensus_sponsor_tier;
  const isC = r.is_c_level === "true";
  const isF = r.is_founder === "true";
  if (tier === "platinum" || tier === "gold") return 1;
  if (tier === "silver") return isC ? 2 : 3;
  if (tier === "bronze") return isC ? 4 : 5;
  if (tier === "copper") {
    if (isC && isF) return 6;
    if (isC && !isF) return 7;
    return 8;
  }
  if (tier === "community") return isC ? 9 : 10;
  throw new Error(`Unknown tier: ${tier}`);
}

// Day mapping — per approved schedule
const DAY_MAP: Record<number, number> = {
  1: 1, 2: 1, 3: 1, 4: 1,   // Day 1: cohorts 1-4
  5: 2, 6: 2, 9: 2,          // Day 2: cohorts 5, 6, 9
  7: 3,                       // Day 3: cohort 7
  8: 4,                       // Day 4: cohort 8
  10: 5,                      // Day 5: cohort 10
};

const DAY_LABELS: Record<number, string> = {
  1: "Mon Apr 27 — Top-tier sponsors + Silver/Bronze C-level",
  2: "Tue Apr 28 — Bronze non-C + Copper founders + Community C-level",
  3: "Wed Apr 29 — Copper sponsors, C-level non-founders",
  4: "Thu Apr 30 — Copper sponsors, non-C-level",
  5: "Fri May 1  — Community & Marketing partners, non-C-level",
};

function csvEscape(v: string | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Build day buckets
const byDay = new Map<number, Row[]>();
for (const r of withEmail) {
  const c = cohort(r);
  const day = DAY_MAP[c];
  if (!byDay.has(day)) byDay.set(day, []);
  byDay.get(day)!.push({ ...r, _cohort: String(c) });
}

// Sort within day: C-level first, then founders, then by org ICP desc
const headers = Object.keys(withEmail[0]);
if (!headers.includes("cohort")) headers.push("cohort");

for (const [day, rowsForDay] of [...byDay.entries()].sort((a, b) => a[0] - b[0])) {
  rowsForDay.sort((a, b) => {
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

  const outHeaders = [...headers.filter((h) => h !== "cohort"), "cohort"];
  const lines = [outHeaders.join(",")];
  for (const r of rowsForDay) {
    lines.push(
      outHeaders
        .map((h) => csvEscape(h === "cohort" ? r._cohort : r[h]))
        .join(",")
    );
  }
  const path = `consensus/send_day_${day}.csv`;
  writeFileSync(path, lines.join("\n") + "\n", "utf8");

  const wes = rowsForDay.filter((r) => r.sender_email === "wes@gofpblock.com").length;
  const jb = rowsForDay.filter((r) => r.sender_email === "jb@gofpblock.com").length;
  const cohorts = [...new Set(rowsForDay.map((r) => r._cohort))].sort();
  console.log(`→ ${path}  (${rowsForDay.length} rows, wes ${wes} / jb ${jb}, cohorts [${cohorts.join(", ")}])`);
  console.log(`   ${DAY_LABELS[day]}`);
}

const grandTotal = [...byDay.values()].reduce((a, b) => a + b.length, 0);
console.log(`\n✓ Total scheduled: ${grandTotal} (expected ${withEmail.length})`);
