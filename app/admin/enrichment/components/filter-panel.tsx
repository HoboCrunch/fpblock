"use client";

export type TriState = "any" | "present" | "missing";

export interface PersonFilterState {
  search: string;
  eventIds: string[];
  speakerOn: boolean;
  orgAffiliatedOn: boolean;
  initiativeIds: string[];
  savedListIds: string[];
  sources: string[];
  statuses: string[];
  icpMin: number | null;
  icpMax: number | null;
  icpIncludeNull: boolean;
  hasEmail: TriState;
  hasLinkedin: TriState;
  hasTwitter: TriState;
  hasPhone: TriState;
  specificIds: string[] | null;
}

export interface OrgFilterState {
  search: string;
  eventIds: string[];
  initiativeIds: string[];
  categories: string[];
  statuses: string[];
  icpMin: number | null;
  icpMax: number | null;
  icpIncludeNull: boolean;
  hasPeople: TriState;
  specificIds: string[] | null;
}

export const EMPTY_FILTERS_PERSONS: PersonFilterState = {
  search: "",
  eventIds: [],
  speakerOn: true,
  orgAffiliatedOn: true,
  initiativeIds: [],
  savedListIds: [],
  sources: [],
  statuses: [],
  icpMin: null,
  icpMax: null,
  icpIncludeNull: true,
  hasEmail: "any",
  hasLinkedin: "any",
  hasTwitter: "any",
  hasPhone: "any",
  specificIds: null,
};

export const EMPTY_FILTERS_ORGS: OrgFilterState = {
  search: "",
  eventIds: [],
  initiativeIds: [],
  categories: [],
  statuses: [],
  icpMin: null,
  icpMax: null,
  icpIncludeNull: true,
  hasPeople: "any",
  specificIds: null,
};

// Component implementation lands in Task 4. Stub export so other modules
// can import the types now.
export function FilterPanel(): null {
  return null;
}
