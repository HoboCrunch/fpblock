import { describe, it, expect } from "vitest";
import { buildBodyIndex, resolveBody } from "./body-resolver";
import { writeFileSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

function writeCsv(rows: Array<Record<string, string>>): string {
  const dir = mkdtempSync(join(tmpdir(), "body-resolver-"));
  const file = join(dir, "rows.csv");
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(headers.map((h) => `"${(r[h] ?? "").replace(/"/g, '""')}"`).join(","));
  }
  writeFileSync(file, lines.join("\n"));
  return file;
}

describe("buildBodyIndex + resolveBody", () => {
  it("indexes by (person_id, subject) and resolves a match", () => {
    const csv = writeCsv([
      { person_id: "p1", subject: "Hi Alice", body: "Body for Alice" },
      { person_id: "p2", subject: "Hi Bob", body: "Body for Bob" },
    ]);
    const index = buildBodyIndex([csv]);
    expect(resolveBody(index, "p1", "Hi Alice")).toBe("Body for Alice");
    expect(resolveBody(index, "p2", "Hi Bob")).toBe("Body for Bob");
  });

  it("returns null on miss", () => {
    const csv = writeCsv([{ person_id: "p1", subject: "Hi", body: "x" }]);
    const index = buildBodyIndex([csv]);
    expect(resolveBody(index, "p1", "Different")).toBeNull();
    expect(resolveBody(index, "p2", "Hi")).toBeNull();
  });

  it("merges multiple CSVs; first-match-wins on key collision", () => {
    const a = writeCsv([{ person_id: "p1", subject: "S", body: "from-a" }]);
    const b = writeCsv([{ person_id: "p1", subject: "S", body: "from-b" }]);
    const index = buildBodyIndex([a, b]);
    expect(resolveBody(index, "p1", "S")).toBe("from-a");
  });

  it("skips CSVs missing person_id/subject/body columns without throwing", () => {
    const csv = writeCsv([{ other: "x" }]);
    const index = buildBodyIndex([csv]);
    expect(resolveBody(index, "p1", "S")).toBeNull();
  });
});
