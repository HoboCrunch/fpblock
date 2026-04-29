/**
 * Segment Builder — server-side helpers
 *
 * A `SegmentSpec` is a declarative filter set that selects a population of
 * `persons` (by id). Both the live preview and the bulk-enroll action share
 * the exact same query construction so the count the user sees matches the
 * set that gets enrolled.
 *
 * Implementation note: Supabase's PostgREST does not support full
 * `NOT IN (subquery)` semantics in a single chained call; we resolve each
 * exclusion subquery to a list of IDs first and apply `not.in.(...)`
 * client-side. For our population sizes (low thousands) this is fine.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Person } from "@/lib/types/database";
import {
  getPersonIdsForEvent,
  type EventPersonRelation,
} from "@/lib/queries/event-persons";

// ---------------------------------------------------------------------------
// SegmentSpec
// ---------------------------------------------------------------------------

/** Enrichment status values valid on the `persons` table. */
export type PersonEnrichmentStatus =
  | "none"
  | "in_progress"
  | "complete"
  | "failed";

/** Roles a person can hold relative to an event. */
export type EventRole = "speaker" | "attendee" | "sponsor" | "org_affiliated";

/**
 * A `SegmentSpec` is a JSON-serializable description of a person filter set.
 * Every field is optional; an empty spec selects all persons (subject to the
 * default `limit`).
 */
export interface SegmentSpec {
  // ---- Person filters --------------------------------------------------
  /** Inclusive ICP score range (resolved against `persons_with_icp` view). */
  icp_score?: { min?: number; max?: number };
  /** Restrict to persons whose `enrichment_status` is in this set. */
  enrichment_status?: PersonEnrichmentStatus[];
  /** When true, require non-null `email`. When false, require null `email`. */
  has_email?: boolean;
  /** When true, require non-null `linkedin_url`. */
  has_linkedin?: boolean;
  /** Restrict to persons whose `source` is one of these values. */
  source_in?: string[];

  // ---- Org filters (matched via primary org link) ---------------------
  /** Org `industry` must be one of these. */
  org_industry_in?: string[];
  /** Inclusive employee-count range on the primary org. */
  org_employee_count?: { min?: number; max?: number };
  /** Org `latest_funding_stage` must be one of these. */
  org_funding_stage_in?: string[];
  /**
   * HQ location filter. We do a simple `ilike` against `hq_location` for
   * each provided string (any-of semantics).
   */
  org_hq_country_in?: string[];

  // ---- Event affiliation ----------------------------------------------
  /** Restrict to persons affiliated with this event. */
  event_id?: string;
  /**
   * Roles in the event to include. We map the `event_role_in` set to the
   * existing `EventPersonRelation` enum used by `getPersonIdsForEvent`:
   *  - any of speaker/attendee/sponsor → direct
   *  - org_affiliated → org_affiliated
   *  - both groups present → either
   */
  event_role_in?: EventRole[];

  // ---- Exclusions ------------------------------------------------------
  /** Drop persons already enrolled in this sequence. */
  exclude_already_enrolled?: boolean;
  /** Drop persons enrolled in any active sequence. */
  exclude_in_active_sequence?: boolean;
  /** Drop persons whose last interaction in the past 90d was a bounce. */
  exclude_bounced?: boolean;
  /** Drop persons who replied to any sequence in the past 30d. */
  exclude_replied_recently?: boolean;

  // ---- Limit -----------------------------------------------------------
  /** Cap on the number of person IDs returned. Defaults to 100. */
  limit?: number;
}

/** Default cap on person IDs returned per resolution. */
export const DEFAULT_SEGMENT_LIMIT = 100;
/** Beyond this size, the UI should show a confirmation. */
export const SEGMENT_WARN_THRESHOLD = 500;
/** Hard ceiling — never return more than this regardless of `limit`. */
export const SEGMENT_HARD_LIMIT = 5000;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function rolesToRelation(roles: EventRole[] | undefined): EventPersonRelation {
  if (!roles || roles.length === 0) return "either";
  const hasDirect = roles.some(
    (r) => r === "speaker" || r === "attendee" || r === "sponsor"
  );
  const hasOrg = roles.includes("org_affiliated");
  if (hasDirect && hasOrg) return "either";
  if (hasOrg) return "org_affiliated";
  return "direct";
}

/** Filter direct event participants down to a specific role subset. */
async function fetchDirectEventByRole(
  supabase: SupabaseClient,
  eventId: string,
  roles: EventRole[]
): Promise<string[]> {
  // Map our public role enum to the DB ParticipationRole values.
  const dbRoles: string[] = [];
  for (const r of roles) {
    if (r === "speaker") dbRoles.push("speaker");
    else if (r === "attendee") dbRoles.push("attendee");
    else if (r === "sponsor") dbRoles.push("sponsor");
  }
  if (dbRoles.length === 0) return [];
  const { data } = await supabase
    .from("event_participations")
    .select("person_id")
    .eq("event_id", eventId)
    .in("role", dbRoles)
    .not("person_id", "is", null);
  const rows = (data ?? []) as Array<{ person_id: string | null }>;
  return Array.from(
    new Set(
      rows
        .map((r) => r.person_id)
        .filter((id): id is string => id !== null)
    )
  );
}

