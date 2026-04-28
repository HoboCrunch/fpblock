# Enrichment Subsystem

The enrichment subsystem is the engine of the Cannes outreach app: it pulls firmographic and biographic data from third-party APIs (Apollo, Perplexity, Gemini), writes results to Supabase, and exposes them through the admin UI for review and outreach.

There are two parallel pipelines:

- **Organization pipeline** — Apollo org enrich + Perplexity research + Gemini ICP synthesis + Apollo people finder.
  Source: [`lib/enrichment/pipeline.ts`](../../lib/enrichment/pipeline.ts)
- **Person pipeline** — Apollo people match (direct) with reverse org linkage.
  Source: [`lib/enrichment/person-pipeline.ts`](../../lib/enrichment/person-pipeline.ts)

Both write to a shared `job_log` table for observability and a per-row `enrichment_status` / `last_enriched_at` for fast filtering.

> **Note on Unipile.** There is no Unipile integration in the enrichment subsystem. Unipile is referenced only for inbox/messaging code (`lib/inbox/`, `lib/queries/use-inbox-*`, `supabase/migrations/016_inbox_sync_cron.sql`). The phrase "Apollo + Unipile data enrichment" in older project notes is wrong — enrichment uses Apollo + Perplexity + Gemini.

---

## 1. System overview

### Data flow

```
                        ┌──────────────────────────────────────┐
                        │  Admin UI: enrichment-shell.tsx      │
                        │  (selection, config, run, polling)   │
                        └──────────────┬───────────────────────┘
                                       │  POST /api/enrich/...
                                       ▼
        ┌──────────────────────────────────────────────────────────────┐
        │  Next.js API routes (maxDuration: 300s)                       │
        │   • /api/enrich/organizations  → runBatchEnrichment()         │
        │   • /api/enrich/persons        → runBatchPersonEnrichment()   │
        │   • /api/enrich/cancel         → flips job_log.status         │
        │   • /api/enrich (legacy)       → contacts table, separate     │
        └──────────────┬───────────────────────────────────────────────┘
                       │
        ┌──────────────┴──────────────────────┐
        ▼                                     ▼
┌────────────────────┐                ┌────────────────────┐
│ Org pipeline       │                │ Person pipeline    │
│ pipeline.ts        │                │ person-pipeline.ts │
│                    │                │                    │
│  Apollo Org Enrich ─┐               │  Apollo People     │
│  Perplexity Sonar  ─┤  parallel     │  Match (direct)    │
│                    └─► Gemini 2.5   │                    │
│                       Flash         │  Reverse org       │
│                                     │  linkage (search   │
│  Apollo People      │               │  by domain → name  │
│  Search + Match     │               │  → create stub)    │
└────────┬────────────┘               └────────┬───────────┘
         │                                     │
         │  fetchWithRetry  (timeout / backoff)│
         ▼                                     ▼
┌────────────────────────────────────────────────────────────┐
│  Supabase (Postgres)                                        │
│                                                             │
│  organizations  ── enrichment_status / enrichment_stages    │
│                    + firmographics + icp_score / signals    │
│  persons        ── enrichment_status + apollo_id + contact  │
│  person_organization, organization_signals                  │
│  job_log        ── per-stage + parent job audit trail       │
└─────────────────────────────────────────────────────────────┘
```

### Concurrency model

- The org pipeline runs orgs in batches of `concurrency: 3` ([`pipeline.ts:1163`](../../lib/enrichment/pipeline.ts), defaulted in [`organizations/route.ts:169`](../../app/api/enrich/organizations/route.ts)).
- Within an org, Apollo + Perplexity run in parallel via `Promise.all` ([`pipeline.ts:813-818`, `:852-855`](../../lib/enrichment/pipeline.ts)).
- The person pipeline runs **sequentially** (`concurrency: 1`) — see [`person-pipeline.ts:687-688`](../../lib/enrichment/person-pipeline.ts) — to respect Apollo rate limits.
- Each per-org workflow is wrapped in `withTimeout()` ([`pipeline.ts:23-43`](../../lib/enrichment/pipeline.ts)): 60s for Apollo+Perplexity (`:818`, `:887`), 60s for Gemini (`:968`, `:987`), 45s for People Finder (`:1046`).

---

## 2. Pipeline stages

Every stage is **idempotent** — it COALESCEs into existing nullable fields rather than overwriting. Stage runners are exported individually so the API can compose `["apollo"]`, `["full"]`, `["full", "people_finder"]`, etc.

### 2.1 Apollo Organization Enrich (stage `apollo`)

