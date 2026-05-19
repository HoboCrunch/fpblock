// lib/uploads/field-sets.test.ts
import { describe, it, expect } from "vitest";
import {
  PERSON_FIELDS,
  ORGANIZATION_FIELDS,
  fieldSetForMode,
  isValidFieldForMode,
} from "./field-sets";

describe("field sets", () => {
  it("PERSON_FIELDS contains the canonical person fields and event", () => {
    const ids = PERSON_FIELDS.map((f) => f.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "full_name",
        "first_name",
        "last_name",
        "email",
        "linkedin",
        "twitter",
        "telegram",
        "phone",
        "title",
        "seniority",
        "department",
        "organization_name",
        "event",
        "context",
      ])
    );
    expect(ids).not.toContain("name"); // org-only id
  });

  it("ORGANIZATION_FIELDS contains org fields and event but no person ids", () => {
    const ids = ORGANIZATION_FIELDS.map((f) => f.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "name",
        "website",
        "category",
        "linkedin_url",
        "icp_score",
        "icp_reason",
        "industry",
        "employee_count",
        "annual_revenue",
        "founded_year",
        "hq_location",
        "funding_total",
        "latest_funding_stage",
        "event",
      ])
    );
    expect(ids).not.toContain("full_name");
    expect(ids).not.toContain("email");
  });

  it("both sets contain event", () => {
    expect(PERSON_FIELDS.map((f) => f.id)).toContain("event");
    expect(ORGANIZATION_FIELDS.map((f) => f.id)).toContain("event");
  });

  it("fieldSetForMode returns the right set", () => {
    expect(fieldSetForMode("persons")).toBe(PERSON_FIELDS);
    expect(fieldSetForMode("organizations")).toBe(ORGANIZATION_FIELDS);
  });

  it("isValidFieldForMode validates by mode", () => {
    expect(isValidFieldForMode("email", "persons")).toBe(true);
    expect(isValidFieldForMode("email", "organizations")).toBe(false);
    expect(isValidFieldForMode("name", "organizations")).toBe(true);
    expect(isValidFieldForMode("event", "persons")).toBe(true);
    expect(isValidFieldForMode("event", "organizations")).toBe(true);
  });
});