/** Resolve event affiliation IDs honoring the role subset. */
async function resolveEventAffiliation(
  supabase: SupabaseClient,
  spec: SegmentSpec
): Promise<string[] | null> {
  if (!spec.event_id) return null;
  const roles = spec.event_role_in;

  // No role restriction → use the catch-all helper
  if (!roles || roles.length === 0) {
    return getPersonIdsForEvent(supabase, spec.event_id, "either");
  }

  const relation = rolesToRelation(roles);
  // org_affiliated only — single helper call
  if (relation === "org_affiliated") {
    return getPersonIdsForEvent(supabase, spec.event_id, "org_affiliated");
  }

  // direct only — but with role subset
  if (relation === "direct") {
    return fetchDirectEventByRole(supabase, spec.event_id, roles);
  }

  // both groups: union of org-affiliated + role-filtered direct
  const [direct, affiliated] = await Promise.all([
    fetchDirectEventByRole(supabase, spec.event_id, roles),
    getPersonIdsForEvent(supabase, spec.event_id, "org_affiliated"),
  ]);
  const out = new Set<string>(direct);
  for (const id of affiliated) out.add(id);
  return Array.from(out);
}

/** Resolve which persons are linked to orgs that match the org filters. */
async function resolveOrgFilteredPersonIds(
  supabase: SupabaseClient,
  spec: SegmentSpec
): Promise<string[] | null> {
  const hasIndustry = (spec.org_industry_in?.length ?? 0) > 0;
  const hasEmployees =
    spec.org_employee_count?.min !== undefined ||
    spec.org_employee_count?.max !== undefined;
  const hasFunding = (spec.org_funding_stage_in?.length ?? 0) > 0;
  const hasHq = (spec.org_hq_country_in?.length ?? 0) > 0;

  if (!hasIndustry && !hasEmployees && !hasFunding && !hasHq) return null;

  let orgQuery = supabase.from("organizations").select("id");
  if (hasIndustry) orgQuery = orgQuery.in("industry", spec.org_industry_in!);
  if (hasFunding) {
    orgQuery = orgQuery.in("latest_funding_stage", spec.org_funding_stage_in!);
  }
  if (spec.org_employee_count?.min !== undefined) {
    orgQuery = orgQuery.gte("employee_count", spec.org_employee_count.min);
  }
  if (spec.org_employee_count?.max !== undefined) {
    orgQuery = orgQuery.lte("employee_count", spec.org_employee_count.max);
  }
  if (hasHq) {
    // any-of ilike on hq_location
    const orClause = spec.org_hq_country_in!
      .map((c) => `hq_location.ilike.%${c.replace(/[%,]/g, "")}%`)
      .join(",");
    if (orClause) orgQuery = orgQuery.or(orClause);
  }

  const { data: orgs } = await orgQuery;
  const orgIds = ((orgs ?? []) as Array<{ id: string }>).map((o) => o.id);
  if (orgIds.length === 0) return [];

  const { data: links } = await supabase
    .from("person_organization")
    .select("person_id")
    .in("organization_id", orgIds);
  return Array.from(
    new Set(
      ((links ?? []) as Array<{ person_id: string }>).map((l) => l.person_id)
    )
  );
}

/** Persons already enrolled in `sequenceId`. */
async function resolveAlreadyEnrolled(
  supabase: SupabaseClient,
  sequenceId: string
): Promise<string[]> {
  const { data } = await supabase
    .from("sequence_enrollments")
    .select("person_id")
    .eq("sequence_id", sequenceId);
  return ((data ?? []) as Array<{ person_id: string }>).map((r) => r.person_id);
}

/** Persons enrolled in any non-completed sequence. */
async function resolveInActiveSequence(
  supabase: SupabaseClient
): Promise<string[]> {
  const { data: activeSeqs } = await supabase
    .from("sequences")
    .select("id")
    .in("status", ["active", "draft"]);
  const seqIds = ((activeSeqs ?? []) as Array<{ id: string }>).map((s) => s.id);
  if (seqIds.length === 0) return [];
  const { data } = await supabase
    .from("sequence_enrollments")
    .select("person_id")
    .in("sequence_id", seqIds)
    .eq("status", "active");
  return Array.from(
    new Set(
      ((data ?? []) as Array<{ person_id: string }>).map((r) => r.person_id)
    )
  );
}