- File: [`lib/enrichment/apollo.ts`](../../lib/enrichment/apollo.ts) — runner [`pipeline.ts:456-526`](../../lib/enrichment/pipeline.ts).
- **Input.** `org.name` plus optional `org.website`. Strategy: domain-based lookup first if a website parses ([`apollo.ts:147-151`](../../lib/enrichment/apollo.ts)), then name-based fallback.
- **Endpoint.** `GET https://api.apollo.io/v1/organizations/enrich` with `X-Api-Key` header ([`apollo.ts:25`, `:165`](../../lib/enrichment/apollo.ts)).
- **Output (`ApolloOrgResult`, `apollo.ts:10-23`).** description, industry, employee_count, annual_revenue, founded_year, technologies[], funding_total, latest_funding_stage, linkedin_url, website, hq_location, raw.
- **Side effects.**
  - `organizations` row updated with any **null** firmographic fields ([`pipeline.ts:474-501`](../../lib/enrichment/pipeline.ts) for solo runner; [`:914-944`](../../lib/enrichment/pipeline.ts) within full pipeline). Existing values are never overwritten.
  - `job_log` row inserted with `job_type='enrichment_apollo'` and the full result in `metadata.result` ([`pipeline.ts:463-469`, `:503-507`](../../lib/enrichment/pipeline.ts)).
  - `enrichment_stages.apollo` updated to `{status:'completed', at, fields_updated:[...]}` ([`pipeline.ts:510-512`](../../lib/enrichment/pipeline.ts)).
- **Failure mode.** Module **never throws** — returns an all-null `ApolloOrgResult` on missing key, network error, or no match ([`apollo.ts:122-205`](../../lib/enrichment/apollo.ts)). The runner surfaces that as `success: true` with empty fields. To detect "found nothing", inspect whether any field is non-null.

### 2.2 Perplexity research (stage `perplexity`)

- File: [`lib/enrichment/perplexity.ts`](../../lib/enrichment/perplexity.ts) — runner [`pipeline.ts:531-578`](../../lib/enrichment/pipeline.ts).
- **Input.** `org.name`, optional website, optional pre-existing context. Existing `context` is appended to the prompt so the model builds on it instead of repeating ([`perplexity.ts:22-24`](../../lib/enrichment/perplexity.ts)).
- **Endpoint.** `POST https://api.perplexity.ai/chat/completions`, model `sonar`, `Authorization: Bearer ${PERPLEXITY_API_KEY}` ([`perplexity.ts:14`, `:174-177`](../../lib/enrichment/perplexity.ts)).
- **Output (`PerplexityOrgResult`, `perplexity.ts:3-12`).** description, products, strengths[], weaknesses[], recent_news[], target_market, raw_response, **discovered_website** (extracted from the response when the org had no website to seed Apollo).
- **Side effects.**
  - **Does NOT update org fields directly.** That is Gemini's job. The raw research lives in `job_log.metadata.result` ([`pipeline.ts:553-560`](../../lib/enrichment/pipeline.ts)).
  - In the full pipeline path, when an org has no website, Perplexity is run first solo to discover one — the discovered URL is written back to `organizations.website` immediately so Apollo can use it ([`pipeline.ts:856-866`](../../lib/enrichment/pipeline.ts)).
  - `enrichment_stages.perplexity` updated.
- **Failure mode.** Returns an empty result on missing API key or non-2xx response ([`perplexity.ts:151-203`](../../lib/enrichment/perplexity.ts)) — never throws.

### 2.3 Gemini synthesis (stage `gemini`)

- File: [`lib/enrichment/gemini.ts`](../../lib/enrichment/gemini.ts) — runner [`pipeline.ts:584-669`](../../lib/enrichment/pipeline.ts).
- **Input.** `org.name`, the two prior stage outputs, plus existing `description / context / usp / icp_score` and a `companyContext` row from the `company_context` singleton table ([`pipeline.ts:53-65`](../../lib/enrichment/pipeline.ts)).
- **Endpoint.** `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}` ([`gemini.ts:162-163`](../../lib/enrichment/gemini.ts)). Uses `responseMimeType: "application/json"` to coerce structured JSON output.
- **Prompt construction.** Assembled in [`gemini.ts:93-156`](../../lib/enrichment/gemini.ts). Includes the FP Block positioning + ICP one-pager + language rules verbatim. If `company_context` row exists, those overrides take precedence; otherwise the hardcoded defaults ([`gemini.ts:23-76`](../../lib/enrichment/gemini.ts)) apply.
- **Output (`GeminiSynthesisResult`, `gemini.ts:9-17`).** description, context, usp, **icp_score (0-100, integer, clamped)**, icp_reason, category, signals[].
- **Side effects.**
  - Updates `organizations`: `description` (only if null), **`context` always overwritten** ([`pipeline.ts:625`, `:1000`](../../lib/enrichment/pipeline.ts) — Gemini is the canonical author), `usp` (if null), `icp_score` (always when non-null), `icp_reason`, `category` (if null).
  - Inserts deduplicated rows into `organization_signals` (dedup by case-insensitive `description` match — [`pipeline.ts:208-251`](../../lib/enrichment/pipeline.ts)). Each signal carries `source = "enrichment"`.
  - `enrichment_stages.gemini` updated with `signals` count.
