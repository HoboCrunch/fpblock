# Persons Enrichment Pipeline

## Problem

Persons in the database can be created via org enrichment (People Finder stage), CSV imports, or manual entry. Once created, there is no way to enrich them directly. The `enrichment_status` and `last_enriched_at` fields on the `persons` table exist but are never updated. The legacy `/api/enrich` route operates on the old `contacts` table.

## Goal

Build a dedicated persons enrichment pipeline that:
1. Enriches existing persons via Apollo People Match (email, phone, linkedin, twitter, title, seniority, photo)
2. Links unassociated persons to organizations discovered via Apollo (creating stub orgs when needed)
3. Updates `persons.enrichment_status` and `last_enriched_at`
4. Supports batch enrichment with filters matching the org enrichment pattern

## New Files

- `app/api/enrich/persons/route.ts` — API route (`maxDuration = 300`)
- `lib/enrichment/person-pipeline.ts` — orchestration and batch runner

## Modified Files

- `lib/enrichment/apollo-people.ts` — export the currently-private `enrichPerson` function and `extractDomain` helper
- `lib/types/database.ts` — add `'in_progress'` to `Person.enrichment_status` union type

## Unchanged

- `lib/enrichment/pipeline.ts` — org pipeline untouched
- `insertPeopleFromOrg` — still tags `source: "org_enrichment"`
- All other enrichment modules (apollo.ts, perplexity.ts, gemini.ts, fetch-with-retry.ts)

## Type Mapping: DB Person ↔ ApolloPersonResult

The DB `Person` type and `ApolloPersonResult` differ in field naming. `person-pipeline.ts` must handle this mapping:

| DB Person field   | ApolloPersonResult field | Notes                              |
|-------------------|--------------------------|------------------------------------|
| `twitter_handle`  | `twitter_url`            | DB stores handle, Apollo returns URL. Map URL→handle on write, handle→URL on read. |
| `linkedin_url`    | `linkedin_url`           | Same                               |
| All other fields  | Same names               | Direct mapping                     |