/** Persons flagged with a hard email bounce on the row itself. */
async function resolveBouncedPersons(
  supabase: SupabaseClient
): Promise<string[]> {
  const { data } = await supabase
    .from("persons")
    .select("id")
    .not("email_bounced_at", "is", null);
  return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
}

/** Persons whose last interaction in the trailing window matches a status. */
async function resolveByInteractionStatus(
  supabase: SupabaseClient,
  statuses: string[],
  windowDays: number
): Promise<string[]> {
  const cutoff = new Date(
    Date.now() - windowDays * 24 * 60 * 60 * 1000
  ).toISOString();
  const { data } = await supabase
    .from("interactions")
    .select("person_id")
    .in("status", statuses)
    .gte("occurred_at", cutoff)
    .not("person_id", "is", null);
  return Array.from(
    new Set(
      ((data ?? []) as Array<{ person_id: string | null }>)
        .map((r) => r.person_id)
        .filter((id): id is string => id !== null)
    )
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ResolvedSegment {
  ids: string[];
  totalBeforeLimit: number;
  limited: boolean;
}

/**
 * Turn a SegmentSpec into a list of person IDs. The caller passes
 * `sequenceId` so the `exclude_already_enrolled` filter can target it.
 */
export async function resolvePersonIds(
  supabase: SupabaseClient,
  spec: SegmentSpec,
  sequenceId?: string
): Promise<ResolvedSegment> {
  // ---- Build the include set via persons_with_icp -------------------
  // We start by selecting candidate ids from persons_with_icp so the icp
  // filters compose without an extra join.
  let q = supabase.from("persons_with_icp").select("id", { count: "exact" });

  if (spec.icp_score?.min !== undefined) {
    q = q.gte("icp_score", spec.icp_score.min);
  }
  if (spec.icp_score?.max !== undefined) {
    q = q.lte("icp_score", spec.icp_score.max);
  }
  if (spec.enrichment_status && spec.enrichment_status.length > 0) {
    q = q.in("enrichment_status", spec.enrichment_status);
  }
  if (spec.has_email === true) q = q.not("email", "is", null);
  if (spec.has_email === false) q = q.is("email", null);
  if (spec.has_linkedin === true) q = q.not("linkedin_url", "is", null);
  if (spec.has_linkedin === false) q = q.is("linkedin_url", null);
  if (spec.source_in && spec.source_in.length > 0) {
    q = q.in("source", spec.source_in);
  }

  // Resolve ID-restricting subqueries in parallel.
  const [orgIds, eventIds] = await Promise.all([
    resolveOrgFilteredPersonIds(supabase, spec),
    resolveEventAffiliation(supabase, spec),
  ]);

  // Intersect the orgIds and eventIds restrictions if present.
  let restrictTo: string[] | null = null;
  if (orgIds !== null) restrictTo = orgIds;
  if (eventIds !== null) {
    restrictTo =
      restrictTo === null
        ? eventIds
        : restrictTo.filter((id) => eventIds.includes(id));
  }
  if (restrictTo !== null) {
    if (restrictTo.length === 0) {
      return { ids: [], totalBeforeLimit: 0, limited: false };
    }
    // Supabase chunks; but for our sizes a single in() is fine.
    q = q.in("id", restrictTo);
  }

  // Resolve exclusions in parallel.
  const exclusionPromises: Promise<string[]>[] = [];
  if (spec.exclude_already_enrolled && sequenceId) {
    exclusionPromises.push(resolveAlreadyEnrolled(supabase, sequenceId));
  }
  if (spec.exclude_in_active_sequence) {
    exclusionPromises.push(resolveInActiveSequence(supabase));
  }
  if (spec.exclude_bounced) {
    exclusionPromises.push(resolveByInteractionStatus(supabase, ["bounced"], 90));
    exclusionPromises.push(resolveBouncedPersons(supabase));
  }
  if (spec.exclude_replied_recently) {
    exclusionPromises.push(resolveByInteractionStatus(supabase, ["replied"], 30));
  }
  const exclusionResults = await Promise.all(exclusionPromises);
  const excludeSet = new Set<string>();
  for (const arr of exclusionResults) for (const id of arr) excludeSet.add(id);

  // Apply `not in` for excludes. PostgREST limits URL length, so we cap the
  // exclusion in-list at a reasonable size; remaining excludes are handled
  // client-side after fetching.
  let inlineExcludes: string[] = [];
  let postFilterExcludes: string[] = [];
  if (excludeSet.size > 0) {
    const arr = Array.from(excludeSet);
    if (arr.length <= 200) inlineExcludes = arr;
    else {
      inlineExcludes = arr.slice(0, 200);
      postFilterExcludes = arr.slice(200);
    }
    if (inlineExcludes.length > 0) {
      q = q.not("id", "in", `(${inlineExcludes.join(",")})`);
    }
  }

  const limit = Math.min(
    Math.max(1, spec.limit ?? DEFAULT_SEGMENT_LIMIT),
    SEGMENT_HARD_LIMIT
  );

  // Fetch (with a small overshoot to absorb post-filter excludes).
  const fetchSize = Math.min(
    SEGMENT_HARD_LIMIT,
    limit + postFilterExcludes.length
  );
  const { data, count } = await q.limit(fetchSize);
  const rows = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
  const filtered =
    postFilterExcludes.length > 0
      ? rows.filter((id) => !excludeSet.has(id))
      : rows;

  const totalBeforeLimit = count ?? filtered.length;
  const limited = filtered.length > limit;
  return {
    ids: filtered.slice(0, limit),
    totalBeforeLimit,
    limited,
  };
}

/**
 * Sample fetch — returns a few full Person rows for the preview UI.
 */
export interface SamplePerson {
  id: string;
  full_name: string;
  email: string | null;
  icp_score: number | null;
  primary_org_name: string | null;
}

export async function fetchSampleForIds(
  supabase: SupabaseClient,
  ids: string[],
  size = 5
): Promise<SamplePerson[]> {
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from("persons_with_icp")
    .select("id, full_name, email, icp_score, primary_org_name")
    .in("id", ids.slice(0, size));
  return (data ?? []) as SamplePerson[];
}

/** Convenience: full-fat Person rows by id (used by the enroll path). */
export async function fetchPersonsByIds(
  supabase: SupabaseClient,
  ids: string[]
): Promise<Person[]> {
  if (ids.length === 0) return [];
  const { data } = await supabase.from("persons").select("*").in("id", ids);
  return (data ?? []) as Person[];
}

/**
 * Apply the sequence-level enrollment guards declared on
 * `schedule_config.exclude_bounced` and `schedule_config.exclude_already_enrolled`.
 * Returns the filtered id list plus a per-reason drop count.
 *
 * Caller should hit this just before inserting `sequence_enrollments` rows
 * so the same guards apply to the manual, event-bulk, and segment paths.
 */
export interface EnrollFilterResult {
  ids: string[];
  dropped: { bounced: number; already_in_active_sequence: number };
}

export async function applySequenceEnrollFilters(
  supabase: SupabaseClient,
  sequenceId: string,
  personIds: string[]
): Promise<EnrollFilterResult> {
  if (personIds.length === 0) {
    return { ids: [], dropped: { bounced: 0, already_in_active_sequence: 0 } };
  }
  const { data: seq } = await supabase
    .from("sequences")
    .select("schedule_config")
    .eq("id", sequenceId)
    .single();
  const schedule = (seq?.schedule_config ?? null) as {
    exclude_bounced?: boolean;
    exclude_already_enrolled?: boolean;
  } | null;
  if (!schedule) {
    return {
      ids: personIds,
      dropped: { bounced: 0, already_in_active_sequence: 0 },
    };
  }

  const drop = new Set<string>();
  let bounced = 0;
  let alreadyActive = 0;

  if (schedule.exclude_bounced) {
    const bouncedIds = await resolveBouncedPersons(supabase);
    const intStatusIds = await resolveByInteractionStatus(
      supabase,
      ["bounced"],
      90
    );
    for (const id of bouncedIds) drop.add(id);
    for (const id of intStatusIds) drop.add(id);
  }

  if (schedule.exclude_already_enrolled) {
    // "Already enrolled in another active sequence" — does not block re-add to
    // the current sequence (that's covered by the upsert ON CONFLICT).
    const { data: activeSeqs } = await supabase
      .from("sequences")
      .select("id")
      .in("status", ["active", "draft"])
      .neq("id", sequenceId);
    const otherSeqIds = ((activeSeqs ?? []) as Array<{ id: string }>).map(
      (s) => s.id
    );
    if (otherSeqIds.length > 0) {
      const { data: enrollments } = await supabase
        .from("sequence_enrollments")
        .select("person_id")
        .in("sequence_id", otherSeqIds)
        .eq("status", "active");
      for (const r of (enrollments ?? []) as Array<{ person_id: string }>) {
        drop.add(r.person_id);
      }
    }
  }

  const before = personIds.length;
  const kept = personIds.filter((id) => !drop.has(id));
  const totalDropped = before - kept.length;

  // Best-effort split of the drop reasons (a person may match both — counted
  // once toward `bounced` first to keep numbers simple).
  if (schedule.exclude_bounced) bounced = totalDropped;
  if (schedule.exclude_already_enrolled && !schedule.exclude_bounced) {
    alreadyActive = totalDropped;
  }

  return {
    ids: kept,
    dropped: { bounced, already_in_active_sequence: alreadyActive },
  };
}
