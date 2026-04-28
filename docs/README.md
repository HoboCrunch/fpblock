# FP Block CRM — Documentation

Outreach management & enrichment HQ for FP Block's conference preparation. Next.js 16 (App Router) + React 19 + Tailwind v4 frontend; Supabase (Postgres, Auth, Edge Functions, Realtime, pg_cron) backend; Telegram bot for mobile control + push notifications; Apollo + Perplexity + Gemini enrichment pipeline; SendGrid + HeyReach for sending; Fastmail JMAP for inbox sync.

---

## Documentation map

The doc library is organized by concern. Start at **architecture.md** for the high-level picture, then drill into the area you care about.

### Top-level

| File | What it covers |
|---|---|
| [architecture.md](./architecture.md) | High-level system overview: tech stack, data flow, module map. Some sections predate the v0.25 migrations — defer to `backend/database.md` for schema and `frontend/admin-ui.md` for UI details when they conflict. |
| [setup.md](./setup.md) | First-time setup: env vars, applying migrations, edge function deploy, Vercel + Railway deploy. |
| [dev-practices.md](./dev-practices.md) | Day-to-day dev: build/lint/test commands, Vitest conventions, env var inventory, commit conventions, migration workflow. |
| [edge-functions.md](./edge-functions.md) | The 6 Deno edge functions in `supabase/functions/`: purpose, secrets, deploy. |

### Backend (`docs/backend/`)

| File | What it covers |
|---|---|
| [api-routes.md](./backend/api-routes.md) | Every Next.js API route under `app/api/`: method, auth, inputs/outputs, side effects, file:line refs. Flags the routes currently lacking auth + the SendGrid webhook with no signature verification. |
| [database.md](./backend/database.md) | **Canonical schema reference** rebuilt from the 23 live migrations (001–025, with 006 + 018 absent). All ~26 tables with full column definitions, RLS posture, RPCs, views, triggers, cron, conventions, and the migration-immutability rule. |
| [enrichment.md](./backend/enrichment.md) | Org + person enrichment pipelines (Apollo / Perplexity / Gemini / People Finder). Stage-by-stage I/O, status lifecycle, the JSONB-vs-relational truth rule, source tagging tables, runbook, and 12 known gotchas. |
| [sequences-messaging.md](./backend/sequences-messaging.md) | Sequences → enrollments → interactions, ComposableTemplate JSONB blocks, schedule modes, the legacy/current dual generate path, send pipeline (SendGrid retry/backoff + HeyReach), inbox sync (JMAP + cron), reply correlation, and replay/recovery runbooks. |

### Frontend (`docs/frontend/`)

| File | What it covers |
|---|---|
| [admin-ui.md](./frontend/admin-ui.md) | Information architecture: routes, the admin shell (sidebar/header/NavItem), per-section breakdown for all 13 admin pages, selection model, auth gating. |
| [components.md](./frontend/components.md) | Design tokens (CSS vars, glass utilities, Poppins/Inter, motion), `components/ui/*` primitives, `components/admin/*` inventory, conventions, anti-patterns. |
| [data-layer.md](./frontend/data-layer.md) | Supabase clients, `fetchAll`, React Query setup, the query-key factory, all 13 hooks (signature/polling/invalidation), mutation patterns, virtualization rules. |

### Integrations (`docs/integrations/`)

| File | What it covers |
|---|---|
| [bot.md](./integrations/bot.md) | Telegram bot: Grammy + Supabase Realtime architecture, command + callback reference, batched-progress notification pattern, local dev, Dockerfile/Railway deploy. |
| [external-services.md](./integrations/external-services.md) | Per-service reference: Supabase, Apollo, Perplexity, Gemini, SendGrid, Fastmail JMAP, Telegram, HeyReach, Brave. Auth, env vars, client construction file:line, endpoints. |

### Operations (`docs/operations/`)

| File | What it covers |
|---|---|
| [scripts-and-runbooks.md](./operations/scripts-and-runbooks.md) | Catalogue of every `scripts/*.ts` file. The "consensus" parallel-agent pipeline (5 speaker agents + 8 employee agents → merge → chunk → send), the `AGENT_BRIEF` vs `EMPLOYEE_BRIEF` split, day-by-day campaign runbooks. |

### Specs / archive

