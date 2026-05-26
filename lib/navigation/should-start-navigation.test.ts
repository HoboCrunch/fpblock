import { describe, it, expect } from "vitest";
import { shouldStartNavigation, type NavClickInput } from "./should-start-navigation";

const base: NavClickInput = {
  destUrl: new URL("https://app.test/admin/contacts"),
  currentUrl: new URL("https://app.test/admin/sequences"),
  target: null,
  hasDownload: false,
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  defaultPrevented: false,
};

describe("shouldStartNavigation", () => {
  it("starts for a plain left-click to a different same-origin path", () => {
    expect(shouldStartNavigation(base)).toBe(true);
  });

  it("ignores modified clicks (cmd/ctrl/shift/alt)", () => {
    expect(shouldStartNavigation({ ...base, metaKey: true })).toBe(false);
    expect(shouldStartNavigation({ ...base, ctrlKey: true })).toBe(false);
    expect(shouldStartNavigation({ ...base, shiftKey: true })).toBe(false);
    expect(shouldStartNavigation({ ...base, altKey: true })).toBe(false);
  });

  it("ignores non-left mouse buttons", () => {
    expect(shouldStartNavigation({ ...base, button: 1 })).toBe(false);
  });

  it("ignores already-prevented events", () => {
    expect(shouldStartNavigation({ ...base, defaultPrevented: true })).toBe(false);
  });

  it("ignores new-tab and download links", () => {
    expect(shouldStartNavigation({ ...base, target: "_blank" })).toBe(false);
    expect(shouldStartNavigation({ ...base, hasDownload: true })).toBe(false);
  });

  it("allows explicit target=_self", () => {
    expect(shouldStartNavigation({ ...base, target: "_self" })).toBe(true);
  });

  it("ignores external origins", () => {
    expect(
      shouldStartNavigation({ ...base, destUrl: new URL("https://other.test/admin/x") })
    ).toBe(false);
  });

  it("ignores non-http(s) protocols (mailto, tel)", () => {
    expect(
      shouldStartNavigation({ ...base, destUrl: new URL("mailto:a@b.com") })
    ).toBe(false);
    expect(
      shouldStartNavigation({ ...base, destUrl: new URL("tel:+15551234567") })
    ).toBe(false);
  });

  it("ignores same-path navigations (query-only / hash-only / self)", () => {
    expect(
      shouldStartNavigation({
        ...base,
        destUrl: new URL("https://app.test/admin/sequences?tab=lists"),
      })
    ).toBe(false);
    expect(
      shouldStartNavigation({
        ...base,
        destUrl: new URL("https://app.test/admin/sequences#section"),
      })
    ).toBe(false);
  });
});
