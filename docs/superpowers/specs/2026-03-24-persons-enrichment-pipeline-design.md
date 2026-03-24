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

- `app/api/enrich/persons/route.ts` — API route
- `lib/enrichment/person-pipeline.ts` — orchestration and batch runner

## Modified Files

- `lib/enrichment/apollo-people.ts` — export the currently-private `enrichPerson` function

## Unchanged

- `lib/enrichment/pipeline.ts` — org pipeline untouched
- `insertPeopleFromOrg` — still tags `source: "org_enrichment"`
- All other enrichment modules (apollo.ts, perplexity.ts, gemini.ts, fetch-with-retry.ts)

## Per-Person Enrichment Flow

### Step 1: Fetch Person

Load the full person row from `persons` table. If not found, return failure.

### Step 2: Apollo People Match

Call `/v1/people/match` with available identifiers:
- `first_name`, `last_name` (split from `full_name` if needed)
- `organization_name` (from primary person_organization link)
- `domain` (extracted from org website)
- `linkedin_url`
- `id` (apollo_id if present)

COALESCE update: only fill fields that are currently null on the person record. Fields: `email`, `linkedin_url`, `twitter_handle`, `phone`, `title`, `seniority`, `department`, `photo_url`, `apollo_id`.

### Step 3: Reverse Org Linkage

Only runs if the person has zero `person_organization` rows AND Apollo returns organization data.

1. Extract `organization.name` and `organization.primary_domain` from Apollo response
2. Search existing orgs by domain first (preferred), then by name (case-insensitive)
3. If found: create `person_organization` link with `source: "direct_enrichment"`, `role` from person title, `role_type` mapped from seniority, `is_primary: true`
4. If not found: create stub organization with `name`, `website` (from domain), `linkedin_url` (if available), `enrichment_status: 'none'`. Then link as above.

### Step 4: Update Person Status

- Set `enrichment_status: 'complete'`
- Set `last_enriched_at: now()`
- Do NOT overwrite `source` — it tracks how the person entered the system

### Step 5: Job Logging

Create a child job per person:
- `job_type: "enrichment_person_match"`
- `target_table: "persons"`
- `target_id: person.id`
- `metadata: { person_name, fields_updated, org_linked, org_created }`

On failure: set `enrichment_status: 'failed'`, log error.

## Batch Runner

Function: `runBatchPersonEnrichment(supabase, personIds, options)`

- Same pattern as `runBatchEnrichment` for orgs
- Concurrency: 1 (Apollo rate limits; `enrichPerson` already has 500ms sleep)
- Stale job cleanup before starting (15-min threshold)
- Parent job type: `enrichment_batch_persons`, target_table: `persons`
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

### Filter Resolution (priority order)

1. `personIds` — use directly
2. `eventId` — join `event_participations` on `person_id`
3. `organizationId` — join `person_organization` on `person_id`
4. `failedOnly` — `enrichment_status = 'failed'`
5. `sourceFilter` — `source = <value>`, combined with default unenriched filter
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

The `enrichPerson` function is currently module-private. It needs to be exported so person-pipeline.ts can call it directly. The function signature stays the same:

```typescript
export async function enrichPerson(
  apiKey: string,
  person: ApolloPersonResult,
  orgName: string,
  domain: string | null
): Promise<ApolloPersonResult>
```

No other changes to this module.

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