- [admin-panel.md](./admin-panel.md) — older admin guide, kept for the per-feature behaviour detail (inbox auto-correlation, kanban drag rules) not yet folded into `frontend/admin-ui.md`. Has a top-of-file pointer to current docs.
- [superpowers/specs/](./superpowers/specs/) — design specs and plans (e.g. Telegram bot design, persons enrichment pipeline).

---

## Known issues (caught during this documentation pass)

These are real defects observed in the code while writing the docs. Each is described in detail in the linked file. They are not yet fixed.

**Security**
- `app/api/enrich/organizations`, `app/api/enrich/persons`, `app/api/enrich/cancel`, `app/api/inbox/sync` are publicly callable — `middleware.ts` only matches `/admin/:path*`, not `/api/*`. Anyone can trigger paid Apollo/Perplexity calls. → `backend/api-routes.md`
- SendGrid webhook (`app/api/webhooks/sendgrid/route.ts`) has no ECDSA signature verification; `verifyWebhookSignature` is a timestamp-only stub and isn't invoked. → `backend/api-routes.md`, `backend/sequences-messaging.md`

**Bugs**
- Person enrichment writes `enrichment_person_match` jobs but the UI poller and history loader query `enrichment_person`. Person progress and history never appear in the UI. → `backend/enrichment.md`
- `app/api/sequences/generate` invokes the `generate-messages` edge function without `contact_ids`, causing AI blocks to render as the literal string "undefined". → `backend/sequences-messaging.md`
- `messages/actions` "supersede" silently writes a `failed` status enum that doesn't exist. → `backend/api-routes.md`
- `app/api/sequences/send` has no row-level lock — concurrent invocations can double-send. → `backend/sequences-messaging.md`
- `useOrgEventPropagation` uses an inline query key (bypasses the factory); `useEnrichmentItems` re-implements `fetchAll`; `usePersons` declares an `eventId` param but never applies it. → `frontend/data-layer.md`
- `add-to-list-dropdown.tsx` exists in two locations. → `frontend/components.md`

**Convention violations**
- `GlassCheckbox` is duplicated inline in 6 files instead of being a shared component (despite the project memory note saying it's shared). → `frontend/components.md`
- HTML `<table>` remains in the org detail sub-grids (`organizations/[id]/page.tsx`) and the message queue (`message-queue-client.tsx` — kept because expandable detail rows don't fit fixed-height virtualization). All other admin tables migrated to the shared `<DataTable>` primitive in 2026-04. → `frontend/components.md`
- Lists, Settings, and Uploads pages bypass React Query (`useState` + `useEffect` fetches). → `frontend/data-layer.md`
- 6 files exceed the stated 300-LOC ceiling (enrichment-shell 988, lists 994, settings 928, persons-table 898, orgs-table 661, sequence-list 417). → `frontend/components.md`
- `organizations.context` and `icp_score` overwrite on re-enrichment instead of using COALESCE — manual edits get clobbered. → `backend/enrichment.md`

**Drift in project memory**
- "Apollo + Unipile" claim for enrichment is wrong — Unipile is in `package.json` but unused; only used (planned) for inbox. → `integrations/external-services.md`
- Enrichment concurrency 3 only applies to the org pipeline; person pipeline is sequential. → `backend/enrichment.md`
- React Query hook count is 13, not 8. → `frontend/data-layer.md`
- The doc previously listed migration `018_people_finder.sql`, which does not exist; 020–025 were missing entirely. → `backend/database.md`

---

## How to navigate

- **"Where is X defined?"** — `backend/api-routes.md` for endpoints, `backend/database.md` for tables, `frontend/components.md` for UI primitives, `frontend/data-layer.md` for hooks.
- **"How does feature Y work end-to-end?"** — `architecture.md` first, then the relevant deep dive (enrichment, sequences-messaging, admin-ui).
- **"Why does the code do Z?"** — search the deep dives; they record rationale and the *why* behind non-obvious choices, including the relational-truth rule for enrichment status.
- **"How do I run X locally / deploy / debug?"** — `dev-practices.md`, `setup.md`, and the runbook section at the bottom of each deep dive.

## Contributing to the docs

When you change behaviour, update the relevant deep-dive doc in the same PR. The deep dives use `file:line` refs throughout — keep those accurate. The README is an index; don't put content here, link to it.
