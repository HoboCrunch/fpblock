import type { PersonRow, CorrelationResult } from "@/app/admin/persons/person-table-row";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PersonFilterRules = {
  search?: string;
  events?: string[];
  hasOrg?: "yes" | "no";
  correlationType?: string[];
  seniority?: string[];
  department?: string[];
  source?: string[];
  hasEmail?: boolean;
  hasLinkedin?: boolean;
  hasPhone?: boolean;
  hasTwitter?: boolean;
  hasTelegram?: boolean;
  enrichmentStatus?: string[];
  icpMin?: number;
  icpMax?: number;
  eventScope?: { eventId: string; speaker: boolean; orgAffiliated: boolean };
};

export type PersonFilterDeps = {
  correlations?: Record<string, CorrelationResult>;
  eventPersonIds?: Set<string> | null;
};

// ---------------------------------------------------------------------------
// Defaults / predicates
// ---------------------------------------------------------------------------

export function defaultPersonFilterRules(): PersonFilterRules {
  return {};
}

export function isEmptyRules(r: PersonFilterRules): boolean {
  if (r.search && r.search.trim()) return false;
  if (r.events && r.events.length) return false;
  if (r.hasOrg) return false;
  if (r.correlationType && r.correlationType.length) return false;
  if (r.seniority && r.seniority.length) return false;
  if (r.department && r.department.length) return false;
  if (r.source && r.source.length) return false;
  if (r.hasEmail) return false;
  if (r.hasLinkedin) return false;
  if (r.hasPhone) return false;
  if (r.hasTwitter) return false;
  if (r.hasTelegram) return false;
  if (r.enrichmentStatus && r.enrichmentStatus.length) return false;
  if (r.icpMin !== undefined && r.icpMin !== null && !Number.isNaN(r.icpMin)) return false;
  if (r.icpMax !== undefined && r.icpMax !== null && !Number.isNaN(r.icpMax)) return false;
  if (r.eventScope) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

export function applyPersonFilters(
  rows: PersonRow[],
  rules: PersonFilterRules,
  deps: PersonFilterDeps,
): PersonRow[] {
  let result = rows;

  if (rules.search && rules.search.trim()) {
    const q = rules.search.toLowerCase();
    result = result.filter(
      (r) =>
        r.full_name.toLowerCase().includes(q) ||
        (r.email && r.email.toLowerCase().includes(q)) ||
        (r.primary_org_name && r.primary_org_name.toLowerCase().includes(q)),
    );
  }

  if (rules.events && rules.events.length) {
    const set = new Set(rules.events);
    result = result.filter((r) => r.personEvents.some((pe) => set.has(pe.event_id)));
  }

  if (rules.hasOrg === "yes") result = result.filter((r) => !!r.primary_org_name);
  else if (rules.hasOrg === "no") result = result.filter((r) => !r.primary_org_name);

  if (rules.correlationType && rules.correlationType.length) {
    const set = new Set(rules.correlationType);
    const corr = deps.correlations ?? {};
    result = result.filter((r) => set.has(corr[r.id]?.type ?? "none"));
  }

  if (rules.seniority && rules.seniority.length) {
    const set = new Set(rules.seniority);
    result = result.filter((r) => r.seniority && set.has(r.seniority));
  }

  if (rules.department && rules.department.length) {
    const set = new Set(rules.department);
    result = result.filter((r) => r.department && set.has(r.department));
  }

  if (rules.source && rules.source.length) {
    const set = new Set(rules.source);
    result = result.filter((r) => r.source && set.has(r.source));
  }

  if (rules.hasEmail) result = result.filter((r) => !!r.email);
  if (rules.hasLinkedin) result = result.filter((r) => !!r.linkedin_url);
  if (rules.hasPhone) result = result.filter((r) => !!r.phone);
  if (rules.hasTwitter) result = result.filter((r) => !!r.twitter_handle);
  if (rules.hasTelegram) result = result.filter((r) => !!r.telegram_handle);

  if (rules.enrichmentStatus && rules.enrichmentStatus.length) {
    const set = new Set(rules.enrichmentStatus);
    result = result.filter((r) => set.has(r.enrichment_status || "none"));
  }

  if (rules.icpMin !== undefined && !Number.isNaN(rules.icpMin)) {
    const min = rules.icpMin;
    result = result.filter((r) => r.icp_score !== null && r.icp_score >= min);
  }
  if (rules.icpMax !== undefined && !Number.isNaN(rules.icpMax)) {
    const max = rules.icpMax;
    result = result.filter((r) => r.icp_score !== null && r.icp_score <= max);
  }

  if (rules.eventScope) {
    if (deps.eventPersonIds === null || deps.eventPersonIds === undefined) {
      // null = both toggles off (spec: empty set); undefined = data not yet loaded → empty for now
      result = [];
    } else {
      const ids = deps.eventPersonIds;
      result = result.filter((r) => ids.has(r.id));
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Active-filter chips
// ---------------------------------------------------------------------------

export type ActiveFilterChip = { key: string; label: string; value: string };

export type ActiveFiltersOptions = {
  eventOptions: { id: string; name: string }[];
};

export function personFilterRulesToActiveFilters(
  r: PersonFilterRules,
  opts: ActiveFiltersOptions,
): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  if (r.events && r.events.length) {
    const names = r.events.map((id) => opts.eventOptions.find((e) => e.id === id)?.name || id);
    chips.push({ key: "events", label: "Event", value: names.join(", ") });
  }
  if (r.hasOrg) chips.push({ key: "hasOrg", label: "Has Org", value: r.hasOrg });
  if (r.correlationType && r.correlationType.length)
    chips.push({ key: "correlationType", label: "Correlation", value: r.correlationType.join(", ") });
  if (r.seniority && r.seniority.length)
    chips.push({ key: "seniority", label: "Seniority", value: r.seniority.join(", ") });
  if (r.department && r.department.length)
    chips.push({ key: "department", label: "Department", value: r.department.join(", ") });
  if (r.source && r.source.length)
    chips.push({ key: "source", label: "Source", value: r.source.join(", ") });
  if (r.hasEmail) chips.push({ key: "hasEmail", label: "Has Email", value: "Yes" });
  if (r.hasLinkedin) chips.push({ key: "hasLinkedin", label: "Has LinkedIn", value: "Yes" });
  if (r.hasPhone) chips.push({ key: "hasPhone", label: "Has Phone", value: "Yes" });
  if (r.hasTwitter) chips.push({ key: "hasTwitter", label: "Has Twitter", value: "Yes" });
  if (r.hasTelegram) chips.push({ key: "hasTelegram", label: "Has Telegram", value: "Yes" });
  if (r.enrichmentStatus && r.enrichmentStatus.length)
    chips.push({ key: "enrichmentStatus", label: "Enrichment", value: r.enrichmentStatus.join(", ") });
  if (r.icpMin !== undefined && !Number.isNaN(r.icpMin))
    chips.push({ key: "icpMin", label: "ICP Min", value: String(r.icpMin) });
  if (r.icpMax !== undefined && !Number.isNaN(r.icpMax))
    chips.push({ key: "icpMax", label: "ICP Max", value: String(r.icpMax) });
  return chips;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export type FilterKey =
  | "events"
  | "hasOrg"
  | "correlationType"
  | "seniority"
  | "department"
  | "source"
  | "hasEmail"
  | "hasLinkedin"
  | "hasPhone"
  | "hasTwitter"
  | "hasTelegram"
  | "enrichmentStatus"
  | "icpMin"
  | "icpMax"
  | "search"
  | "eventScope";

export function removeFilterKey(r: PersonFilterRules, key: FilterKey): PersonFilterRules {
  const next = { ...r };
  delete next[key];
  return next;
}

export function clearAllFilters(): PersonFilterRules {
  return {};
}

/** Strip empty arrays / empty strings so the JSONB stored is minimal. */
export function normalizeRules(r: PersonFilterRules): PersonFilterRules {
  const next: PersonFilterRules = {};
  if (r.search && r.search.trim()) next.search = r.search.trim();
  if (r.events && r.events.length) next.events = [...r.events];
  if (r.hasOrg) next.hasOrg = r.hasOrg;
  if (r.correlationType && r.correlationType.length) next.correlationType = [...r.correlationType];
  if (r.seniority && r.seniority.length) next.seniority = [...r.seniority];
  if (r.department && r.department.length) next.department = [...r.department];
  if (r.source && r.source.length) next.source = [...r.source];
  if (r.hasEmail) next.hasEmail = true;
  if (r.hasLinkedin) next.hasLinkedin = true;
  if (r.hasPhone) next.hasPhone = true;
  if (r.hasTwitter) next.hasTwitter = true;
  if (r.hasTelegram) next.hasTelegram = true;
  if (r.enrichmentStatus && r.enrichmentStatus.length) next.enrichmentStatus = [...r.enrichmentStatus];
  if (r.icpMin !== undefined && !Number.isNaN(r.icpMin)) next.icpMin = r.icpMin;
  if (r.icpMax !== undefined && !Number.isNaN(r.icpMax)) next.icpMax = r.icpMax;
  if (r.eventScope) next.eventScope = { ...r.eventScope };
  return next;
}
