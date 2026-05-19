// lib/uploads/auto-match.test.ts
import { describe, it, expect } from "vitest";
import { autoMatchHeader } from "./auto-match";

describe("autoMatchHeader (persons)", () => {
  it("matches common person headers", () => {
    expect(autoMatchHeader("Name", "persons")).toBe("full_name");
    expect(autoMatchHeader("Full Name", "persons")).toBe("full_name");
    expect(autoMatchHeader("first_name", "persons")).toBe("first_name");
    expect(autoMatchHeader("Email", "persons")).toBe("email");
    expect(autoMatchHeader("LinkedIn URL", "persons")).toBe("linkedin");
    expect(autoMatchHeader("Twitter Handle", "persons")).toBe("twitter");
    expect(autoMatchHeader("Job Title", "persons")).toBe("title");
    expect(autoMatchHeader("Company", "persons")).toBe("organization_name");
    expect(autoMatchHeader("Organization", "persons")).toBe("organization_name");
    expect(autoMatchHeader("Event", "persons")).toBe("event");
    expect(autoMatchHeader("Notes", "persons")).toBe("context");
  });

  it("returns empty string for unknown headers", () => {
    expect(autoMatchHeader("foo bar", "persons")).toBe("");
    expect(autoMatchHeader("", "persons")).toBe("");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(autoMatchHeader("  EMAIL  ", "persons")).toBe("email");
    expect(autoMatchHeader("full-name", "persons")).toBe("full_name");
  });
});

describe("autoMatchHeader (organizations)", () => {
  it("matches common organization headers", () => {
    expect(autoMatchHeader("Company Name", "organizations")).toBe("name");
    expect(autoMatchHeader("Name", "organizations")).toBe("name");
    expect(autoMatchHeader("Website", "organizations")).toBe("website");
    expect(autoMatchHeader("LinkedIn", "organizations")).toBe("linkedin_url");
    expect(autoMatchHeader("Industry", "organizations")).toBe("industry");
    expect(autoMatchHeader("Employees", "organizations")).toBe("employee_count");
    expect(autoMatchHeader("HQ", "organizations")).toBe("hq_location");
    expect(autoMatchHeader("ICP Score", "organizations")).toBe("icp_score");
    expect(autoMatchHeader("Event", "organizations")).toBe("event");
  });

  it("does not match person-only fields in organizations mode", () => {
    expect(autoMatchHeader("Email", "organizations")).toBe("");
    expect(autoMatchHeader("First Name", "organizations")).toBe("");
  });
});
