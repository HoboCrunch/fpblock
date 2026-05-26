import { describe, it, expect } from "vitest";
import { slugify } from "./slug";

describe("slugify", () => {
  it("replaces spaces with single dashes", () => {
    expect(slugify("EthCC Cannes 2026")).toBe("ethcc-cannes-2026");
  });

  it("lowercases mixed case", () => {
    expect(slugify("DevCon")).toBe("devcon");
  });

  it("replaces punctuation with dashes", () => {
    expect(slugify("ETH/Global: SF!")).toBe("eth-global-sf");
  });

  it("trims leading and trailing separators", () => {
    expect(slugify("  Hello World  ")).toBe("hello-world");
    expect(slugify("---Hello---")).toBe("hello");
  });

  it("collapses multiple separators into one", () => {
    expect(slugify("a   b___c...d")).toBe("a-b-c-d");
  });

  it("returns empty string for empty input", () => {
    expect(slugify("")).toBe("");
  });

  it("returns empty string for punctuation-only input", () => {
    expect(slugify("---")).toBe("");
    expect(slugify("!@#$%^&*()")).toBe("");
    expect(slugify("   ")).toBe("");
  });

  it("preserves alphanumerics", () => {
    expect(slugify("Web3 Summit 42")).toBe("web3-summit-42");
  });
});
