import type {
  PersonFilterState,
  OrgFilterState,
  TriState,
} from "@/app/admin/enrichment/components/filter-panel";

export interface FilterContext {
  /**
   * Set of person ids matching the current (eventIds, relation) selection,
   * fetched via useEventsPersonIds. null when not applicable (orgs tab, or
   * persons tab with no concrete event selection).
   */
  affiliatedPersonIds: Set<string> | null;
}

interface PersonItem {
  id: string;
  full_name: string;
  event_ids?: string[];
  source: string | null;
  enrichment_status: string;
  icp_score: number | null;
  email: string | null;
  linkedin_url: string | null;
  twitter_handle: string | null;
  phone: string | null;
}

interface OrgItem {
  id: string;
  name: string;
  event_ids?: string[];
  category: string | null;
  enrichment_status: string;
  icp_score: number | null;
  enriched_person_count?: number;
}

const NONE_SENTINEL = "__none__";
const NULL_SENTINEL = "__null__";

function checkTriState(value: unknown, state: TriState): boolean {
  if (state === "any") return true;
  const present = value !== null && value !== undefined && value !== "";
  return state === "present" ? present : !present;
}

function inIcpRange(
  score: number | null,
  min: number | null,
  max: number | null,
  includeNull: boolean
): boolean {
  if (score === null) return includeNull;
  if (min !== null && score < min) return false;
  if (max !== null && score > max) return false;
  return true;
}

export function applyFilter<T extends PersonItem | OrgItem>(
  items: T[],
  filter: PersonFilterState | OrgFilterState,
  tab: "persons" | "organizations",
  ctx: FilterContext
): T[] {
  // Build Set once outside the filter callback for O(1) membership checks.
  // Guard: an empty specificIds array is treated as a no-op (not "filter to zero").
  const specificIdSet =
    filter.specificIds && filter.specificIds.length > 0
      ? new Set(filter.specificIds)
      : null;

  return items.filter((item) => {
    if (specificIdSet && !specificIdSet.has(item.id)) return false;

    if (filter.search) {
      const name =
        tab === "persons" ? (item as PersonItem).full_name : (item as OrgItem).name;
      if (!name.toLowerCase().includes(filter.search.toLowerCase())) return false;
    }

    // Event filter
    if (filter.eventIds.length > 0) {
      const itemEvents = item.event_ids ?? [];
      if (filter.eventIds.includes(NONE_SENTINEL)) {
        if (itemEvents.length > 0) return false;
      } else if (tab === "persons" && ctx.affiliatedPersonIds) {
        if (!ctx.affiliatedPersonIds.has(item.id)) return false;
      } else {
        // Orgs tab, or persons fallback: direct event_ids overlap
        if (!itemEvents.some((id) => filter.eventIds.includes(id))) return false;
      }
    }

    // Status
    if (filter.statuses.length > 0) {
      if (!filter.statuses.includes(item.enrichment_status)) return false;
    }

    // ICP
    if (
      filter.icpMin !== null ||
      filter.icpMax !== null ||
      !filter.icpIncludeNull
    ) {
      if (!inIcpRange(item.icp_score, filter.icpMin, filter.icpMax, filter.icpIncludeNull)) {
        return false;
      }
    }

    if (tab === "persons") {
      const p = item as PersonItem;
      const f = filter as PersonFilterState;

      if (f.sources.length > 0) {
        const matchesNull = f.sources.includes(NULL_SENTINEL) && p.source === null;
        const matchesConcrete = p.source !== null && f.sources.includes(p.source);
        if (!matchesNull && !matchesConcrete) return false;
      }

      // initiativeIds, savedListIds: stub-applied below — see Task 6 for data wiring
      // Until item shape includes initiative/list ids, these dimensions are no-ops.
      // (We keep the filter fields wired so the UI works; integration with item data
      // happens when the items hook returns those columns.)

      if (!checkTriState(p.email, f.hasEmail)) return false;
      if (!checkTriState(p.linkedin_url, f.hasLinkedin)) return false;
      if (!checkTriState(p.twitter_handle, f.hasTwitter)) return false;
      if (!checkTriState(p.phone, f.hasPhone)) return false;
    } else {
      const o = item as OrgItem;
      const f = filter as OrgFilterState;

      if (f.categories.length > 0) {
        const matchesNull = f.categories.includes(NULL_SENTINEL) && o.category === null;
        const matchesConcrete = o.category !== null && f.categories.includes(o.category);
        if (!matchesNull && !matchesConcrete) return false;
      }

      if (f.hasPeople !== "any") {
        const count = o.enriched_person_count ?? 0;
        if (f.hasPeople === "present" && count === 0) return false;
        if (f.hasPeople === "missing" && count > 0) return false;
      }
    }

    return true;
  });
}

// Re-export so callers can import the sentinel by name
export const FILTER_SENTINELS = {
  NONE: NONE_SENTINEL,
  NULL: NULL_SENTINEL,
} as const;
