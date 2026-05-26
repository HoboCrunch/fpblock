# Scripts & Runbooks

All operational scripts live in `scripts/`. They are TypeScript files run via `npx tsx`. Most read `.env.local` via `dotenv.config({ path: ".env.local" })` at the top of the file. CSV data lives under `consensus/` (and historical/archival data under `extra/scraping/`).

---

## Script catalogue

### Consensus campaign — current pipeline

| Script | Purpose | When to run | Inputs | Outputs |
| --- | --- | --- | --- | --- |
| `scripts/import-consensus.ts` | Import Consensus 2026 sponsor + speaker CSVs into Supabase (orgs, persons, event_participations) | Once at campaign start | `consensus/companies_consensus.csv`, `consensus/speakers_consensus.csv`, `consensus/consensus_2026_all.csv` | DB rows under event slug `consensus`; `SOURCE_TAG=consensus_import` |
| `scripts/enrich-consensus.ts` | Run the full enrichment pipeline (Apollo + Perplexity + Gemini + people-finder) for the Consensus event window | After import; rerun as needed for failed rows | `EVENT_ID` hardcoded (`scripts/enrich-consensus.ts:8`); CLI arg `persons` / `orgs` / `both` (default `both`) | Updates orgs, persons, ICP scores, signals |
| `scripts/export-consensus-contacts.ts` | Dump the enriched event participants to a flat CSV for the agent pipeline | After enrichment, before message generation | DB | `consensus/consensus_contacts_enriched.csv` |
| `scripts/prep-speaker-outreach.ts` | Classify speakers (founder / C-level / large org), assign Wes-vs-JB sender + landing page, shard into 5 agent-input JSON files | After export | `consensus/consensus_contacts_enriched.csv` (filtered to `consensus_direct_participant=true`) | `consensus/outreach_agent_inputs/agent_{1..5}.json`, `consensus/speakers_classified.csv` |
| `scripts/prep-employee-outreach.ts` | Same, for sponsor-company employees (non-speakers). Shards into 8 chunks | After export | `consensus/consensus_contacts_enriched.csv` (`consensus_direct_participant=false`) | `consensus/employee_agent_inputs/agent_{1..8}.json`, `consensus/employees_classified.csv` |
| `scripts/merge-outreach-messages.ts` | Merge 5 speaker agent outputs into one CSV joined with classification | After agents finish | `consensus/outreach_agent_outputs/agent_{1..5}.json` + `speakers_classified.csv` | `consensus/outreach_messages.csv` |
| `scripts/merge-employee-outreach.ts` | Merge 8 employee agent outputs; runs banned-phrase scan | After agents finish | `consensus/employee_agent_outputs/agent_{1..8}.json` + `employees_classified.csv` | `consensus/outreach_messages_employees.csv` |
| `scripts/revise-subject-lines.ts` | Replace agent-written subjects with deterministic templates from a per-sender pool (hash by `person_id`); back-propagates to agent JSONs | When subjects are too repetitive or off-tone | `consensus/outreach_messages.csv` | rewrites `outreach_messages.csv` + `consensus/outreach_agent_outputs/agent_{1..5}.json` |
| `scripts/chunk-employee-sends.ts` | Bucket employee rows into 5 send days (Mon–Fri) by sponsor tier × C-level × founder | After merging employee outreach | `consensus/outreach_messages_employees.csv` | `consensus/send_day_{1..5}.csv` |
| `scripts/send-outreach.ts` | Actually send via SendGrid. Idempotent (skips entries already in `send_log.jsonl`), paced 1/sec, aborts on 3 consecutive failures in first 5 sends. After each successful send, writes an `interactions` row inline (`detail.source='script_send'`). | Daily, once per `send_day_N.csv` | `--csv` (default `consensus/outreach_messages.csv`), `--limit`, `--dry-run`, `--test-to`, `--yes` | `consensus/send_log.jsonl` (append-only JSONL) + `interactions` DB rows |