- **Failure mode.** Throws on missing key or HTTP error ([`gemini.ts:177-179`, `:204-208`](../../lib/enrichment/gemini.ts)). Returns `emptyResult()` on JSON parse failure ([`gemini.ts:264-272`](../../lib/enrichment/gemini.ts)). The pipeline catches and marks the stage `failed`.

### 2.4 Apollo People Finder (stage `people_finder`)

- File: [`lib/enrichment/apollo-people.ts`](../../lib/enrichment/apollo-people.ts) — runner [`pipeline.ts:675-730`](../../lib/enrichment/pipeline.ts).
- **Input.** `org.name`, `org.website`, `PeopleFinderConfig` (`perCompany ≤ 25`, seniorities, departments). Default config: 5 people per org, seniorities `[owner, founder, c_suite, vp, director]`, no department filter ([`apollo-people.ts:34-38`](../../lib/enrichment/apollo-people.ts)).
- **Two-step API call.**
  1. `POST https://api.apollo.io/api/v1/mixed_people/api_search` with `q_organization_domains_list` (or `q_keywords` fallback) plus `person_seniorities`. Note: `person_departments` is **not supported by Apollo** and filtered client-side after the response ([`apollo-people.ts:191-198`](../../lib/enrichment/apollo-people.ts)).
  2. For each result, `POST https://api.apollo.io/v1/people/match` to enrich with email + phone + photo ([`apollo-people.ts:241-258`](../../lib/enrichment/apollo-people.ts)). The search step does not return phones.
- **Output.** `{ people: ApolloPersonResult[], total_available, error }`.
- **Side effects (`insertPeopleFromOrg` in `pipeline.ts:269-447`).** For each found person:
  1. Try to dedupe against existing `persons` by `apollo_id`, then `email` (case-insensitive), then `linkedin_url`.
  2. If found: COALESCE-update only currently-null fields ([`pipeline.ts:336-355`](../../lib/enrichment/pipeline.ts)). Insert a `person_organization` link if missing.
  3. If not found: insert new person with `source = "org_enrichment"`, then run the `find_person_correlations` RPC and insert pending entries into `correlation_candidates` for any matches ≥ 0.6 confidence ([`pipeline.ts:407-428`](../../lib/enrichment/pipeline.ts)).
  4. Always create the `person_organization` link with `source = "org_enrichment"`, `is_current: true`, `role` = title, `role_type` from `mapSeniorityToRoleType()` ([`pipeline.ts:256-262`](../../lib/enrichment/pipeline.ts)).
- `enrichment_stages.people_finder` updated with `{found, created, merged}`.

### 2.5 Person enrichment (separate pipeline)

Runs independently of orgs. Targets a single `persons` row.

- File: [`lib/enrichment/person-pipeline.ts`](../../lib/enrichment/person-pipeline.ts).
- **Input identifiers.** Needs at least one of: `linkedin_url`, `apollo_id`, or a primary org name (used as `organization_name` in the match body). Otherwise marked `failed` with `"Insufficient identifiers for match"` ([`person-pipeline.ts:251-277`](../../lib/enrichment/person-pipeline.ts)).
- **Endpoint.** Calls `POST https://api.apollo.io/v1/people/match` **directly** rather than through `enrichPerson()` so it can read the raw `match.organization` block for reverse linkage ([`person-pipeline.ts:319-339`](../../lib/enrichment/person-pipeline.ts)).
- **COALESCE update.** Only fills fields currently null on the row: email, linkedin_url, twitter_handle (mapped from `twitter_url` via `twitterUrlToHandle` — [`person-pipeline.ts:71-82`](../../lib/enrichment/person-pipeline.ts)), phone, title, seniority, department, photo_url, apollo_id ([`person-pipeline.ts:394-475`](../../lib/enrichment/person-pipeline.ts)).
- **Reverse org linkage.** Triggered only when the person has zero existing `person_organization` rows AND Apollo returned an `organization` block ([`person-pipeline.ts:496-505`](../../lib/enrichment/person-pipeline.ts)):
  1. Search `organizations` by `website ilike %domain%` first.
  2. Fall back to `name ilike` exact-match.
  3. If still missing, **insert a stub org** with `enrichment_status: "none"` so it can be picked up later ([`person-pipeline.ts:546-554`](../../lib/enrichment/person-pipeline.ts)).
  4. Insert the `person_organization` link with `source = "direct_enrichment"`, `is_primary: true`.
