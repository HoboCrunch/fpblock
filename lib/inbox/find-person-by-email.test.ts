import { describe, it, expect, vi } from "vitest";
import { findPersonByEmail } from "./find-person-by-email";

function mockSupabase(overrides: {
  exactMatch?: { id: string; full_name: string } | null;
  orgs?: Array<{ id: string; name: string; website: string; icp_score: number | null }>;
  personOrg?: { person_id: string } | null;
  person?: { id: string; full_name: string } | null;
}) {
  // Each call to .from() returns a builder whose terminal .single()/.maybeSingle()
  // returns the canned data based on the table being queried.
  const builders: Record<string, unknown> = {
    persons: {
      data: overrides.exactMatch ?? overrides.person ?? null,
    },
    organizations: { data: overrides.orgs ?? [] },
    person_organizations: { data: overrides.personOrg ?? null },
  };
  const from = vi.fn((table: string) => {
    const builder: Record<string, unknown> = {
      select: () => builder,
      ilike: () => builder,
      eq: () => builder,
      limit: () => builder,
      not: () => builder,
      single: async () => ({ data: (builders[table] as { data: unknown }).data }),
      maybeSingle: async () => ({ data: (builders[table] as { data: unknown }).data }),
    };
    return builder;
  });
  return { from } as unknown as Parameters<typeof findPersonByEmail>[0];
}

describe("findPersonByEmail", () => {
  it("returns person on exact email match", async () => {
    const supa = mockSupabase({ exactMatch: { id: "p1", full_name: "Alice" } });
    const result = await findPersonByEmail(supa, "alice@example.com");
    expect(result).toEqual({
      person_id: "p1",
      match_type: "exact_email",
      person: { id: "p1", full_name: "Alice" },
      organization: null,
    });
  });

  it("returns none when no match found anywhere", async () => {
    const supa = mockSupabase({ exactMatch: null, orgs: [] });
    const result = await findPersonByEmail(supa, "nobody@example.com");
    expect(result.match_type).toBe("none");
    expect(result.person_id).toBeNull();
  });
});