### Other / legacy data scripts

| Script | Purpose |
| --- | --- |
| `scripts/import-all.ts` | Bulk import from 6 historical sources (company_research, sponsors, dcblockchain, jb-sheet, eli-sheet, news cache). Auths as `admin@gofpblock.com` with `ADMIN_PASSWORD` |
| `scripts/seed-and-import.ts` | Foundational seed + `enriched_speakers.csv` import. Same admin login pattern |
| `scripts/seed-crm.ts` | Full CRM seed from `fp-data-seed/` (events, speakers, sponsors, Genzio sheets, intros). Includes correlation pass |
| `scripts/migrate-csv.ts` | One-shot migration from `scraping/data/` and `app/data/matrix/base/` CSVs into the new schema |
| `scripts/verify-event-affiliations.ts` | Integration test for the `person_event_affiliations` triggers — creates fixtures, asserts row counts. Needs `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` |

### Archival Python (`extra/scraping/scripts/`)

Historical scripts from the EthCC Cannes data run (per project memory). **Not part of the live pipeline** but kept for reference: `apollo_enrich.py`, `apollo_sponsor_people.py`, `enrich.py`, `outreach.py` (uses `anthropic` SDK), `draft_messages.py`, `write_messages.py`, `merge_rewrites.py`, `role_enrich.py`, `scrape.py`, `heyreach_send.py`.

---

## The Consensus pipeline (parallel-agent orchestration)

The core insight: agent-written copy is generated in parallel by spawning N Claude Code subagents, each handed a JSON shard of contacts plus a brief.

```
DB (orgs, persons, event_participations)
   │
   │  scripts/export-consensus-contacts.ts
   ▼
consensus/consensus_contacts_enriched.csv
   │                               │
   │ prep-speaker-outreach.ts      │ prep-employee-outreach.ts
   ▼                               ▼
outreach_agent_inputs/agent_{1..5}.json    employee_agent_inputs/agent_{1..8}.json
       │                                       │
       │  parallel agents (one per shard)      │
       │  read AGENT_BRIEF.md / EMPLOYEE_BRIEF.md
       │  write back JSON of {person_id, subject, body, notes}
       ▼                                       ▼
outreach_agent_outputs/agent_{1..5}.json    employee_agent_outputs/agent_{1..8}.json
       │                                       │
       │ merge-outreach-messages.ts            │ merge-employee-outreach.ts
       ▼                                       ▼
consensus/outreach_messages.csv           consensus/outreach_messages_employees.csv
       │                                       │
       │ revise-subject-lines.ts (optional)    │ chunk-employee-sends.ts
       ▼                                       ▼
(rewrites in place)                    consensus/send_day_{1..5}.csv
       │                                       │
       └──────────────────┬────────────────────┘
                          ▼
                 scripts/send-outreach.ts --csv ...
                          ▼
                 consensus/send_log.jsonl
```

### The two briefs

- **`consensus/AGENT_BRIEF.md`** — for **speakers** at Consensus 2026. Frames opener as `"Saw you're speaking at Consensus for {org}"`. Sender split: `wes@gofpblock.com` for C-level, `jb@gofpblock.com` for the rest. Body 55–80 words, subject 4–9 words. Lists banned phrasings, gold-standard examples, voice rules, expertise-line variants.
- **`consensus/EMPLOYEE_BRIEF.md`** — for **employees of sponsor companies** (not speakers). Critical reframe: do **not** say "saw you're speaking" — use `"Saw {Org} is in the Consensus sponsor lineup"` etc. Same sender/length rules, softer conditional close ("if you're in Miami for the week"). Sponsor-tier nuance: platinum/gold can be slightly warmer, copper/community stays measured.

Both briefs share the FP Block voice rules: no "blockchain/Web3/crypto/DeFi" lead, no hype words, "we're hosting" not "FP Block is hosting", soft close (no "Looking forward to hearing").