- **Status.** Sets `persons.enrichment_status = 'in_progress'` at start, `'complete'` on success even if no match was found, `'failed'` on identifier shortage or unhandled exception. `last_enriched_at` only set on `complete`.
- **Job log.** `job_type = 'enrichment_person_match'` per person ([`person-pipeline.ts:622`](../../lib/enrichment/person-pipeline.ts)). _See gotcha #1 below._

---

## 3. Status model

### Lifecycle states

`organizations.enrichment_status` ([`lib/types/database.ts:61`](../../lib/types/database.ts)):

```
none → in_progress → complete | partial | failed
```

`persons.enrichment_status` ([`lib/types/database.ts:35`](../../lib/types/database.ts)):

```
none → in_progress → complete | failed
```

State transitions:

| From         | To            | When                                                                                                |
| ------------ | ------------- | --------------------------------------------------------------------------------------------------- |
| any          | `in_progress` | At the top of `runFullEnrichment` ([`pipeline.ts:777`](../../lib/enrichment/pipeline.ts))           |
| `in_progress`| `complete`    | All stages reported `completed` ([`pipeline.ts:1060-1062`](../../lib/enrichment/pipeline.ts))       |
| `in_progress`| `partial`     | Some succeeded, some failed ([`pipeline.ts:1062`, `:1098`](../../lib/enrichment/pipeline.ts))       |
| `in_progress`| `failed`      | Unhandled exception with no completed stages ([`pipeline.ts:1097-1099`](../../lib/enrichment/pipeline.ts)) |

`last_enriched_at` is only stamped on `complete` or `partial` ([`pipeline.ts:177-179`](../../lib/enrichment/pipeline.ts)).

### `enrichment_stages` JSONB shape

Stored on `organizations.enrichment_stages` (introduced in [`migrations/022_enrichment_status.sql`](../../supabase/migrations/022_enrichment_status.sql)):

```jsonc
{
  "apollo":         { "status": "completed", "at": "2026-04-28T...", "found": 1 },
  "perplexity":     { "status": "completed", "at": "...",            "found": 1 },
  "gemini":         { "status": "completed", "at": "...",            "signals": 3 },
  "people_finder":  { "status": "completed", "at": "...",            "found": 5 }
}
```

`status` values used in the JSONB: `completed`, `failed`, `pending` (implicit when missing). The `at`, `found`, `signals`, `error`, `fields_updated` keys are advisory.

### The "relational truth" rule

> Stage success indicators are derived from **relational data**, not from the JSONB blob.

The JSONB log can be optimistic (a stage can complete with zero results), so the status icon UI uses the JSONB only to know whether a stage **ran**, then queries the actual row data to decide whether it **produced anything**. See [`status-icons.tsx:62-88`](../../app/admin/enrichment/components/status-icons.tsx):

- `apollo` / `perplexity` had results ⇔ `organizations.description` is non-null.
- `gemini` had results ⇔ `organizations.icp_score` is non-null and > 0.
- `people_finder` had results ⇔ `enriched_person_count > 0` (computed from `person_organization` rows where `source='org_enrichment'`).

If a stage status is `completed` but the relational truth shows zero results, the icon is rendered gray (`completed_empty`) instead of green ([`status-icons.tsx:106-110`](../../app/admin/enrichment/components/status-icons.tsx)).

**Why.** `enrichment_stages` is an audit log. Truth lives in the columns the rest of the app actually queries — that way ICP filters, person rosters, and signal counts all stay consistent with what users see in the icons. If the two ever diverge (a stage gets re-run but the row is stale, or vice versa), the row wins.

---

## 4. External dependencies

