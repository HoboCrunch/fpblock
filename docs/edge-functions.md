# Edge Functions & API Routes

Six Supabase Edge Functions (Deno runtime) in `supabase/functions/`, plus Next.js API routes in `app/api/` for enrichment and inbox sync.

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

**Purpose:** Enrich contacts with professional data from Apollo. Fills in email, LinkedIn, Twitter, phone, seniority, department, and Apollo ID. Does not overwrite existing values.

**Input:**
```json
{ "contact_id": "uuid" }
// or batch:
{ "contact_ids": ["uuid1", "uuid2"] }
```

**Behavior:**
1. Loads contact + primary company name from Supabase
2. Calls Apollo People Match with first_name, last_name, organization_name
3. Updates contact fields that are currently null
4. Logs to job_log (started → completed/failed)
5. Rate limits 500ms between batch calls

---

## enrich-company

**Path:** `supabase/functions/enrich-company/index.ts`
**External APIs:** Brave Search, Perplexity (sonar model), Gemini 2.0 Flash

**Purpose:** Research companies using web search and AI synthesis. Produces a context paragraph and structured signals.

**Input:**
```json
{ "company_id": "uuid" }
// or batch:
{ "company_ids": ["uuid1", "uuid2"] }
```

**Pipeline:**
1. Brave Search: top 5 web results for `{company} recent news 2025 2026`
2. Perplexity: deeper analysis of news, partnerships, funding, product launches
3. Gemini: synthesizes both into:
   - `context`: 2-3 sentence summary (written to `companies.context`)
   - `signals[]`: typed events (written to `company_signals` table)

**Signal types:** news, funding, partnership, product_launch, regulatory, hiring, award

---

## generate-messages

**Path:** `supabase/functions/generate-messages/index.ts`
**External API:** Gemini 2.0 Flash

**Purpose:** Generate outreach messages using templated prompts with contact/company context.

**Input:**
```json
{
  "contact_ids": ["uuid1", "uuid2"],
  "event_id": "uuid",
  "channels": ["linkedin", "email"],     // optional, defaults to both
  "sequence_number": 1,                   // optional, default 1
  "prompt_template_id": "uuid",          // optional override
  "sender_id": "uuid",                   // optional override
  "cta": "https://..."                   // optional override
}
```

**Behavior:**
1. Loads event_config for defaults (sender, CTA, prompt template)
2. For each contact:
   - Loads contact + primary company + recent signals
   - Loads previous message if follow-up (sequence_number > 1)
   - For each channel:
     - Resolves prompt template (explicit override > channel-specific > event default)
     - Fills template variables (`{{contact.full_name}}`, `{{company.context}}`, etc.)
     - Calls Gemini with system + user prompts
     - Parses email subject if channel is "email"
     - Supersedes existing message at same position (marks old as `superseded`, increments iteration)
     - Inserts new message as `draft`

---

## send-message

**Path:** `supabase/functions/send-message/index.ts`
**External APIs:** SendGrid (`/v3/mail/send`), HeyReach (`/api/v1/messages/send`)

**Purpose:** Send approved/scheduled messages via the appropriate channel.

**Input:**
```json
{ "message_id": "uuid" }
// or batch:
{ "message_ids": ["uuid1", "uuid2"] }
// or cron-triggered:
{ "source": "cron" }
```

**Channel handling:**
- **email**: SendGrid — requires contact.email and sender.email. Converts body newlines to `<br>`, appends signature.
- **linkedin**: HeyReach — requires contact.linkedin and sender.heyreach_account_id.
- **twitter**: Marks as `approved` for manual send (no API integration).

**CRON mode:** When `source: "cron"`, fetches all messages with `status = "scheduled"` and `scheduled_at <= now()`.

**Double-send prevention:** Sets status to `processing` before sending.

---

## sync-status

**Path:** `supabase/functions/sync-status/index.ts`
**External API:** SendGrid Activity API (`/v3/messages`)

**Purpose:** Poll for delivery status updates on sent messages.

**Behavior:**
1. Fetches all messages with `channel = "email"` and `status = "sent"`
2. For each, queries SendGrid Activity API for events
3. Updates status:
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
  "table": "contacts",
  "event": "INSERT",
  "id": "uuid"
}
```

**Condition operators:**
- `gte`, `lte`, `eq`, `neq`: comparison operators
- `in`: array membership
- Literal values: exact match

**Example rule:** When a contact_company is inserted and the company has `icp_score >= 75`, automatically trigger `enrich_contact`.

**Triggered by:** `pg_notify('automation_trigger', ...)` from database triggers on contacts, companies, and contact_company tables.

---

## Next.js API Routes

These live in `app/api/` and run in the Next.js server (not Deno). They use server-side Supabase client and have access to `.env.local` variables.

### POST /api/enrich

**Path:** `app/api/enrich/route.ts`

Triggers Apollo enrichment for selected contacts. Creates a `job_log` entry with `job_type = 'enrichment'` and status `processing`. Returns the job ID for polling.

**Input:**
```json
{
  "contactIds": ["uuid1", "uuid2"],
  "fields": ["email", "linkedin", "twitter", "phone"]
}
```

**Note:** Currently creates the job log entry only. Full Apollo API integration to be ported from `scripts/apollo_enrich.py`.

### GET /api/inbox

**Path:** `app/api/inbox/route.ts`

Fetches emails from both Fastmail accounts via JMAP, runs auto-correlation against pipeline contacts, stores in `inbound_emails` table, and sends Telegram notifications for matches.

Returns the fetched and correlated emails.

### POST /api/inbox

Manual "Link to Contact" action for uncorrelated emails.

**Input:**
```json
{
  "emailId": "uuid",
  "contactId": "uuid"
}
```

### POST /api/inbox/sync

**Path:** `app/api/inbox/sync/route.ts`

Triggers sync for a specific Fastmail account. Updates `inbox_sync_state` with timestamps and counts.

**Input:**
```json
{
  "accountEmail": "jb@gofpblock.com"
}
```

---

## Environment Variables

All edge functions need these Supabase-provided vars (auto-available):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Additional secrets (set via `npx supabase secrets set`):

| Variable | Used By |
|----------|---------|
| `APOLLO_API_KEY` | enrich-contact |
| `BRAVE_SEARCH_API_KEY` | enrich-company |
| `PERPLEXITY_API_KEY` | enrich-company |
| `GEMINI_API_KEY` | enrich-company, generate-messages |
| `SENDGRID_API_KEY` | send-message, sync-status |
| `HEYREACH_API_KEY` | send-message |

**Next.js API route env vars** (in `.env.local`, not Supabase secrets):

| Variable | Used By |
|----------|---------|
| `FASTMAIL_API_KEY` | /api/inbox (JMAP auth) |
| `TELEGRAM_BOT_TOKEN` | lib/telegram.ts (Bot API) |
| `TELEGRAM_CHAT_ID` | lib/telegram.ts (notification target) |
