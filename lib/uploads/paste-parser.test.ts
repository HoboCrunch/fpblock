import { describe, it, expect } from "vitest";
import { parseClipboard } from "./paste-parser";

describe("parseClipboard", () => {
  it("returns a single 1x1 grid for plain text", () => {
    expect(parseClipboard("hello")).toEqual([["hello"]]);
  });

  it("splits TSV (preferred when present)", () => {
    expect(parseClipboard("a\tb\tc\n1\t2\t3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("splits CSV when there are no tabs", () => {
    expect(parseClipboard("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles quoted CSV with commas in values", () => {
    expect(parseClipboard('a,"b,c",d')).toEqual([["a", "b,c", "d"]]);
  });

  it("trims trailing blank lines", () => {
    expect(parseClipboard("a\tb\n1\t2\n\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("returns [] for empty input", () => {
    expect(parseClipboard("")).toEqual([]);
    expect(parseClipboard("   \n  ")).toEqual([]);
  });
});