### Output schema each agent must write

```json
[
  {
    "person_id": "<copy from input>",
    "subject": "<4-9 word subject>",
    "body": "<55-80 word body, plain text, \\n line breaks>",
    "notes": "<optional>"
  }
]
```

---

## Runbook: send a campaign day-by-day

Pre-flight (once per campaign):

```bash
npx tsx scripts/import-consensus.ts
npx tsx scripts/enrich-consensus.ts both
npx tsx scripts/export-consensus-contacts.ts
npx tsx scripts/prep-speaker-outreach.ts          # → 5 agent input shards
npx tsx scripts/prep-employee-outreach.ts         # → 8 agent input shards
```

Spawn agents (developer harness or parallel subagent dispatch) — each agent reads its shard, the relevant brief, and writes to `consensus/{outreach,employee}_agent_outputs/agent_N.json`. Then:

```bash
npx tsx scripts/merge-outreach-messages.ts        # speakers → outreach_messages.csv
npx tsx scripts/merge-employee-outreach.ts        # employees → outreach_messages_employees.csv
npx tsx scripts/revise-subject-lines.ts           # optional: dedupe + retone subjects
npx tsx scripts/chunk-employee-sends.ts           # → send_day_{1..5}.csv
```

**Daily send** — `chunk-employee-sends.ts` produces these in tier order (`scripts/chunk-employee-sends.ts:34-48`):

| Day | File | Cohort |
| --- | --- | --- |
| Mon | `consensus/send_day_1.csv` | Platinum + Gold + Silver/Bronze C-level |
| Tue | `consensus/send_day_2.csv` | Bronze non-C, Copper founders, Community C-level |
| Wed | `consensus/send_day_3.csv` | Copper C-level non-founders |
| Thu | `consensus/send_day_4.csv` | Copper non-C-level |
| Fri | `consensus/send_day_5.csv` | Community + Marketing partners, non-C-level |

Send each day:

```bash
# 1. dry-run (no API calls, full plan output)
npx tsx scripts/send-outreach.ts --csv consensus/send_day_1.csv --dry-run

# 2. test send to yourself
npx tsx scripts/send-outreach.ts --csv consensus/send_day_1.csv --test-to evan@opsprocket.com

# 3. live, with the explicit safety flag
npx tsx scripts/send-outreach.ts --csv consensus/send_day_1.csv --yes
```

**Safety properties** of `scripts/send-outreach.ts`:
- Refuses live sends without `--yes` (`scripts/send-outreach.ts:80-85`).
- Skips any `person_id` already logged as `success` in `consensus/send_log.jsonl` (`send-outreach.ts:46-57`) — safe to re-run mid-day.
- Aborts after 3 consecutive failures in the first 5 sends to catch auth/sender-verification breakage early (`send-outreach.ts:142-145`).
- 1/sec pacing (`send-outreach.ts:148-150`).
- Sender display name keyed off `r.sender_email`: Wes Crook for `wes@gofpblock.com`, JB at FP Block for `jb@gofpblock.com` (`send-outreach.ts:16-19`).

The speaker campaign (`consensus/outreach_messages.csv`) is **not** day-chunked by `chunk-employee-sends.ts` — for speakers, send the whole CSV (or use `--limit`) on day one. Verify with team if a speaker chunker is desired.

---

## Runbook: re-prep employee outreach (e.g. brief changes)

```bash
# 1. Rewrite the brief at consensus/EMPLOYEE_BRIEF.md
# 2. Re-shard if class assignment changed
npx tsx scripts/prep-employee-outreach.ts
# 3. Have agents regenerate agent_{1..8}.json under employee_agent_outputs/
# 4. Re-merge
npx tsx scripts/merge-employee-outreach.ts
# 5. (optional) re-revise subjects
npx tsx scripts/revise-subject-lines.ts   # NOTE: this script targets the speakers CSV; for employees, rerun a tailored version or do it manually
# 6. Rebuild day chunks
npx tsx scripts/chunk-employee-sends.ts
```

