# Edge Functions & API Routes

Six Supabase Edge Functions (Deno runtime) in `supabase/functions/`, plus Next.js API routes in `app/api/` for enrichment, inbox sync, interaction generation/sending, and correlation merging.

## Shared

**`_shared/cors.ts`** — CORS headers used by all functions:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type
```

All functions handle OPTIONS preflight and return JSON responses.

---

## enrich-contact

**Path:** `supabase/functions/enrich-contact/index.ts`
**External API:** Apollo (`/v1/people/match`)
**Auth:** `X-Api-Key` header (not body param)

**Purpose:** Enrich persons with professional data from Apollo. Fills in email, LinkedIn, Twitter, phone, seniority, department, and Apollo ID on the `persons` table. Does not overwrite existing values.

**Input:**
```json
{ "person_id": "uuid" }
// or batch:
{ "person_ids": ["uuid1", "uuid2"] }
```

**Behavior:**
1. Loads person + primary organization name from Supabase
2. Calls Apollo People Match with first_name, last_name, organization_name
3. Updates person fields that are currently null
4. Logs to job_log (started → completed/failed)
5. Rate limits 500ms between batch calls

---

## enrich-company

**Path:** `supabase/functions/enrich-company/index.ts`
**External APIs:** Brave Search, Perplexity (sonar model), Gemini 2.0 Flash

**Purpose:** Research organizations using web search and AI synthesis. Produces a context paragraph and structured signals.

**Input:**
```json
{ "organization_id": "uuid" }
// or batch:
{ "organization_ids": ["uuid1", "uuid2"] }
```

**Pipeline:**
1. Brave Search: top 5 web results for `{organization} recent news 2025 2026`
2. Perplexity: deeper analysis of news, partnerships, funding, product launches
3. Gemini: synthesizes both into:
   - `context`: 2-3 sentence summary (written to `organizations.context`)
   - `signals[]`: typed events (written to `organization_signals` table)

**Signal types:** news, funding, partnership, product_launch, regulatory, hiring, award

---

## generate-messages

**Path:** `supabase/functions/generate-messages/index.ts`
**External API:** Gemini 2.0 Flash

**Purpose:** Generate outreach interactions using templated prompts with person/organization context. Creates interactions of type `cold_email`, `cold_linkedin`, etc.

**Input:**
```json
{
  "person_ids": ["uuid1", "uuid2"],
  "initiative_id": "uuid",
  "channels": ["cold_linkedin", "cold_email"],  // optional, defaults to both
  "sequence_number": 1,                          // optional, default 1
  "prompt_template_id": "uuid",                 // optional override
  "sender_id": "uuid",                          // optional override
  "cta": "https://..."                          // optional override
}
```

**Behavior:**
1. Loads initiative config for defaults (sender, CTA, prompt template)
2. For each person:
   - Loads person + primary organization + recent signals
   - Loads previous interaction if follow-up (sequence_number > 1)
   - For each channel:
     - Resolves prompt template (explicit override > channel-specific > initiative default)
     - Fills template variables (`{{person.full_name}}`, `{{organization.context}}`, etc.)
     - Calls Gemini with system + user prompts
     - Parses email subject if channel is "cold_email"
     - Supersedes existing interaction at same position (marks old as `superseded`, increments iteration)
     - Inserts new interaction as `draft`

---

## send-message

**Path:** `supabase/functions/send-message/index.ts`
**External APIs:** SendGrid (`/v3/mail/send`), HeyReach (`/api/v1/messages/send`)

**Purpose:** Send approved/scheduled interactions via the appropriate channel.

**Input:**
```json
{ "interaction_id": "uuid" }
// or batch:
{ "interaction_ids": ["uuid1", "uuid2"] }
// or cron-triggered:
{ "source": "cron" }
```

**Channel handling:**
- **cold_email**: SendGrid — requires person.email and sender.email. Converts body newlines to `<br>`, appends signature.
- **cold_linkedin**: HeyReach — requires person.linkedin and sender.heyreach_account_id.
- **cold_twitter**: Marks as `approved` for manual send (no API integration).

**CRON mode:** When `source: "cron"`, fetches all interactions with `status = "scheduled"` and `scheduled_at <= now()`.

**Double-send prevention:** Sets status to `processing` before sending.

---

## sync-status

**Path:** `supabase/functions/sync-status/index.ts`
**External API:** SendGrid Activity API (`/v3/messages`)

**Purpose:** Poll for delivery status updates on sent interactions.

**Behavior:**
1. Fetches all interactions with `type = "cold_email"` and `status = "sent"`
2. For each, queries SendGrid Activity API for events
3. Updates interaction status:
   - bounce/dropped → `bounced`
   - open → `opened`
4. Rate limits 200ms between API calls
5. HeyReach LinkedIn status sync is stubbed (TODO)

**Scheduled:** Runs hourly at :30 via pg_cron.

---

## process-automations

**Path:** `supabase/functions/process-automations/index.ts`
**External APIs:** None (dispatches to other edge functions)

**Purpose:** Evaluate automation rules when data changes and trigger appropriate actions.

**Input:**
```json
{
  "table": "persons",
  "event": "INSERT",
  "id": "uuid"
}
```

**Condition operators:**
- `gte`, `lte`, `eq`, `neq`: comparison operators
- `in`: array membership
- Literal values: exact match

**Example rule:** When a person_organization is inserted and the organization has `icp_score >= 75`, automatically trigger `enrich_contact`.

**Triggered by:** `pg_notify('automation_trigger', ...)` from database triggers on persons, organizations, and person_organizations tables.

---

## Next.js API Routes

These live in `app/api/` and run in the Next.js server (not Deno). They use server-side Supabase client and have access to `.env.local` variables.

### POST /api/enrich

**Path:** `app/api/enrich/route.ts`

Triggers Apollo enrichment for selected persons. Creates a `job_log` entry with `job_type = 'enrichment'` and status `processing`. Returns the job ID for polling. Targets the `persons` table.

**Input:**
```json
{
  "personIds": ["uuid1", "uuid2"],
  "fields": ["email", "linkedin", "twitter", "phone"]
}
```

**Note:** Currently creates the job log entry only. Full Apollo API integration to be ported from `scripts/apollo_enrich.py`.

### POST /api/enrich/organizations

**Path:** `app/api/enrich/organizations/route.ts`

Organization enrichment pipeline orchestrator. Runs a five-stage enrichment with smart ordering based on data availability.

**Input:**
```json
{
  "organizationIds": ["uuid1", "uuid2"],
  "eventId": "uuid",
  "initiativeId": "uuid",
  "icpBelow": 50,
  "stages": ["apollo", "perplexity", "gemini", "people_finder", "full"],
  "peopleFinderConfig": {
    "perCompany": 5,
    "seniorities": ["owner", "founder", "c_suite", "vp", "director"],
    "departments": []
  }
}
```

**Pipeline stages:**
1. `runPerplexityEnrichment(orgId)` — Perplexity Sonar for deep research + website/domain discovery
2. `runApolloEnrichment(orgId)` — Apollo org API for firmographics (industry, employees, revenue, funding, tech stack, HQ). Retries with name-based lookup if domain fails.
3. `runGeminiSynthesis(orgId)` — Gemini 2.0 Flash combines Apollo + Perplexity data, reads ICP criteria from `company_context` table, outputs structured fields with ICP score 0-100
4. `runPeopleFinderEnrichment(orgId, config)` — Apollo People Search finds contacts at org, deduplicates against existing persons, creates/merges person records with source tracking
5. Signal extraction — inserts typed signals into `organization_signals`

**Smart ordering:**
- **Parallel path** (org has website): Apollo + Perplexity run simultaneously, then Gemini, then People Finder
- **Discovery path** (no website): Perplexity runs first to discover domain, then Apollo with discovered domain, then Gemini, then People Finder

**People Finder** (`peopleFinderConfig`):
- `perCompany` (1-25): max contacts per org
- `seniorities`: filter by seniority level (owner, founder, c_suite, partner, vp, director, manager, senior, entry)
- `departments`: client-side filter (engineering, sales, marketing, etc.)
- Two-step: search via `/api/v1/mixed_people/api_search`, then enrich each via `/v1/people/match` for contact details
- Deduplication: exact match on apollo_id → email → linkedin_url, then fuzzy correlations via `find_person_correlations` RPC
- New persons: `source = 'org_enrichment'`, `person_organization.is_primary = true`
- Existing persons: COALESCE (only fill null fields)

**Full pipeline:** `runFullEnrichment(orgId, peopleFinderConfig)` runs all stages with smart ordering.
**Batch mode:** `runBatchEnrichment(orgIds, options)` processes multiple orgs with progress reporting.

**Response includes:** `orgs_processed`, `orgs_enriched`, `orgs_failed`, `signals_created`, `people_found`, `people_created`, `people_merged`, per-org results with people finder stats.

**Modules:** All pipeline logic lives in `lib/enrichment/`:
- `lib/enrichment/apollo.ts` — Apollo org API client (domain→name fallback)
- `lib/enrichment/apollo-people.ts` — Apollo People Search + People Match (search→enrich two-step)
- `lib/enrichment/perplexity.ts` — Perplexity Sonar client + website discovery
- `lib/enrichment/gemini.ts` — Gemini synthesis + ICP scoring (reads from `company_context` DB)
- `lib/enrichment/pipeline.ts` — Orchestrator with smart ordering, 5 stages, batch + progress

---

### POST /api/messages/generate

**Path:** `app/api/messages/generate/route.ts`

Generates draft interactions for selected persons within an initiative. Creates interactions of type `cold_email`, `cold_linkedin`, etc. in the `interactions` table.

**Input:**
```json
{
  "personIds": ["uuid1", "uuid2"],
  "initiativeId": "uuid",
  "channels": ["cold_email", "cold_linkedin"]
}
```

### POST /api/messages/send

**Path:** `app/api/messages/send/route.ts`

Sends approved interactions and updates `interactions.status` (draft → processing → sent). Routes to SendGrid for email, HeyReach for LinkedIn.

**Input:**
```json
{
  "interactionIds": ["uuid1", "uuid2"]
}
```

### POST /api/correlations/merge

**Path:** `app/api/correlations/merge/route.ts`

Merges or dismisses duplicate person records surfaced by the correlation engine. Calls the `merge_persons` RPC to reassign all related interactions, event participations, and organization links to the surviving person.

**Input:**
```json
{
  "action": "merge",           // or "dismiss"
  "keepPersonId": "uuid",
  "mergePersonId": "uuid"
}
```

### GET /api/inbox

**Path:** `app/api/inbox/route.ts`

Fetches emails from both Fastmail accounts via JMAP, runs auto-correlation against persons in the pipeline (matching by email, name, and organization), stores in `inbound_emails` table, and sends Telegram notifications for matches. Uses a service role Supabase client to bypass RLS in the sync route.

Returns the fetched and correlated emails with organization data joined via `person_organization` -> `organizations`.

**JMAP implementation notes:**
- Uses `headers` array property syntax (not the `header:Name:asText` shorthand, which is unreliable)
- Mark-as-read uses a separate JMAP `Email/set` call with `keywords/$seen`

### POST /api/inbox

Manual "Link to Person" action for uncorrelated emails.

**Input:**
```json
{
  "emailId": "uuid",
  "personId": "uuid"
}
```

### POST /api/inbox/sync

**Path:** `app/api/inbox/sync/route.ts`

Triggers sync for a specific Fastmail account. Updates `inbox_sync_state` with timestamps and counts. Uses service role client (not user session) since pg_cron calls this without auth.

**Input:**
```json
{
  "accountEmail": "jb@gofpblock.com"
}
```

**Auto-sync:** pg_cron job (`016_inbox_sync_cron.sql`) calls this endpoint every 15 minutes per account via pg_net HTTP POST. JB syncs at :00/:15/:30/:45, Wes offset by 1 minute.

---

## Environment Variables

All edge functions need these Supabase-provided vars (auto-available):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Additional secrets (set via `npx supabase secrets set`):

| Variable | Used By |
|----------|---------|
| `APOLLO_API_KEY` | enrich-contact (targets persons) |
| `BRAVE_SEARCH_API_KEY` | enrich-company (targets organizations) |
| `PERPLEXITY_API_KEY` | enrich-company (targets organizations) |
| `GEMINI_API_KEY` | enrich-company, generate-messages (creates interactions) |
| `SENDGRID_API_KEY` | send-message, sync-status |
| `HEYREACH_API_KEY` | send-message |

**Next.js API route env vars** (set in Vercel dashboard for production, `.env.local` for local dev):

| Variable | Used By |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | All Supabase clients (baked at build time) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | All Supabase clients (baked at build time, must be JWT `eyJ...` format) |
| `NEXT_SUPABASE_SECRET_KEY` | /api/inbox/sync, /api/enrich/organizations (server-only) |
| `APOLLO_API_KEY` | /api/enrich, /api/enrich/organizations |
| `PERPLEXITY_API_KEY` | /api/enrich/organizations (Perplexity Sonar deep research) |
| `GEMINI_API_KEY` | /api/enrich/organizations (Gemini synthesis + ICP scoring) |
| `FASTMAIL_API_KEY` | /api/inbox (JMAP auth) |
| `TELEGRAM_BOT_TOKEN` | lib/telegram.ts (Bot API) |
| `TELEGRAM_CHAT_ID` | lib/telegram.ts (notification target) |

**Note:** `NEXT_PUBLIC_*` vars are embedded at build time. After changing them in Vercel, a redeploy is required.