| Service     | Endpoints                                                                                                    | Auth                              | Env var               | Notes                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------- | --------------------- | ---------------------------------------------------------------------------------- |
| Apollo      | `GET /v1/organizations/enrich`<br/>`POST /api/v1/mixed_people/api_search`<br/>`POST /v1/people/match`        | `X-Api-Key` header                | `APOLLO_API_KEY`      | 500ms `sleep` between calls inside both modules ([`apollo.ts:194`, `apollo-people.ts:209, :307`](../../lib/enrichment/apollo.ts)). No webhook for phones. |
| Perplexity  | `POST /chat/completions` model=`sonar`                                                                       | `Authorization: Bearer ...`       | `PERPLEXITY_API_KEY`  | 60s timeout. Uses Markdown section parsing — order matters ([`perplexity.ts:128-137`](../../lib/enrichment/perplexity.ts)). |
| Gemini      | `POST /v1beta/models/gemini-2.5-flash:generateContent`                                                       | API key in query string (`?key=`) | `GEMINI_API_KEY`      | 45s timeout. `responseMimeType: application/json` requested but parser falls back to stripping ` ```json ` fences. |
| Supabase    | Service-role key for API routes, anon key for UI polling                                                     | service-role JWT                  | `NEXT_SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_URL` | All pipelines accept a `SupabaseClient` so the same code can run with either role. |

### Rate limits

There is no explicit Apollo rate limiter — pacing is handled by:

1. The 500ms `sleep()` after every Apollo call ([`apollo.ts:194`, `apollo-people.ts:209`, `:307`](../../lib/enrichment/apollo.ts)).
2. Org-level concurrency capped at 3 ([`organizations/route.ts:169`](../../app/api/enrich/organizations/route.ts)).
3. Per-person processing is sequential ([`person-pipeline.ts:687-688`](../../lib/enrichment/person-pipeline.ts)).
4. `fetchWithRetry` exponential backoff on 5xx (1s, 2s, 4s) ([`fetch-with-retry.ts:74-79`](../../lib/enrichment/fetch-with-retry.ts)).

---

## 5. Resilience patterns

### 5.1 `fetchWithRetry` ([`lib/enrichment/fetch-with-retry.ts`](../../lib/enrichment/fetch-with-retry.ts))

The single entry point for every external call.

- **Timeout.** `AbortController` aborts after `timeoutMs` ([`fetch-with-retry.ts:38-39`](../../lib/enrichment/fetch-with-retry.ts)). Default 30s, overridden per call (Apollo org 30s, Apollo people-search 30s, Apollo people-match 20s, Perplexity 60s, Gemini 45s).
- **Retry policy.** `maxRetries = 3` by default; defaults overridden to 2 in most call sites.
  - 2xx / 3xx → return immediately ([`:62-64`](../../lib/enrichment/fetch-with-retry.ts)).
  - 4xx → return without retry, errors are permanent ([`:67-69`](../../lib/enrichment/fetch-with-retry.ts)).
  - 5xx → retry with exponential backoff `baseDelayMs * 2^(attempt-1)` ([`:74-80`](../../lib/enrichment/fetch-with-retry.ts)).
  - Network error / our own timeout → retry. Caller-aborted signals → re-throw (no retry, [`:87-89`](../../lib/enrichment/fetch-with-retry.ts)).
- **Composed signals.** A caller-supplied `init.signal` is composed onto the per-attempt `AbortController` so the React Query / API-route abort path also kills any in-flight retry ([`fetch-with-retry.ts:42-51`](../../lib/enrichment/fetch-with-retry.ts)).

### 5.2 Per-stage timeouts

`withTimeout()` ([`pipeline.ts:23-43`](../../lib/enrichment/pipeline.ts)) wraps stage-level Promises so a hung Apollo call (e.g., during a stuck retry) doesn't block the whole org. Limits:

| Stage block            | Timeout | Source                                                          |
| ---------------------- | ------- | --------------------------------------------------------------- |
| Apollo + Perplexity    | 60s     | [`pipeline.ts:818, :887`](../../lib/enrichment/pipeline.ts)     |
| Gemini                 | 60s     | [`pipeline.ts:968, :987`](../../lib/enrichment/pipeline.ts)     |
| People Finder          | 45s     | [`pipeline.ts:1046`](../../lib/enrichment/pipeline.ts)          |

### 5.3 Concurrency

- Org pipeline: hardcoded `concurrency: 3` ([`organizations/route.ts:169`](../../app/api/enrich/organizations/route.ts)). Default in `runBatchEnrichment` is 1 ([`pipeline.ts:1163`](../../lib/enrichment/pipeline.ts)) but the API route always overrides.
- Person pipeline: sequential, no concurrency parameter exposed ([`person-pipeline.ts:725-764`](../../lib/enrichment/person-pipeline.ts)).
- Within an org, Apollo + Perplexity always run via `Promise.all` when both need running.

### 5.4 Cancellation

Two layers:

1. **Server-side** ([`/api/enrich/cancel`](../../app/api/enrich/cancel/route.ts)). Flips the parent `job_log.status` to `'cancelled'`. The batch loop checks this between batches:
   - Org pipeline check: [`pipeline.ts:1281-1292`](../../lib/enrichment/pipeline.ts).
   - Person pipeline check: [`person-pipeline.ts:752-763`](../../lib/enrichment/person-pipeline.ts).
2. **Client-side.** The shell holds an `AbortController` whose signal is passed into `fetch()` ([`enrichment-shell.tsx:480-481, :521-522`](../../app/admin/enrichment/enrichment-shell.tsx)) and aborted in `handleStop()` ([`:565-574`](../../app/admin/enrichment/enrichment-shell.tsx)).

Cancellation has **batch granularity** — the in-flight org/person finishes its current stages, but no new ones start.

### 5.5 Stale job cleanup (15-minute rule)

Both pipelines run `cleanupStaleJobs()` at the start of every batch ([`pipeline.ts:1123-1142`](../../lib/enrichment/pipeline.ts), mirrored in [`person-pipeline.ts:153-172`](../../lib/enrichment/person-pipeline.ts)):

```sql
UPDATE job_log
   SET status = 'failed',
       error  = 'Marked as failed: job was still processing after 15 minutes (likely server timeout)'
 WHERE status = 'processing'
   AND created_at < now() - interval '15 minutes';