Note: `revise-subject-lines.ts` is currently hardcoded to `consensus/outreach_messages.csv` and writes back to `consensus/outreach_agent_outputs/agent_{1..5}.json` (`scripts/revise-subject-lines.ts:10, 100`). Don't run it against the employee output without parameterizing it.

---

## Runbook: revise subject lines

Use when the agent-written subjects are too repetitive or fall outside guidelines:

```bash
npx tsx scripts/revise-subject-lines.ts
```

What it does (`scripts/revise-subject-lines.ts`):
1. Reads `consensus/outreach_messages.csv`.
2. Picks a deterministic template per row by hashing `person_id` into a sender-specific pool (Wes pool vs JB pool, lines 27–47).
3. Writes back the CSV.
4. **Back-propagates** new subjects into all five `outreach_agent_outputs/agent_N.json` files so a future re-merge stays consistent (lines 99–108).
5. Prints top 10 most-used subjects + unique count for sanity.

The Wes pool is calmer/peer-to-peer; the JB pool opens "Hey {first} —" more often.

---

## Cron / sequencing implied by file naming

- `consensus/send_day_1.csv` … `send_day_5.csv` — Mon–Fri schedule produced by `chunk-employee-sends.ts`. Operator runs `send-outreach.ts --csv consensus/send_day_N.csv --yes` once per day. **Not automated** — the script is interactive.
- `vercel.json` schedules `/api/sequences/send` every 5 minutes — that is a separate pipeline (Sequences feature) for ongoing drips, not the campaign-day batch script.
- `supabase/migrations/034_inbox_sync_cron_hourly.sql` unschedules the legacy per-account pg_cron jobs from `016_inbox_sync_cron.sql` (`sync-inbox-jb`, `sync-inbox-wes`) — never functional (unfilled `https://YOUR_APP_URL` placeholder). It registers no replacement.
- `app/api/cron/inbox-sync/route.ts` is the active inbox-sync mechanism: a Vercel cron (`vercel.json:crons` → `/api/cron/inbox-sync`, every 5 min) gated by `CRON_SECRET`. One pass covers every configured identity.

---

## Runbook: backfill script-send interactions (Stage 1)

**Script:** `scripts/backfill_script_sends.ts`

**What it does:**
Reads the three JSONL send logs produced by `scripts/send-outreach.ts` (`consensus/send_log.jsonl`, `consensus/miami_dinner_send_log.jsonl`, `consensus/miami_dinner_bump1_send_log.jsonl`) and, for each successful, non-test-redirect, non-dry-run entry, inserts one `interactions` row into Supabase with `interaction_type='cold_email'`, `channel='email'`, `direction='outbound'`, `status='sent'`, `detail.source='script_backfill'`, and the original `sendgrid_message_id`. Body/subject are resolved from per-log source CSVs (see CSV→log mapping below).

**When to run:**
Once after any net-new campaign send log is produced — particularly after running `scripts/send-outreach.ts` for a new CSV that wasn't previously in the DB. Also run if migration 031 (the `uniq_interactions_sendgrid_message_id` index) is applied to a DB that hasn't been backfilled yet. **Always run before `scripts/recorrelate_inbound.ts` (Stage 2).**

**CSV → log mapping:**
Defined in `lib/script-sends/source-csv-map.ts`. Each log's source CSV candidates are walked in order; first `(person_id, subject)` match wins.

| Log basename | Source CSV candidates |
|---|---|
| `send_log.jsonl` | `consensus/outreach_messages.csv`, `consensus/outreach_messages_employees.csv` |
| `miami_dinner_send_log.jsonl` | `email-napalm.csv`, `email-napalm-q{1q2,3,4-half}.csv`, `email-napalm-no-replies.csv` |
| `miami_dinner_bump1_send_log.jsonl` | `email-napalm-bump1.csv`, `email-napalm-bump1-q{1q2,3}.csv` |

