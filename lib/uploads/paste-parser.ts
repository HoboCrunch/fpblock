import Papa from "papaparse";

export function parseClipboard(text: string): string[][] {
  const trimmed = text.replace(/\r\n/g, "\n").replace(/\n+$/, "");
  if (!trimmed.trim()) return [];

  const hasTab = trimmed.includes("\t");
  const hasNewline = trimmed.includes("\n");

  // Plain single value (no delimiters at all) — return 1x1
  if (!hasTab && !hasNewline && !trimmed.includes(",")) {
    return [[trimmed]];
  }

  const delimiter = hasTab ? "\t" : ",";
  const result = Papa.parse<string[]>(trimmed, {
    delimiter,
    skipEmptyLines: true,
  });

  return (result.data as string[][]).filter((row) => row.length > 0);
}
