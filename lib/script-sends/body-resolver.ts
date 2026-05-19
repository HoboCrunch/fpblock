import { readFileSync, existsSync } from "fs";
import { parse } from "csv-parse/sync";

/**
 * Index keyed by `${person_id}::${subject}` → body. First-match-wins across CSVs
 * because the script's source-of-truth is whatever was rendered to the recipient
 * first, and the napalm CSVs sometimes contain stale "regenerated" variants.
 */
export type BodyIndex = Map<string, string>;

function keyFor(personId: string, subject: string): string {
  return `${personId}::${subject}`;
}

export function buildBodyIndex(csvPaths: string[]): BodyIndex {
  const index: BodyIndex = new Map();
  for (const path of csvPaths) {
    if (!existsSync(path)) continue;
    let rows: Array<Record<string, string>>;
    try {
      rows = parse(readFileSync(path, "utf-8"), {
        columns: true,
        skip_empty_lines: true,
        bom: true,
      });
    } catch {
      continue;
    }
    for (const r of rows) {
      const pid = r.person_id;
      const subj = r.subject;
      const body = r.body;
      if (!pid || !subj || body == null) continue;
      const k = keyFor(pid, subj);
      if (!index.has(k)) index.set(k, body);
    }
  }
  return index;
}

export function resolveBody(
  index: BodyIndex,
  personId: string,
  subject: string
): string | null {
  return index.get(keyFor(personId, subject)) ?? null;
}
