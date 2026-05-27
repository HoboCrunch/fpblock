import { describe, it, expect } from "vitest";
import { hasSendableContent } from "@/app/api/sequences/send/route";

// FIX A — never ship an empty-body email to a real contact.
//
// When AI generation fails for a step, generate.ts records a 'failed'
// interaction with no subject/body. If that row is later retried/rescheduled,
// the sender previously fell back to `subject || "(no subject)"` and
// `body || ""`, dispatching a blank email. `hasSendableContent` is the
// fail-safe guard the sender consults before calling SendGrid.

describe("hasSendableContent", () => {
  it("rejects a null body", () => {
    expect(hasSendableContent("Subject", null)).toBe(false);
  });

  it("rejects an empty-string body", () => {
    expect(hasSendableContent("Subject", "")).toBe(false);
  });

  it("rejects a whitespace-only body", () => {
    expect(hasSendableContent("Subject", "   \n\t  ")).toBe(false);
  });

  it("rejects a null subject", () => {
    expect(hasSendableContent(null, "Hello there, real body.")).toBe(false);
  });

  it("rejects a whitespace-only subject", () => {
    expect(hasSendableContent("   ", "Hello there, real body.")).toBe(false);
  });

  it("accepts a row with real subject and body", () => {
    expect(hasSendableContent("Quick intro", "Hi Ada, ...")).toBe(true);
  });
});