**Commands:**

```bash
# 1. Dry-run — no DB writes, prints what would be inserted
npx tsx scripts/backfill_script_sends.ts --dry-run

# 2. Live run (required --yes flag)
npx tsx scripts/backfill_script_sends.ts --yes

# 3. Single log only
npx tsx scripts/backfill_script_sends.ts --yes --only miami_dinner_send_log.jsonl

# 4. Limited rows (for testing)
npx tsx scripts/backfill_script_sends.ts --yes --limit 50
```

**Env required:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_SUPABASE_SECRET_KEY` in `.env.local`.

**Before running:**
- Confirm migrations 030 and 031 are applied (`npx supabase db push --linked` or check `supabase/migrations/`).
- Confirm the source CSV files exist at repo root / `consensus/` (dry-run will fail fast if they're missing).

**After running:**
- Check the printed summary (`inserted`, `skipped`, `errors`). Zero errors is expected — duplicate `sendgrid_message_id` rows are skipped via the unique index (not an error).
- Verify in Supabase: `SELECT count(*) FROM interactions WHERE detail->>'source' = 'script_backfill';` should match the inserted count.

**Idempotency:** Fully idempotent. Duplicate rows conflict on `uniq_interactions_sendgrid_message_id` and are ignored. Re-running after partial failure is safe.

**Caveats:**
- Entries with `dry_run=true` or a `to_actual` that looks like a test redirect (not the real recipient) are skipped and counted as `unbackfillable`.
- Entries where body resolution finds no match in any source CSV are also skipped. The script prints the first few unresolvable entries for debugging.
- Sender is resolved by looking up the sender email in `sender_profiles`. A missing profile causes a skip.

---

## Runbook: re-correlate inbound emails against new interactions (Stage 2)

**Script:** `scripts/recorrelate_inbound.ts`

**What it does:**
Pages through all `inbound_emails` rows where `direction='inbound'`, re-runs `correlateAndNotify(..., { notify: false })` against each one, and prints a final summary: `{ processed, newlyMatched, flipped, stillUnmatched }`. Telegram notifications are suppressed — historical mail does not need to re-alert the team. "Flipped" means an inbound email now has a `correlated_interaction_id` pointing to an outbound row that was previously absent.

**When to run:**
Always run **after** `scripts/backfill_script_sends.ts` (Stage 1) completes. Also useful after any correlator logic change or after a batch of new persons is imported whose emails match historical inbound. The API equivalent (`POST /api/inbox/recorrelate`) does the same thing but without per-100 progress logging.

**Commands:**

```bash
# Full pass
npx tsx scripts/recorrelate_inbound.ts

# Limited (for testing)
npx tsx scripts/recorrelate_inbound.ts --limit 200
```

**Env required:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_SUPABASE_SECRET_KEY` in `.env.local`.

**Before running:**
- Stage 1 backfill must be complete. Running this first means replies from script recipients won't find their matching outbound rows yet.
- No migrations required beyond 031 (already needed by Stage 1).

**After running:**
- Review `flipped` count — this is the number of inbound emails now correlated to an outbound interaction (reply threads resolved).
- `stillUnmatched` covers emails with no person in the DB; those are expected for cold inbound from unknown senders.
- Verify a sample: in Supabase, pick a `correlated_interaction_id` and confirm it points to a `status='replied'` interactions row.

**Idempotency:** Fully idempotent. Re-running overwrites `correlated_interaction_id` with the best current match, which is harmless (same result on repeat). No inserts or deletes are performed.

**Caveats:**
- Pages in batches of 500 ordered by `received_at ASC`. Very large datasets take a few minutes — use `--limit` to test a subset first.
- Progress is logged every 100 rows to stdout.
