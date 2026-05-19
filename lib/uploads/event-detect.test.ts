import { describe, it, expect } from "vitest";
import { partitionEventNames, normalizeEventName } from "./event-detect";

describe("normalizeEventName", () => {
  it("lowercases and collapses whitespace", () => {
    expect(normalizeEventName("  EthCC  Cannes  ")).toBe("ethcc cannes");
  });
});

describe("partitionEventNames", () => {
  it("separates known from unknown using a case-insensitive name map", () => {
    const eventsByNormalized = new Map<string, string>([
      ["ethcc cannes", "evt_1"],
      ["eth sf", "evt_2"],
    ]);
    const result = partitionEventNames(
      ["EthCC Cannes", "EthCC Cannes", "ETHCC SF Hack", "  ", "ETH SF"],
      eventsByNormalized,
    );
    expect(result.known).toEqual({
      "EthCC Cannes": "evt_1",
      "ETH SF": "evt_2",
    });
    expect(result.unknown).toEqual(["ETHCC SF Hack"]);
  });

  it("returns empty arrays for empty input", () => {
    expect(partitionEventNames([], new Map())).toEqual({ known: {}, unknown: [] });
  });
});
