# Unified Job Visibility System — Design

**Date:** 2026-05-26
**Status:** Approved (brainstorming) — pending implementation plan

## Problem

Transient background work (enrichment runs, CSV imports) gives the user no reliable
live feedback, so the app *looks broken* when it is merely busy:

1. **Enrichment "x/x" does not update live in production.** Progress is held in the
   originating page's React state and the parent `job_log` row only receives counts
   at the *end* of the run. Navigate away (or let a >300s batch get killed) and the
   progress is gone and the job hangs at `processing` forever.
2. **CSV uploads block the UI.** `app/admin/uploads/actions.ts` runs a synchronous
   server action that only writes the `uploads` row at start and end — no incremental
   progress, and large files risk Vercel's 300s ceiling.
3. **The job-history popup is enrichment-page-local.** It unmounts on navigation, so
   there is no app-wide place to watch in-flight work.

## Goals

- One **relational** source of truth for all transient jobs (no in-memory or
  JSONB-derived progress — see the project's enrichment-data-truth rule).
- Live, **persistent-across-navigation** visibility of every job from any admin page.
- Async, **resumable** CSV imports backed by Storage.
- Completion toasts and stall detection so a job is never a silent infinite spinner.

## Non-Goals (YAGNI)

- Dedicated `/admin/jobs/[id]` full page — the drawer's inline expansion is the detail
  surface. The existing `app/admin/enrichment/[jobId]/page.tsx` stays **as-is**.
- Supabase Realtime — smart polling (the codebase's existing pattern) is sufficient.
- Inline progress bars on trigger buttons.
- Per-row child `job_log` rows for uploads — aggregate progress only.

---

## Architecture

### 1. Data model — generalize `job_log` (migration `037`)

`job_log` becomes the single abstraction for all transient work. Add first-class,
nullable columns (existing rows default cleanly):

| Column | Type | Purpose |
|---|---|---|
| `label` | `text` | Human title — "Import contacts.csv", "Enrich 100 organizations" |
| `progress_total` | `int default 0` | Denominator of x/x |
| `progress_completed` | `int default 0` | Numerator |
| `progress_failed` | `int default 0` | Failed count |
| `phase` | `text` | Current phase — "Apollo", "Parsing rows", "Linking events" |
| `updated_at` | `timestamptz default now()` | Last progress write; drives stall detection |
| `parent_job_id` | `uuid references job_log(id)` | Links child stage rows to their parent batch (replaces fragile time-window matching) so the drawer can fetch a job's children reliably |

- A `BEFORE UPDATE` trigger sets `updated_at = now()` on every write (mirror of the
  existing name-parts trigger style) — chosen over caller-set timestamps so stall
  detection is reliable regardless of which code path writes progress.
- Status set extends to: `pending · processing · completed · failed · cancelled · stalled`.
  No CHECK constraint exists today on `job_log.status`; if one is added it must include
  all six. Confirm during plan.
- `metadata` continues to hold job-type-specific config (upload column mappings, dedupe
  mode, event map, `storage_path`, filename, row_count).
- Index: `create index idx_job_log_active on job_log (status) where status in
  ('pending','processing');` to keep the global poll cheap.
- Ship a paired `037_*.verify.sql` (matches repo convention).

`job_type` values in scope: existing enrichment types (`enrichment`,
`enrichment_batch_organizations`, `enrichment_batch_persons`, `enrichment_person`,
`enrichment_apollo`/`perplexity`/`gemini`/`people_finder` child rows) plus the new
`csv_import`.

### 2. Uploads → async, Storage-backed, resumable

**Storage bucket:** create a private bucket `csv-imports`. Raw files stored at
`{jobId}.csv`. (Bucket creation via migration/SQL or documented manual step — decide in
plan; the supabase MCP/CLI is available for prod.)

**Upload step (client, `app/admin/uploads/page.tsx`):**
1. Parse CSV in the browser (unchanged — PapaParse).
2. Resolve unknown events via the existing modal (unchanged).
3. Upload the raw CSV to `csv-imports/{jobId}.csv`.
4. Create a `job_log` row: `job_type:'csv_import'`, `status:'pending'`,
   `label:'Import {filename}'`, `progress_total: rowCount`, `metadata:{ mode, mappings,
   duplicateHandling, eventMap, filename, storage_path }`.
5. `POST /api/uploads/process { jobId }` to start processing, then return — **UI is no
   longer blocked**; the global drawer surfaces progress.

**Processor (`POST /api/uploads/process`, `maxDuration = 300`):**
- Loads the `job_log` row + CSV from Storage.
- Reuses the existing import logic in `app/admin/uploads/actions.ts` (extract the
  per-row insert/update/link logic into a shared `lib/uploads/import-runner.ts` so both
  the route and any cron caller use one code path).
- Sets `status:'processing'`, writes `progress_completed/failed/phase` **every N rows**
  (N ≈ 50), and `status:'completed'`/`'failed'` at the end.
- Continues to write the legacy `uploads` table row (start + finalize) so the existing
  upload-history table on `app/admin/uploads/page.tsx` keeps working unchanged. `job_log`
  is the live/progress source; the `uploads` row remains the durable per-file summary.
  (A later pass can consolidate them; out of scope here.)

**Resumability (cron):**
- Add `{ "path": "/api/cron/process-jobs", "schedule": "*/5 * * * *" }` to `vercel.json`.
- `GET /api/cron/process-jobs` (service-role client + `CRON_SECRET`, GET — matches the
  sequence/inbox cron conventions) finds `csv_import` jobs that are `pending`, or
  `processing` with `updated_at` older than the stall threshold, and resumes them from
  Storage. Because raw CSV + config persist, a killed function just resumes. Resume must
  be idempotent — the import logic's dedupe modes already make re-processing safe; the
  processor should skip rows already counted (track a `processed_offset` in metadata).

### 3. Fix enrichment live progress

In `lib/enrichment/pipeline.ts`, `runBatchEnrichment` already writes per-org/per-stage
child `job_log` rows. Add incremental writes to the **parent** row: as each org
completes, update `progress_completed` (+`progress_failed`) and `phase`, and set
`progress_total` at start. The end-of-run `completed` update stays. This makes live x/x
correct from any client, independent of the originating tab.

### 4. Persistent global "Process Details" drawer

**Mount point:** `app/admin/admin-shell.tsx` (inside `QueryProvider`, outside `<main>`)
so it survives client-side navigation. Wrap with a new `ProcessDetailsProvider`.

**Data:** new global hook `lib/queries/use-jobs.ts` → `useJobs()` polling `job_log`
(parent jobs across all types, `limit ~50`, newest first). `refetchInterval`: ~4s while
any job is `pending`/`processing`/`stalled`, else `false` — mirrors
`use-enrichment-jobs.ts`. Add a `jobs` entry to `lib/queries/query-keys.ts`.

**Component `components/admin/process-details-drawer.tsx`** (generalize the existing
`app/admin/enrichment/components/job-history-drawer.tsx`):
- Renamed header **"Process Details"**, bottom-right, collapsible, current glass styling.
- **Collapsed:** job count + live x/x of the most-recent active job.
- **Expanded:** scrollable historic list; each row shows label, status pill, x/x, phase,
  relative time. Active jobs pinned on top.
- **Per-job inline expansion** via a small **renderer registry** keyed by `job_type`:
  - `enrichment*` → per-org line list using existing `OrgStatusIcons`, driven by child
    `job_log` rows (reuse the enrichment shell's child-row query, extracted to a hook).
  - `csv_import` → progress bar, x/x, current phase, recent errors from metadata.
  - default → generic progress bar + phase.
- **Auto-surface:** provider opens the drawer when a new active job id appears.

**Provider `ProcessDetailsProvider`** owns: open/collapsed state, expanded job id,
auto-surface logic, and the toast watcher (below). Exposes `openJob(jobId)`.

**Enrichment page cleanup:** remove the page-local `JobHistoryDrawer` usage from
`enrichment-shell.tsx` in favor of the global drawer (avoid two stacked drawers). The
in-table live stage icons can remain, but should read from the same child-row source.

### 5. Completion toasts

`useJobToasts()` inside the provider diffs the `useJobs()` list across polls. For any job
whose id was seen `processing` this session and now reads `completed`/`failed`, fire the
existing `toast.success`/`toast.error` (`components/ui/toast.tsx`). Toast click →
`openJob(jobId)` (opens drawer, expands job). Track seen ids in a ref to avoid
re-firing; only toast jobs observed active this session (no backfill spam on load).

### 6. Stall detection

The drawer derives a display status of `stalled` (amber) when `status='processing'` and
`now - updated_at > STALL_MS` (reuse the enrichment 15-min convention; consider a
shorter 5-min for uploads). Stalled enrichment shows the existing `?retry={jobId}`
affordance; stalled uploads are auto-resumed by the cron sweep.

---

## Data Flow

```
CSV upload:
  browser parse → upload to csv-imports/{jobId}.csv → insert job_log(pending)
    → POST /api/uploads/process → processing, write progress every N rows → completed
  (cron /api/cron/process-jobs resumes pending/stalled jobs from Storage)

Enrichment:
  POST /api/enrich/* → insert job_log(processing) → runBatchEnrichment writes
    parent progress incrementally + child rows → completed

Visibility (any page):
  ProcessDetailsProvider → useJobs() polls job_log (4s while active)
    → drawer renders list + inline per-type detail
    → useJobToasts() fires toast on completed/failed transition
```

## Components & Files

**New**
- `supabase/migrations/037_job_log_progress.sql` (+ `.verify.sql`)
- `lib/uploads/import-runner.ts` — shared row-import logic
- `app/api/uploads/process/route.ts` — processor
- `app/api/cron/process-jobs/route.ts` — resume sweep
- `lib/queries/use-jobs.ts` — global jobs hook
- `lib/jobs/` — shared types, `STALL_MS`, status helpers, x/x derivation
- `components/admin/process-details-drawer.tsx` — global drawer
- `components/admin/process-details-provider.tsx` — context + auto-surface + toasts
- `components/admin/job-renderers/` — per-type inline renderers

**Modified**
- `supabase` Storage — `csv-imports` bucket
- `vercel.json` — add process-jobs cron
- `app/admin/uploads/page.tsx` + `actions.ts` — async upload flow
- `lib/enrichment/pipeline.ts` — parent incremental progress
- `app/admin/admin-shell.tsx` — mount provider + drawer
- `lib/queries/query-keys.ts` — `jobs` key
- `app/admin/enrichment/enrichment-shell.tsx` — drop local drawer, share child-row source

## Error Handling

- Processor failures → `status:'failed'`, error message in `error`/`metadata`; toast.
- Storage upload failure → no job created, inline error on the upload page.
- Cron resume is idempotent (offset tracking + dedupe modes).
- Stalled processing jobs are surfaced (amber) and auto-resumed (uploads) or retryable
  (enrichment).

## Testing

- Unit: x/x derivation + display-status (incl. stalled) in `lib/jobs/`; `import-runner`
  row mapping/dedupe (vitest, matching repo setup).
- Migration: `037_*.verify.sql` asserts columns/defaults/index exist.
- Manual: upload a CSV → drawer shows live x/x, survives navigation, completion toast;
  enrichment run shows live parent progress from a different page; kill mid-upload →
  cron resumes.

## Delivery

One spec → one parallel agent team, ~5 workstreams:
- **A** migration + Storage bucket + `lib/jobs` types
- **B** upload async rewrite (`import-runner`, process route, cron, page wiring)
- **C** enrichment parent incremental-progress fix
- **D** global drawer + provider + per-type renderers + `useJobs`
- **E** toasts + stall detection + enrichment-page drawer cleanup

Dependencies: A is foundational (B, C, D depend on the new columns/types). B/C/D/E
otherwise parallelizable; E depends on D's provider.