```

This catches jobs orphaned by Vercel/Next.js function timeouts (`maxDuration: 300s` in API routes — [`organizations/route.ts:5`](../../app/api/enrich/organizations/route.ts)). It does **not** roll back any partial DB writes — those columns stay populated.

### 5.6 Stage-skip cache

Within `runFullEnrichment`, every stage checks `enrichment_stages[stage].status === 'completed'` and short-circuits using cached data from `job_log.metadata.result`:

- Apollo+Perplexity skip block: [`pipeline.ts:797-821`](../../lib/enrichment/pipeline.ts).
- Gemini skip block: [`pipeline.ts:948-953`](../../lib/enrichment/pipeline.ts).
- People Finder skip block: [`pipeline.ts:1040-1042`](../../lib/enrichment/pipeline.ts).
- All-stages-already-complete shortcut: [`pipeline.ts:761-774`](../../lib/enrichment/pipeline.ts).

This is what lets a "retry failed" run fan out to the partial orgs without re-billing Apollo/Perplexity/Gemini for the stages that already succeeded.

---

## 6. Source tagging conventions

Source tags are how we trace where a row originated. They are immutable once set.

### `persons.source`

| Value             | Set by                                                                        | Meaning                                                              |
| ----------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `org_enrichment`  | `pipeline.ts:395` (insertPeopleFromOrg)                                       | Person was created during a People Finder run on their org.          |
| _(other)_         | Various import scripts, manual inserts, Apollo direct enrichment              | Set elsewhere and **never overwritten** by the enrichment pipelines. |
| `null`            | Default for legacy / manually inserted rows                                   | Unknown origin.                                                      |

> The person pipeline does **not** set `persons.source` for newly created stub orgs' linkage — it only sets `person_organization.source`. `persons.source` stays whatever it was at insert time.

### `person_organization.source`

| Value               | Set by                                                       | Meaning                                                                                  |
| ------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `org_enrichment`    | `pipeline.ts:371, :395, :434` (insertPeopleFromOrg)          | Link created during an Apollo People Finder run on the org.                              |
| `direct_enrichment` | `person-pipeline.ts:584` (reverse org linkage)               | Link created when enriching a person directly and Apollo returned an `organization` block. |
| _(other)_           | Imports, manual edits                                        | Untouched by the pipelines.                                                              |

### `organization_signals.source`

Always `"enrichment"` ([`pipeline.ts:238`](../../lib/enrichment/pipeline.ts)) for rows produced by Gemini synthesis. Other manually inserted signals can use any string.

---

## 7. Operational runbook

### Reading the UI status icons

Each icon row in the org table shows four icons in fixed order: Apollo, Perplexity, Gemini, People Finder ([`status-icons.tsx:33-38`](../../app/admin/enrichment/components/status-icons.tsx)).

| Color                       | Meaning                                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------------------- |
| Gray                        | Stage hasn't run, OR stage completed but produced nothing (relational truth check returned false).       |
| Green                       | Stage completed and the relational truth check shows actual data on the row.                             |
| Red                         | Stage marked `failed` in the JSONB.                                                                      |
| Orange (pulsing)            | Live mode + this stage is the active one for the org being processed.                                    |

For persons ([`status-icons.tsx:147-200`](../../app/admin/enrichment/components/status-icons.tsx)), the icons reflect the four contact fields directly: green if non-null, red if `enrichment_status='failed'`, gray otherwise.

### How to retry failed jobs

Three paths:

1. **From the job history → Retry link.** UI sets `?retry={jobId}` on the URL; the shell reads it ([`enrichment-shell.tsx:222-246`](../../app/admin/enrichment/enrichment-shell.tsx)), queries `job_log` for child jobs of that parent that ended in `failed`/`error`, and pre-selects only those org IDs.
2. **API directly.** `POST /api/enrich/organizations` with `{ "failedIncomplete": true }` — picks up everything with `enrichment_status IN ('failed','partial')` (max 200 per call) ([`organizations/route.ts:90-98`](../../app/api/enrich/organizations/route.ts)).
3. **Single org.** `POST /api/enrich/organizations` with `{ "organizationIds": ["..."] }`. The stage-skip cache will skip already-completed stages, so this is cheap.

### How to re-enrich

The pipeline is **purely additive**. Any stage that has `enrichment_stages[stage].status === 'completed'` will be skipped. To force a re-run, manually clear that key:

```sql
-- Re-run Gemini on a single org
UPDATE organizations
   SET enrichment_stages = enrichment_stages - 'gemini',
       enrichment_status = 'in_progress'
 WHERE id = '...';