**DB Person → ApolloPersonResult** (before calling `enrichPerson`):
- Convert `twitter_handle` to a twitter URL (prepend `https://twitter.com/` if it's a bare handle)
- Map all other fields directly

**ApolloPersonResult → DB Person** (after enrichment, COALESCE write):
- Extract handle from `twitter_url` (strip `https://twitter.com/` or `https://x.com/` prefix)
- Map all other fields directly

## API Key

`person-pipeline.ts` reads `APOLLO_API_KEY` from `process.env` once at batch start and passes it to `enrichPerson`. If not set, the batch fails immediately with a clear error.

## Per-Person Enrichment Flow

### Step 1: Fetch Person + Org Context

Load the full person row from `persons` table. If not found, return failure.

Set `enrichment_status: 'in_progress'` on the person.

Load the person's primary org (if any) via `person_organization` join:
- Query `person_organization` WHERE `person_id = X` ORDER BY `is_primary DESC` LIMIT 1
- If found, fetch the org's `name` and `website` to use as `orgName` and `domain`
- If not found, `orgName` and `domain` are both null

### Step 2: Apollo People Match

Call `enrichPerson(apiKey, apolloPersonInput, orgName, domain)` where `apolloPersonInput` is the DB person mapped to `ApolloPersonResult` format (see Type Mapping above).

**Degraded match scenario:** When a person has no org association, the match call has less context (no org name or domain). Apollo can still match on name + linkedin_url + apollo_id. If the person has at least one of `linkedin_url` or `apollo_id`, proceed with the call. If the person has only a name (no linkedin, no apollo_id, no org), skip the Apollo call and mark as `'failed'` with reason "insufficient identifiers for match".

COALESCE update: only fill fields that are currently null on the person record. Fields: `email`, `linkedin_url`, `twitter_handle` (mapped from `twitter_url`), `phone`, `title`, `seniority`, `department`, `photo_url`, `apollo_id`.

### Step 3: Reverse Org Linkage

Only runs if the person has zero `person_organization` rows AND Apollo returns organization data in the match response.

1. Extract `organization.name` and `organization.primary_domain` from the raw Apollo match response (accessed via `data.person.organization`)
2. Search existing orgs: by domain first (extract from website, case-insensitive), then by name (ilike)
3. If found: create `person_organization` link with `source: "direct_enrichment"`, `role` from person title, `role_type` mapped from seniority (using same `mapSeniorityToRoleType` logic from pipeline.ts), `is_primary: true`
4. If not found: create stub organization with `name`, `website` (from domain, formatted as `https://<domain>`), `enrichment_status: 'none'`. Then link as above.

Note: No correlation detection runs here. Correlation detection is reserved for the org enrichment pipeline's `insertPeopleFromOrg` flow where new persons are created. Here we're enriching existing persons.

### Step 4: Update Person Status

- Set `enrichment_status: 'complete'`
- Set `last_enriched_at: now()`
- Do NOT overwrite `source` — it tracks how the person entered the system

### Step 5: Job Logging

Create a child job per person:
- `job_type: "enrichment_person_match"`
- `target_table: "persons"`
- `target_id: person.id`
- `metadata: { person_name, fields_updated, org_linked, org_created, org_id }`

On failure: set `enrichment_status: 'failed'`, log error to job.

## Batch Runner

Function: `runBatchPersonEnrichment(supabase, personIds, options)`

- Same pattern as `runBatchEnrichment` for orgs
- Concurrency: 1 (Apollo rate limits; `enrichPerson` already has 500ms sleep)
- Stale job cleanup before starting (15-min threshold)
- Parent job type: `enrichment_batch_persons`, target_table: `persons`
- Child jobs relate to parent by convention: same `target_table` + time range (matching org pipeline pattern — no `parent_job_id` field in schema)
- Returns: `{ total, succeeded, failed, results[], durationMs }`

Per-person result type:
```typescript
interface PersonEnrichmentResult {
  personId: string;
  personName: string;
  success: boolean;
  error?: string;
  fieldsUpdated: string[];
  orgLinked: boolean;
  orgCreated: boolean;
  orgId?: string;
}
```

## API Route

```
POST /api/enrich/persons
```

`export const maxDuration = 300;`

Uses service role client (same as org route).

### Request Body

```typescript
{
  personIds?: string[];        // Explicit person IDs
  eventId?: string;            // All persons participating in event
  organizationId?: string;     // All persons linked to org
  failedOnly?: boolean;        // Only enrichment_status = 'failed'
  sourceFilter?: string;       // Only persons with this source value
  // Default (no filters): enrichment_status = 'none' OR apollo_id IS NULL
}
```

### Filter Resolution

Filters are **mutually exclusive, first match wins** (same pattern as org route):

1. `personIds` — use directly
2. `eventId` — join `event_participations` on `person_id`
3. `organizationId` — join `person_organization` on `person_id`
4. `failedOnly` — `enrichment_status = 'failed'`
5. `sourceFilter` — `source = <value>` AND (`enrichment_status = 'none'` OR `apollo_id IS NULL`)
6. Default — `enrichment_status = 'none'` OR `apollo_id IS NULL`

Limit: 200 persons per batch (matches org route).

### Response

```typescript
{
  jobId: string;
  status: "completed";
  persons_processed: number;
  persons_enriched: number;
  persons_failed: number;
  orgs_created: number;
  results: Array<{
    personId: string;
    personName: string;
    success: boolean;
    error?: string;
    fieldsUpdated: string[];
    orgLinked: boolean;
    orgCreated: boolean;
  }>;
}
```

## apollo-people.ts Changes

Export two currently-private functions:

1. `enrichPerson` — used by person-pipeline.ts for direct person enrichment
2. `extractDomain` — used by person-pipeline.ts to extract domain from org website

Function signatures stay the same. The only code change is adding `export` keyword.

## Rate Limiting

- `enrichPerson` already includes 500ms sleep after each call
- Batch concurrency: 1
- Timeout: 20s per match call (via fetch-with-retry)
- Max retries: 2 with exponential backoff

## Error Handling

- Per-person errors don't halt the batch (graceful continuation)
- Failed persons get `enrichment_status: 'failed'`
- Stale jobs cleaned up before batch starts
- Apollo 4xx errors skip retry (client fault, permanent)
- Insufficient identifiers (no linkedin, no apollo_id, no org) → skip Apollo call, mark failed