-- Full re-enrich: clear all stage state
UPDATE organizations
   SET enrichment_stages = '{}'::jsonb,
       enrichment_status = 'none',
       icp_score = NULL,        -- so Gemini's "always update icp_score" block runs
       last_enriched_at = NULL
 WHERE id = '...';
```

For COALESCE-protected fields (description, usp, category, all firmographics): they will only be re-written if you also null them out, since every Apollo/Gemini update path checks `if (result.X && !org.X)` first.

### Cancelling a long-running batch

`POST /api/enrich/cancel` with `{ "jobId": "<parent-job-id>" }`. The parent job ID is returned from the original POST and shown in `job_log` for that batch. The pipeline stops between iterations of the outer concurrency loop — current orgs in flight finish their current stage block.

### Reading `job_log`

Useful queries:

```sql
-- All in-flight enrichment work
SELECT id, job_type, target_id, created_at, metadata->>'org_name' AS org
FROM job_log
WHERE status = 'processing'
ORDER BY created_at DESC;

-- Last enrichment run for an org
SELECT job_type, status, created_at, metadata, error
FROM job_log
WHERE target_table = 'organizations' AND target_id = '...'
ORDER BY created_at DESC
LIMIT 20;

-- Orgs that need a retry
SELECT id, name, enrichment_status, enrichment_stages
FROM organizations
WHERE enrichment_status IN ('failed', 'partial')
ORDER BY last_enriched_at DESC NULLS LAST;
```

Job types written by the pipelines:
`enrichment_apollo`, `enrichment_perplexity`, `enrichment_gemini`, `enrichment_people_finder`, `enrichment_full`, `enrichment_batch_organizations`, `enrichment_batch_persons`, `enrichment_person_match`, `enrichment` (legacy contacts route).

---

## 8. Known gotchas / anti-patterns

1. **Person job_type mismatch.** The person pipeline writes `job_type = 'enrichment_person_match'` ([`person-pipeline.ts:622`](../../lib/enrichment/person-pipeline.ts)) but the live-progress poller in the shell queries `job_type = 'enrichment_person'` ([`enrichment-shell.tsx:662`](../../app/admin/enrichment/enrichment-shell.tsx)) and the historical results loader includes `'enrichment_person'` instead of `'enrichment_person_match'` ([`enrichment-shell.tsx:726`](../../app/admin/enrichment/enrichment-shell.tsx)). The query hook in [`use-enrichment-jobs.ts:21`](../../lib/queries/use-enrichment-jobs.ts) also uses `'enrichment_person'`. Net effect: person enrichment progress and history never display in the UI for individual persons. Either rename the writes to `enrichment_person` or update the readers.

2. **No Unipile in enrichment.** The project memory says "Apollo + Unipile data enrichment". Verified: Unipile is only used in inbox/messaging, not enrichment. The phrase is misleading.

3. **Legacy `/api/enrich` route.** [`app/api/enrich/route.ts`](../../app/api/enrich/route.ts) still exists and operates on the **old `contacts` table**, not `persons`. It bypasses `fetchWithRetry`, has no retry logic, and doesn't update `enrichment_status`. The header comment (`route.ts:6-10`) acknowledges this. Do not use this route for new work — it's kept for backwards compatibility.

4. **`person.source` is never set during the person pipeline.** Despite its name, [`person-pipeline.ts`](../../lib/enrichment/person-pipeline.ts) doesn't touch `persons.source` — only the `person_organization.source` of the link it creates. The note "person.source = 'org_enrichment' for persons created by people_finder" only applies to people *created by the org pipeline* via [`pipeline.ts:395`](../../lib/enrichment/pipeline.ts). Direct person enrichment never creates new persons.

5. **`organizations.context` is always overwritten.** Unlike every other field which is COALESCE-protected, Gemini's `context` overwrites whatever was there ([`pipeline.ts:625`, `:1000`](../../lib/enrichment/pipeline.ts)). If you hand-write context and then re-run enrichment, your text will be replaced. Treat `context` as Gemini-owned.

6. **`organizations.icp_score` is always overwritten when Gemini returns one.** Same shape — `if (result.icp_score != null) updates.icp_score = result.icp_score` ([`pipeline.ts:627, :1002`](../../lib/enrichment/pipeline.ts)). Manual ICP overrides will be lost on re-run.

7. **`enrichment_stages` never gets `pending`/`processing` entries written.** The JSONB only ever flips to `completed` or `failed` in this code (`runFullEnrichment` writes everything in one batch at end of stage). The `processing` state is only visible in `job_log`, and the live UI infers the active stage from `job_log` rows with `status='processing'` (see [`enrichment-shell.tsx:632-634`](../../app/admin/enrichment/enrichment-shell.tsx)).

8. **Stub orgs from person pipeline have no enrichment.** Reverse linkage creates orgs with `enrichment_status: 'none'` ([`person-pipeline.ts:551`](../../lib/enrichment/person-pipeline.ts)). They will not auto-enrich — they need to be picked up by the next "default = unenriched" org enrichment run ([`organizations/route.ts:108-117`](../../app/api/enrich/organizations/route.ts)).

9. **`organization_signals` dedup is naive.** It compares lower-cased trimmed `description` strings ([`pipeline.ts:217-229`](../../lib/enrichment/pipeline.ts)) — no fuzzy matching, no semantic dedup. Re-running Gemini frequently produces near-duplicates that pass the check (e.g., "Series B funding announced" vs "Closed Series B round"). Consider this when consuming the signals table.

10. **People Finder client-side department filter loses results.** Apollo doesn't support `person_departments`, so we ask for `perCompany * 3` then filter ([`apollo-people.ts:140-144`, `:191-198`](../../lib/enrichment/apollo-people.ts)). If most senior people at the org are in a non-targeted department, you can end up with 0 results despite plenty of `total_available`. Currently mitigated by including unknown-department people ([`apollo-people.ts:194-197`](../../lib/enrichment/apollo-people.ts)).

11. **No enrichment cron.** [`migrations/004_cron.sql`](../../supabase/migrations/004_cron.sql) only schedules `send-scheduled` and `sync-status`. Enrichment is **always user-initiated** through the admin UI or a direct API call.

12. **Service-role client in API routes.** Both `/organizations` and `/persons` use `createClient(SUPABASE_URL, NEXT_SUPABASE_SECRET_KEY)` ([`organizations/route.ts:14-17`, `persons/route.ts:15-18`](../../app/api/enrich/organizations/route.ts)) — bypassing RLS. This is intentional (enrichment writes spans many tables and must work without a user session) but means the routes themselves must enforce any access control. Currently they don't.

---

## Appendix: file map

| File                                                                                                  | Purpose                                                  |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| [`lib/enrichment/pipeline.ts`](../../lib/enrichment/pipeline.ts)                                       | Org pipeline orchestrator. 1304 lines.                   |
| [`lib/enrichment/person-pipeline.ts`](../../lib/enrichment/person-pipeline.ts)                         | Person pipeline. 782 lines.                              |
| [`lib/enrichment/apollo.ts`](../../lib/enrichment/apollo.ts)                                           | Apollo Org Enrich client. 205 lines.                     |
| [`lib/enrichment/apollo-people.ts`](../../lib/enrichment/apollo-people.ts)                             | Apollo People Search + Match. 394 lines.                 |
| [`lib/enrichment/perplexity.ts`](../../lib/enrichment/perplexity.ts)                                   | Perplexity Sonar research client. 220 lines.             |
| [`lib/enrichment/gemini.ts`](../../lib/enrichment/gemini.ts)                                           | Gemini synthesis client + ICP prompt. 285 lines.         |
| [`lib/enrichment/fetch-with-retry.ts`](../../lib/enrichment/fetch-with-retry.ts)                       | Retry/timeout/abort wrapper. 105 lines.                  |
| [`app/api/enrich/organizations/route.ts`](../../app/api/enrich/organizations/route.ts)                 | Batch org enrich entry point. 244 lines.                 |
| [`app/api/enrich/persons/route.ts`](../../app/api/enrich/persons/route.ts)                             | Batch person enrich entry point. 207 lines.              |
| [`app/api/enrich/cancel/route.ts`](../../app/api/enrich/cancel/route.ts)                               | Job cancellation. 49 lines.                              |
| [`app/api/enrich/route.ts`](../../app/api/enrich/route.ts)                                             | **Legacy** contacts-table enrichment. 140 lines.         |
| [`supabase/migrations/022_enrichment_status.sql`](../../supabase/migrations/022_enrichment_status.sql) | Adds enrichment_status / enrichment_stages / last_enriched_at + backfill. |
| [`supabase/migrations/024_org_firmographic_columns.sql`](../../supabase/migrations/024_org_firmographic_columns.sql) | Adds industry / employee_count / annual_revenue / founded_year / hq_location / funding_total / latest_funding_stage. |
| [`app/admin/enrichment/enrichment-shell.tsx`](../../app/admin/enrichment/enrichment-shell.tsx)         | Admin UI — selection, run, polling. 988 lines.           |
| [`app/admin/enrichment/components/status-icons.tsx`](../../app/admin/enrichment/components/status-icons.tsx) | Per-stage and per-field icon rendering with relational-truth check. 200 lines. |
