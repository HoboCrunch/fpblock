# FP Block Outreach App — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an internal outreach automation tool with a Next.js admin panel backed by Supabase, supporting contact/company enrichment, AI message generation, and multi-channel sending via SendGrid and HeyReach.

**Architecture:** Next.js 15 app router serves the admin panel at `/admin/*` and static landing pages at `/jb` and `/wes`. Supabase provides Postgres (with RLS), Auth, Edge Functions for external API calls (Apollo, Gemini, Brave, Perplexity, SendGrid, HeyReach), and pg_cron for hourly scheduled sends and status sync. The frontend talks to Supabase directly via the client SDK; edge functions are invoked for enrichment, generation, and sending operations.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS, Supabase (Postgres, Auth, Edge Functions, Realtime, pg_cron), SendGrid, HeyReach, Apollo, Gemini, Brave Search, Perplexity

**Spec:** `app/plan/outreach-app-spec.md`

---

## File Structure

```
Cannes/
├── package.json
├── next.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.mjs
├── .env.local                          # Already exists — API keys
├── middleware.ts                       # Auth guard for /admin/*
├── lib/
│   ├── supabase/
│   │   ├── client.ts                   # Browser Supabase client (publishable key)
│   │   ├── server.ts                   # Server Supabase client (secret key)
│   │   └── middleware.ts               # Supabase auth session helper for middleware
│   ├── types/
│   │   └── database.ts                 # TypeScript types matching DB schema
│   └── utils.ts                        # Shared helpers (formatters, etc.)
├── app/
│   ├── layout.tsx                      # Root layout (html/body, Tailwind globals)
│   ├── globals.css                     # Tailwind imports
│   ├── (public)/
│   │   ├── jb/
│   │   │   └── page.tsx                # JB landing page (static HTML port)
│   │   └── wes/
│   │       └── page.tsx                # Wes landing page (static HTML port)
│   └── admin/
│       ├── login/
│       │   └── page.tsx                # Login page
│       ├── layout.tsx                  # Admin shell (sidebar, header, auth check)
│       ├── page.tsx                    # Dashboard
│       ├── events/
│       │   └── [id]/
│       │       └── page.tsx            # Event view (tabs: contacts, companies, messages)
│       ├── contacts/
│       │   └── [id]/
│       │       └── page.tsx            # Contact detail
│       ├── companies/
│       │   └── [id]/
│       │       └── page.tsx            # Company detail
│       └── queue/
│           └── page.tsx                # Message queue (tabs: drafts, scheduled, sent, failed)
├── components/
│   ├── ui/                             # Reusable primitives (Button, Badge, Card, Input, Modal, Tabs, Table)
│   ├── admin/
│   │   ├── sidebar.tsx                 # Admin sidebar navigation
│   │   ├── header.tsx                  # Admin header bar
│   │   ├── summary-cards.tsx           # Dashboard stat cards
│   │   ├── activity-feed.tsx           # Recent job_log entries
│   │   ├── contact-table.tsx           # Reusable contact table (used in event view + company detail)
│   │   ├── company-table.tsx           # Reusable company table
│   │   ├── message-table.tsx           # Reusable message table (used in event view, queue, detail pages)
│   │   ├── message-editor.tsx          # Inline message edit (body, subject, sender/CTA overrides)
│   │   ├── enrich-modal.tsx            # Modal for triggering enrichment (single/batch)
│   │   ├── generate-modal.tsx          # Modal for triggering message generation (channel, sender, CTA, prompt overrides)
│   │   ├── schedule-modal.tsx          # Modal for scheduling messages (datetime picker)
│   │   ├── event-config-editor.tsx     # Inline editor for event_config (sender, CTA, prompt template)
│   │   ├── signals-timeline.tsx        # Company signals chronological list
│   │   └── inline-edit.tsx             # Generic inline-edit field component
│   └── landing/
│       └── (shared assets if any)
├── supabase/
│   ├── migrations/
│   │   ├── 001_schema.sql              # All tables, constraints, indexes
│   │   ├── 002_rls.sql                 # RLS policies
│   │   ├── 003_triggers.sql            # updated_at trigger, pg_notify for automations
│   │   └── 004_cron.sql                # pg_cron job definitions
│   ├── functions/
│   │   ├── enrich-contact/index.ts     # Apollo enrichment
│   │   ├── enrich-company/index.ts     # Brave + Perplexity + Gemini enrichment
│   │   ├── generate-messages/index.ts  # Gemini message generation
│   │   ├── send-message/index.ts       # SendGrid + HeyReach sending
│   │   ├── sync-status/index.ts        # Poll SendGrid + HeyReach for delivery status
│   │   └── process-automations/index.ts # Evaluate automation rules on DB changes
│   └── seed.sql                        # Sender profiles, events, event_config, prompt templates
├── scripts/
│   └── migrate-csv.ts                  # One-time ETL from CSV/JSON sources into Supabase
```

---

## Task 1: Project Scaffold & Supabase Setup

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.mjs`, `app/layout.tsx`, `app/globals.css`
- Create: `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/middleware.ts`

- [ ] **Step 1: Initialize Next.js project**

```bash
cd /Users/evansteinhilv/genzio/Cannes
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*" --use-npm --no-git
```

Select defaults. This creates package.json, next.config.ts, tsconfig.json, tailwind.config.ts, app/layout.tsx, app/globals.css, etc.

- [ ] **Step 2: Install Supabase dependencies**

```bash
npm install @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 3: Create browser Supabase client**

Create `lib/supabase/client.ts`:

```typescript
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
```

- [ ] **Step 4: Create server Supabase client**

Create `lib/supabase/server.ts`:

```typescript
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from Server Component — ignore
          }
        },
      },
    }
  );
}
```

- [ ] **Step 5: Create middleware Supabase helper**

Create `lib/supabase/middleware.ts`:

```typescript
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (
    !user &&
    request.nextUrl.pathname.startsWith("/admin") &&
    !request.nextUrl.pathname.startsWith("/admin/login")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
```

- [ ] **Step 6: Create root middleware**

Create `middleware.ts`:

```typescript
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: ["/admin/:path*"],
};
```

- [ ] **Step 7: Update .env.local with NEXT_PUBLIC_ prefixed vars**

Add to `.env.local` (keep existing keys, add public-prefixed aliases for client-side access):

```
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<your-supabase-publishable-key>
```

- [ ] **Step 8: Verify dev server starts**

```bash
npm run dev
```

Expected: Next.js dev server starts on localhost:3000 with no errors.

- [ ] **Step 9: Commit**

```bash
git init && git add -A && git commit -m "feat: scaffold Next.js project with Supabase client setup"
```

---

## Task 2: Database Schema Migration

**Files:**
- Create: `supabase/migrations/001_schema.sql`
- Create: `supabase/migrations/002_rls.sql`
- Create: `supabase/migrations/003_triggers.sql`
- Create: `supabase/migrations/004_cron.sql`
- Create: `supabase/seed.sql`
- Create: `lib/types/database.ts`

- [ ] **Step 1: Install Supabase CLI**

```bash
npm install -D supabase
npx supabase init
```

- [ ] **Step 2: Create schema migration**

Create `supabase/migrations/001_schema.sql`:

```sql
-- Core tables
CREATE TABLE contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text,
  last_name text,
  full_name text NOT NULL,
  title text,
  seniority text,
  department text,
  email text,
  linkedin text,
  twitter text,
  telegram text,
  phone text,
  context text,
  apollo_id text,
  source text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  website text,
  linkedin_url text,
  category text,
  description text,
  context text,
  usp text,
  icp_score integer,
  icp_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  location text,
  date_start date,
  date_end date,
  website text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sender_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  heyreach_account_id text,
  signature text,
  tone_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE prompt_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  channel text,
  system_prompt text NOT NULL,
  user_prompt_template text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE event_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES sender_profiles(id),
  cta_url text,
  cta_text text,
  prompt_template_id uuid REFERENCES prompt_templates(id),
  notify_emails text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id)
);

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  event_id uuid REFERENCES events(id) ON DELETE SET NULL,
  channel text NOT NULL,
  sequence_number integer NOT NULL DEFAULT 1,
  iteration integer NOT NULL DEFAULT 1,
  subject text,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  sender_id uuid REFERENCES sender_profiles(id),
  cta text,
  scheduled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE TABLE company_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  signal_type text NOT NULL,
  description text NOT NULL,
  date date,
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Join tables
CREATE TABLE contact_company (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role text,
  role_type text,
  founder_status text,
  is_primary boolean DEFAULT false,
  source text,
  UNIQUE (contact_id, company_id)
);

CREATE TABLE contact_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  participation_type text,
  track text,
  notes text,
  UNIQUE (contact_id, event_id)
);

CREATE TABLE company_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  relationship_type text,
  sponsor_tier text,
  notes text,
  UNIQUE (company_id, event_id)
);

-- Automation tables
CREATE TABLE automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  trigger_table text NOT NULL,
  trigger_event text NOT NULL,
  conditions jsonb NOT NULL DEFAULT '{}',
  action text NOT NULL,
  action_params jsonb NOT NULL DEFAULT '{}',
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE job_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL,
  target_table text,
  target_id uuid,
  status text NOT NULL DEFAULT 'started',
  error text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_contacts_email ON contacts(email);
CREATE INDEX idx_contacts_apollo_id ON contacts(apollo_id);
CREATE INDEX idx_contacts_full_name ON contacts(full_name);
CREATE INDEX idx_companies_name ON companies(name);
CREATE INDEX idx_companies_icp_score ON companies(icp_score);
CREATE INDEX idx_messages_status ON messages(status);
CREATE INDEX idx_messages_scheduled_at ON messages(scheduled_at);
CREATE INDEX idx_messages_contact_id ON messages(contact_id);
CREATE INDEX idx_messages_event_id ON messages(event_id);
CREATE INDEX idx_company_signals_company_id ON company_signals(company_id);
CREATE INDEX idx_contact_company_contact_id ON contact_company(contact_id);
CREATE INDEX idx_contact_company_company_id ON contact_company(company_id);
CREATE INDEX idx_contact_event_event_id ON contact_event(event_id);
CREATE INDEX idx_company_event_event_id ON company_event(event_id);
CREATE INDEX idx_job_log_created_at ON job_log(created_at DESC);
```

- [ ] **Step 3: Create RLS migration**

Create `supabase/migrations/002_rls.sql`:

```sql
-- Enable RLS on all tables
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_company ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE sender_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_log ENABLE ROW LEVEL SECURITY;

-- Authenticated users get full access to all tables
CREATE POLICY "Authenticated full access" ON contacts FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated full access" ON companies FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated full access" ON events FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated full access" ON messages FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated full access" ON company_signals FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated full access" ON contact_company FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated full access" ON contact_event FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated full access" ON company_event FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated full access" ON sender_profiles FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated full access" ON event_config FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated full access" ON prompt_templates FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated full access" ON automation_rules FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated full access" ON job_log FOR ALL USING (auth.uid() IS NOT NULL);
```

- [ ] **Step 4: Create triggers migration**

Create `supabase/migrations/003_triggers.sql`:

```sql
-- updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON prompt_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Notify trigger for automation processing
CREATE OR REPLACE FUNCTION notify_automation()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('automation_trigger', json_build_object(
    'table', TG_TABLE_NAME,
    'event', TG_OP,
    'id', NEW.id
  )::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER automation_notify AFTER INSERT OR UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION notify_automation();

CREATE TRIGGER automation_notify AFTER INSERT OR UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION notify_automation();

CREATE TRIGGER automation_notify AFTER INSERT OR UPDATE ON contact_company
  FOR EACH ROW EXECUTE FUNCTION notify_automation();
```

- [ ] **Step 5: Create CRON migration**

Create `supabase/migrations/004_cron.sql`:

```sql
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Send scheduled messages every hour on the hour
SELECT cron.schedule(
  'send-scheduled',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/send-message',
    body := '{"source": "cron"}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.secret_key'),
      'Content-Type', 'application/json'
    )
  );
  $$
);

-- Sync send statuses every hour at :30
SELECT cron.schedule(
  'sync-status',
  '30 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/sync-status',
    body := '{"source": "cron"}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.secret_key'),
      'Content-Type', 'application/json'
    )
  );
  $$
);
```

Note: `app.settings.supabase_url` and `app.settings.secret_key` are set via Supabase dashboard > Project Settings > Database > Custom configuration. Alternatively, hardcode the project URL and use `vault.secrets` for the key.

- [ ] **Step 6: Create seed data**

Create `supabase/seed.sql`:

```sql
-- Sender profiles
INSERT INTO sender_profiles (id, name, email, tone_notes) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'JB', 'jb@gofpblock.com', 'Direct, no fluff. Lead with their operational context. Reference permanence and irreversibility. No crypto buzzwords.'),
  ('a0000000-0000-0000-0000-000000000002', 'Wes', 'wes@gofpblock.com', 'Professional but warm. Lead with their specific challenge. Reference trust boundaries and ownership.');

-- Events
INSERT INTO events (id, name, location, date_start, date_end) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'EthCC 2026', 'Cannes', '2026-06-30', '2026-07-03'),
  ('b0000000-0000-0000-0000-000000000002', 'TOKEN2049 Dubai 2026', 'Dubai', '2026-04-30', '2026-05-01');

-- Default prompt template
INSERT INTO prompt_templates (id, name, channel, system_prompt, user_prompt_template) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'EthCC LinkedIn Intro', 'linkedin',
   'You are writing a LinkedIn outreach message for FP Block, a full-stack blockchain engineering firm. Write in the voice of {{sender.name}}. Tone: {{sender.tone_notes}}. The message should be 3-5 sentences. Do NOT use words: blockchain, DeFi, Web3, on-chain, crypto, smart contracts, TVL, rollup, ZK unless essential. Lead with permanence, ownership, irreversibility, incentives, trust boundaries.',
   'Write a LinkedIn message to {{contact.full_name}}, {{contact.title}} at {{company.name}}.

Company context: {{company.context}}
Company description: {{company.description}}
ICP reason: {{company.icp_reason}}
Our angle: {{company.usp}}
Contact context: {{contact.context}}

CTA: Suggest meeting at the event. Link: {{cta}}

Previous message (if follow-up): {{previous_message}}'),
  ('c0000000-0000-0000-0000-000000000002', 'EthCC Email Intro', 'email',
   'You are writing an outreach email for FP Block, a full-stack blockchain engineering firm. Write in the voice of {{sender.name}}. Tone: {{sender.tone_notes}}. The email should be 4-6 sentences plus a subject line. Do NOT use words: blockchain, DeFi, Web3, on-chain, crypto, smart contracts, TVL, rollup, ZK unless essential. Lead with permanence, ownership, irreversibility, incentives, trust boundaries. Output format: first line is "Subject: ..." followed by a blank line and the body.',
   'Write an outreach email to {{contact.full_name}}, {{contact.title}} at {{company.name}}.

Company context: {{company.context}}
Company description: {{company.description}}
ICP reason: {{company.icp_reason}}
Our angle: {{company.usp}}
Contact context: {{contact.context}}

CTA: Suggest meeting at the event. Link: {{cta}}

Previous message (if follow-up): {{previous_message}}');

-- Event config for EthCC
INSERT INTO event_config (event_id, sender_id, cta_url, cta_text, prompt_template_id) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'https://gofpblock.com', 'gofpblock.com', 'c0000000-0000-0000-0000-000000000001');
```

- [ ] **Step 7: Create TypeScript types**

Create `lib/types/database.ts`:

```typescript
export type Contact = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string;
  title: string | null;
  seniority: string | null;
  department: string | null;
  email: string | null;
  linkedin: string | null;
  twitter: string | null;
  telegram: string | null;
  phone: string | null;
  context: string | null;
  apollo_id: string | null;
  source: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Company = {
  id: string;
  name: string;
  website: string | null;
  linkedin_url: string | null;
  category: string | null;
  description: string | null;
  context: string | null;
  usp: string | null;
  icp_score: number | null;
  icp_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type Event = {
  id: string;
  name: string;
  location: string | null;
  date_start: string | null;
  date_end: string | null;
  website: string | null;
  notes: string | null;
  created_at: string;
};

export type MessageStatus =
  | "draft"
  | "approved"
  | "scheduled"
  | "processing"
  | "sent"
  | "opened"
  | "replied"
  | "bounced"
  | "failed"
  | "superseded";

export type MessageChannel = "email" | "linkedin" | "twitter" | "telegram";

export type Message = {
  id: string;
  contact_id: string;
  company_id: string | null;
  event_id: string | null;
  channel: MessageChannel;
  sequence_number: number;
  iteration: number;
  subject: string | null;
  body: string;
  status: MessageStatus;
  sender_id: string | null;
  cta: string | null;
  scheduled_at: string | null;
  created_at: string;
  sent_at: string | null;
};

export type CompanySignal = {
  id: string;
  company_id: string;
  signal_type: string;
  description: string;
  date: string | null;
  source: string | null;
  created_at: string;
};

export type ContactCompany = {
  id: string;
  contact_id: string;
  company_id: string;
  role: string | null;
  role_type: string | null;
  founder_status: string | null;
  is_primary: boolean;
  source: string | null;
};

export type ContactEvent = {
  id: string;
  contact_id: string;
  event_id: string;
  participation_type: string | null;
  track: string | null;
  notes: string | null;
};

export type CompanyEvent = {
  id: string;
  company_id: string;
  event_id: string;
  relationship_type: string | null;
  sponsor_tier: string | null;
  notes: string | null;
};

export type SenderProfile = {
  id: string;
  name: string;
  email: string | null;
  heyreach_account_id: string | null;
  signature: string | null;
  tone_notes: string | null;
  created_at: string;
};

export type EventConfig = {
  id: string;
  event_id: string;
  sender_id: string | null;
  cta_url: string | null;
  cta_text: string | null;
  prompt_template_id: string | null;
  notify_emails: string[] | null;
  created_at: string;
};

export type PromptTemplate = {
  id: string;
  name: string;
  channel: string | null;
  system_prompt: string;
  user_prompt_template: string;
  created_at: string;
  updated_at: string;
};

export type AutomationRule = {
  id: string;
  name: string;
  trigger_table: string;
  trigger_event: string;
  conditions: Record<string, unknown>;
  action: string;
  action_params: Record<string, unknown>;
  enabled: boolean;
  created_at: string;
};

export type JobLog = {
  id: string;
  job_type: string;
  target_table: string | null;
  target_id: string | null;
  status: string;
  error: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};
```

- [ ] **Step 8: Apply migration to Supabase**

```bash
npx supabase db push --linked
```

Or apply via Supabase dashboard SQL editor by running each migration file in order.

- [ ] **Step 9: Run seed data**

Run `supabase/seed.sql` via Supabase dashboard SQL editor or:

```bash
npx supabase db execute --file supabase/seed.sql
```

- [ ] **Step 10: Commit**

```bash
git add supabase/ lib/types/
git commit -m "feat: add database schema, RLS, triggers, cron, seed data, and TS types"
```

---

## Task 3: Auth & Login Page

**Files:**
- Create: `app/admin/login/page.tsx`

- [ ] **Step 1: Create login page**

Create `app/admin/login/page.tsx`:

```tsx
"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push("/admin");
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <form
        onSubmit={handleLogin}
        className="bg-gray-900 p-8 rounded-lg w-full max-w-sm space-y-4 border border-gray-800"
      >
        <h1 className="text-xl font-semibold text-white">FP Block Admin</h1>
        {error && (
          <p className="text-sm text-red-400 bg-red-400/10 p-2 rounded">
            {error}
          </p>
        )}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded text-white font-medium transition-colors"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Verify login page renders**

```bash
npm run dev
```

Navigate to `http://localhost:3000/admin/login`. Expected: login form renders.

- [ ] **Step 3: Verify middleware redirect**

Navigate to `http://localhost:3000/admin`. Expected: redirected to `/admin/login`.

- [ ] **Step 4: Commit**

```bash
git add app/admin/login/ middleware.ts
git commit -m "feat: add auth login page and admin route protection"
```

---

## Task 4: Admin Shell (Layout, Sidebar, Header)

**Files:**
- Create: `app/admin/layout.tsx`
- Create: `components/admin/sidebar.tsx`
- Create: `components/admin/header.tsx`
- Create: `lib/utils.ts`

- [ ] **Step 1: Create utility helpers**

Create `lib/utils.ts`:

```typescript
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

Install deps:

```bash
npm install clsx tailwind-merge
```

- [ ] **Step 2: Create sidebar component**

Create `components/admin/sidebar.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Dashboard", href: "/admin", icon: "◻" },
  { label: "Message Queue", href: "/admin/queue", icon: "✉" },
];

export function Sidebar({ events }: { events: { id: string; name: string }[] }) {
  const pathname = usePathname();

  return (
    <aside className="w-56 bg-gray-900 border-r border-gray-800 min-h-screen p-4 flex flex-col gap-1">
      <div className="text-white font-semibold text-lg mb-6 px-2">FP Block</div>
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors",
            pathname === item.href
              ? "bg-gray-800 text-white"
              : "text-gray-400 hover:text-white hover:bg-gray-800/50"
          )}
        >
          <span>{item.icon}</span>
          {item.label}
        </Link>
      ))}
      <div className="mt-6 mb-2 px-3 text-xs text-gray-500 uppercase tracking-wider">Events</div>
      {events.map((event) => (
        <Link
          key={event.id}
          href={`/admin/events/${event.id}`}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors",
            pathname === `/admin/events/${event.id}`
              ? "bg-gray-800 text-white"
              : "text-gray-400 hover:text-white hover:bg-gray-800/50"
          )}
        >
          {event.name}
        </Link>
      ))}
    </aside>
  );
}
```

- [ ] **Step 3: Create header component**

Create `components/admin/header.tsx`:

```tsx
"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function Header({ userEmail }: { userEmail: string }) {
  const supabase = createClient();
  const router = useRouter();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <header className="h-14 bg-gray-900 border-b border-gray-800 px-6 flex items-center justify-between">
      <div />
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-400">{userEmail}</span>
        <button
          onClick={handleLogout}
          className="text-sm text-gray-500 hover:text-white transition-colors"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Create admin layout**

Create `app/admin/layout.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/admin/sidebar";
import { Header } from "@/components/admin/header";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const { data: events } = await supabase
    .from("events")
    .select("id, name")
    .order("date_start", { ascending: true });

  return (
    <div className="flex min-h-screen bg-gray-950 text-white">
      <Sidebar events={events || []} />
      <div className="flex-1 flex flex-col">
        <Header userEmail={user.email || ""} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
```

Note: The login page at `/admin/login/page.tsx` renders outside this layout because it's a sibling route, not a child. Next.js app router nests layouts, so `/admin/login` will still match `/admin/layout.tsx`. To avoid this, move the login page outside the admin group or use a conditional in the layout. The simpler approach: the layout already redirects unauthenticated users, and the login page has its own full-page styling that overrides the shell visually. If this causes issues, restructure to use route groups: `(authed)` and `(unauthed)`.

- [ ] **Step 5: Verify admin shell renders**

Log in, navigate to `/admin`. Expected: sidebar with nav items and events list, header with email and sign out button, empty main area.

- [ ] **Step 6: Commit**

```bash
git add components/admin/ app/admin/layout.tsx lib/utils.ts
git commit -m "feat: add admin shell with sidebar, header, and auth-guarded layout"
```

---

## Task 5: Dashboard Page

**Files:**
- Create: `app/admin/page.tsx`
- Create: `components/admin/summary-cards.tsx`
- Create: `components/admin/activity-feed.tsx`

- [ ] **Step 1: Create summary cards component**

Create `components/admin/summary-cards.tsx`:

```tsx
type CardData = {
  label: string;
  value: number;
  color?: string;
};

export function SummaryCards({ cards }: { cards: CardData[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="bg-gray-900 border border-gray-800 rounded-lg p-4"
        >
          <div className="text-sm text-gray-400">{card.label}</div>
          <div className={`text-2xl font-semibold mt-1 ${card.color || "text-white"}`}>
            {card.value}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create activity feed component**

Create `components/admin/activity-feed.tsx`:

```tsx
import type { JobLog } from "@/lib/types/database";

export function ActivityFeed({ logs }: { logs: JobLog[] }) {
  if (logs.length === 0) {
    return <p className="text-gray-500 text-sm">No recent activity.</p>;
  }

  return (
    <div className="space-y-2">
      {logs.map((log) => (
        <div
          key={log.id}
          className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded px-4 py-2 text-sm"
        >
          <div className="flex items-center gap-3">
            <span
              className={`w-2 h-2 rounded-full ${
                log.status === "completed"
                  ? "bg-green-500"
                  : log.status === "failed"
                  ? "bg-red-500"
                  : "bg-yellow-500"
              }`}
            />
            <span className="text-gray-300">
              {log.job_type.replace(/_/g, " ")}
            </span>
            {log.target_table && (
              <span className="text-gray-500">
                {log.target_table}
              </span>
            )}
          </div>
          <span className="text-gray-500">
            {new Date(log.created_at).toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create dashboard page**

Create `app/admin/page.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server";
import { SummaryCards } from "@/components/admin/summary-cards";
import { ActivityFeed } from "@/components/admin/activity-feed";
import Link from "next/link";

export default async function DashboardPage() {
  const supabase = await createClient();

  const [
    { count: contactCount },
    { count: companyCount },
    { data: messageCounts },
    { data: recentLogs },
  ] = await Promise.all([
    supabase.from("contacts").select("*", { count: "exact", head: true }),
    supabase.from("companies").select("*", { count: "exact", head: true }),
    supabase.rpc("message_status_counts"),
    supabase
      .from("job_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  // Fallback if RPC not set up yet — count manually
  const statusCounts: Record<string, number> = {};
  if (messageCounts) {
    for (const row of messageCounts as { status: string; count: number }[]) {
      statusCounts[row.status] = row.count;
    }
  }

  const cards = [
    { label: "Contacts", value: contactCount || 0 },
    { label: "Companies", value: companyCount || 0 },
    { label: "Drafts", value: statusCounts["draft"] || 0, color: "text-yellow-400" },
    { label: "Scheduled", value: statusCounts["scheduled"] || 0, color: "text-blue-400" },
    { label: "Sent", value: statusCounts["sent"] || 0, color: "text-green-400" },
    { label: "Replied", value: statusCounts["replied"] || 0, color: "text-emerald-400" },
    { label: "Bounced", value: statusCounts["bounced"] || 0, color: "text-red-400" },
    { label: "Failed", value: statusCounts["failed"] || 0, color: "text-red-500" },
  ];

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <SummaryCards cards={cards} />

      <div className="flex gap-3">
        <Link
          href="/admin/queue"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium transition-colors"
        >
          Review Drafts
        </Link>
      </div>

      <div>
        <h2 className="text-lg font-medium mb-3">Recent Activity</h2>
        <ActivityFeed logs={recentLogs || []} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create the message_status_counts RPC**

Add to a new migration or run directly:

```sql
CREATE OR REPLACE FUNCTION message_status_counts()
RETURNS TABLE(status text, count bigint)
LANGUAGE sql STABLE
AS $$
  SELECT status, count(*) FROM messages GROUP BY status;
$$;
```

- [ ] **Step 5: Verify dashboard loads**

Navigate to `/admin`. Expected: summary cards showing counts (all 0 until data is migrated), empty activity feed, Review Drafts link.

- [ ] **Step 6: Commit**

```bash
git add app/admin/page.tsx components/admin/summary-cards.tsx components/admin/activity-feed.tsx
git commit -m "feat: add dashboard page with summary cards and activity feed"
```

---

## Task 6: Landing Pages (`/jb` and `/wes`)

**Files:**
- Create: `app/(public)/jb/page.tsx`
- Create: `app/(public)/wes/page.tsx`
- Move: existing `landing-page/index.html` content, `landing-page/wes/index.html` content

- [ ] **Step 1: Create JB landing page**

Read `/Users/evansteinhilv/genzio/Cannes/landing-page/index.html` and port the full HTML to a Next.js page. Since these are complex static pages with inline styles, use `dangerouslySetInnerHTML` or convert to JSX.

Create `app/(public)/jb/page.tsx`:

```tsx
export const metadata = {
  title: "JB @ EthCC Cannes · FP Block",
};

export default function JBPage() {
  return (
    // Port the full HTML from landing-page/index.html
    // This is a standalone page with no shared layout
    <div>JB Landing Page — port from landing-page/index.html</div>
  );
}
```

Copy static assets (cafe-logo.png, jb.png) to `public/landing/`.

- [ ] **Step 2: Create Wes landing page**

Same approach with `landing-page/wes/index.html`.

Create `app/(public)/wes/page.tsx`:

```tsx
export const metadata = {
  title: "Wes @ EthCC Cannes · FP Block",
};

export default function WesPage() {
  return (
    <div>Wes Landing Page — port from landing-page/wes/index.html</div>
  );
}
```

- [ ] **Step 3: Create public layout (no admin shell)**

Create `app/(public)/layout.tsx`:

```tsx
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
```

This ensures no sidebar/header bleeds into landing pages.

- [ ] **Step 4: Verify pages render**

Navigate to `/jb` and `/wes`. Expected: landing pages render without admin shell. Navigate to `/admin`. Expected: still requires auth.

- [ ] **Step 5: Commit**

```bash
git add app/\(public\)/ public/landing/
git commit -m "feat: add JB and Wes landing pages at /jb and /wes"
```

---

## Task 7: Event View Page

**Files:**
- Create: `app/admin/events/[id]/page.tsx`
- Create: `components/admin/contact-table.tsx`
- Create: `components/admin/company-table.tsx`
- Create: `components/admin/message-table.tsx`
- Create: `components/ui/tabs.tsx`
- Create: `components/ui/badge.tsx`

- [ ] **Step 1: Create UI primitives**

Create `components/ui/badge.tsx`:

```tsx
import { cn } from "@/lib/utils";

const variants: Record<string, string> = {
  default: "bg-gray-700 text-gray-200",
  draft: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  scheduled: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  sent: "bg-green-500/10 text-green-400 border-green-500/20",
  replied: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  bounced: "bg-red-500/10 text-red-400 border-red-500/20",
  failed: "bg-red-500/10 text-red-500 border-red-500/20",
  approved: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  processing: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  superseded: "bg-gray-500/10 text-gray-500 border-gray-500/20",
};

export function Badge({
  variant = "default",
  children,
  className,
}: {
  variant?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border",
        variants[variant] || variants.default,
        className
      )}
    >
      {children}
    </span>
  );
}
```

Create `components/ui/tabs.tsx`:

```tsx
"use client";

import { cn } from "@/lib/utils";
import { useState } from "react";

export function Tabs({
  tabs,
  defaultTab,
}: {
  tabs: { id: string; label: string; content: React.ReactNode }[];
  defaultTab?: string;
}) {
  const [active, setActive] = useState(defaultTab || tabs[0]?.id);

  return (
    <div>
      <div className="flex gap-1 border-b border-gray-800 mb-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
              active === tab.id
                ? "border-blue-500 text-white"
                : "border-transparent text-gray-400 hover:text-white"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.find((t) => t.id === active)?.content}
    </div>
  );
}
```

- [ ] **Step 2: Create contact table component**

Create `components/admin/contact-table.tsx`:

```tsx
import type { Contact, ContactCompany, Company } from "@/lib/types/database";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

type ContactRow = Contact & {
  contact_company: (ContactCompany & { company: Company })[];
  message_status?: string;
  participation_type?: string;
};

export function ContactTable({ contacts }: { contacts: ContactRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-400 border-b border-gray-800">
            <th className="pb-2 font-medium">Name</th>
            <th className="pb-2 font-medium">Company</th>
            <th className="pb-2 font-medium">Role</th>
            <th className="pb-2 font-medium">ICP</th>
            <th className="pb-2 font-medium">Type</th>
            <th className="pb-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800/50">
          {contacts.map((contact) => {
            const primary = contact.contact_company?.find((cc) => cc.is_primary) || contact.contact_company?.[0];
            return (
              <tr key={contact.id} className="hover:bg-gray-900/50">
                <td className="py-2">
                  <Link href={`/admin/contacts/${contact.id}`} className="text-blue-400 hover:underline">
                    {contact.full_name}
                  </Link>
                </td>
                <td className="py-2 text-gray-300">
                  {primary?.company?.name || "—"}
                </td>
                <td className="py-2 text-gray-400">{contact.title || "—"}</td>
                <td className="py-2">
                  {primary?.company?.icp_score != null && (
                    <Badge variant={primary.company.icp_score >= 90 ? "replied" : primary.company.icp_score >= 75 ? "scheduled" : "default"}>
                      {primary.company.icp_score}
                    </Badge>
                  )}
                </td>
                <td className="py-2 text-gray-400">{contact.participation_type || "—"}</td>
                <td className="py-2">
                  {contact.message_status && <Badge variant={contact.message_status}>{contact.message_status}</Badge>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Create message table component**

Create `components/admin/message-table.tsx`:

```tsx
import type { Message } from "@/lib/types/database";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

type MessageRow = Message & {
  contact?: { id: string; full_name: string };
  company?: { id: string; name: string };
};

export function MessageTable({ messages }: { messages: MessageRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-400 border-b border-gray-800">
            <th className="pb-2 font-medium">Contact</th>
            <th className="pb-2 font-medium">Company</th>
            <th className="pb-2 font-medium">Channel</th>
            <th className="pb-2 font-medium">Seq</th>
            <th className="pb-2 font-medium">Status</th>
            <th className="pb-2 font-medium">Scheduled</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800/50">
          {messages.map((msg) => (
            <tr key={msg.id} className="hover:bg-gray-900/50">
              <td className="py-2">
                {msg.contact ? (
                  <Link href={`/admin/contacts/${msg.contact.id}`} className="text-blue-400 hover:underline">
                    {msg.contact.full_name}
                  </Link>
                ) : "—"}
              </td>
              <td className="py-2 text-gray-300">
                {msg.company ? (
                  <Link href={`/admin/companies/${msg.company.id}`} className="text-gray-300 hover:underline">
                    {msg.company.name}
                  </Link>
                ) : "—"}
              </td>
              <td className="py-2"><Badge>{msg.channel}</Badge></td>
              <td className="py-2 text-gray-400">#{msg.sequence_number}.{msg.iteration}</td>
              <td className="py-2"><Badge variant={msg.status}>{msg.status}</Badge></td>
              <td className="py-2 text-gray-400">
                {msg.scheduled_at ? new Date(msg.scheduled_at).toLocaleDateString() : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Create company table component**

Create `components/admin/company-table.tsx`:

```tsx
import type { Company } from "@/lib/types/database";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

type CompanyRow = Company & {
  sponsor_tier?: string;
  contact_count?: number;
};

export function CompanyTable({ companies }: { companies: CompanyRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-400 border-b border-gray-800">
            <th className="pb-2 font-medium">Company</th>
            <th className="pb-2 font-medium">Category</th>
            <th className="pb-2 font-medium">Tier</th>
            <th className="pb-2 font-medium">ICP</th>
            <th className="pb-2 font-medium">Contacts</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800/50">
          {companies.map((co) => (
            <tr key={co.id} className="hover:bg-gray-900/50">
              <td className="py-2">
                <Link href={`/admin/companies/${co.id}`} className="text-blue-400 hover:underline">
                  {co.name}
                </Link>
              </td>
              <td className="py-2 text-gray-400">{co.category || "—"}</td>
              <td className="py-2">
                {co.sponsor_tier && <Badge>{co.sponsor_tier.replace(" SPONSORS", "")}</Badge>}
              </td>
              <td className="py-2">
                {co.icp_score != null && (
                  <Badge variant={co.icp_score >= 90 ? "replied" : co.icp_score >= 75 ? "scheduled" : "default"}>
                    {co.icp_score}
                  </Badge>
                )}
              </td>
              <td className="py-2 text-gray-400">{co.contact_count ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 5: Create event view page**

Create `app/admin/events/[id]/page.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { Tabs } from "@/components/ui/tabs";
import { ContactTable } from "@/components/admin/contact-table";
import { CompanyTable } from "@/components/admin/company-table";
import { MessageTable } from "@/components/admin/message-table";

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .single();

  if (!event) notFound();

  const { data: eventConfig } = await supabase
    .from("event_config")
    .select("*, sender:sender_profiles(*), prompt:prompt_templates(*)")
    .eq("event_id", id)
    .single();

  // Contacts linked to this event
  const { data: contactEvents } = await supabase
    .from("contact_event")
    .select("participation_type, contact:contacts(*, contact_company(*, company:companies(*)))")
    .eq("event_id", id);

  // Companies linked to this event
  const { data: companyEvents } = await supabase
    .from("company_event")
    .select("sponsor_tier, relationship_type, company:companies(*)")
    .eq("event_id", id);

  // Messages for this event
  const { data: messages } = await supabase
    .from("messages")
    .select("*, contact:contacts(id, full_name), company:companies(id, name)")
    .eq("event_id", id)
    .order("created_at", { ascending: false });

  const contacts = (contactEvents || []).map((ce: any) => ({
    ...ce.contact,
    participation_type: ce.participation_type,
  }));

  const companies = (companyEvents || []).map((ce: any) => ({
    ...ce.company,
    sponsor_tier: ce.sponsor_tier,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{event.name}</h1>
        <p className="text-gray-400 text-sm mt-1">
          {event.location} · {event.date_start} — {event.date_end}
        </p>
        {eventConfig && (
          <p className="text-gray-500 text-xs mt-2">
            Sender: {eventConfig.sender?.name || "—"} · CTA: {eventConfig.cta_url || "—"}
          </p>
        )}
      </div>

      <Tabs
        tabs={[
          {
            id: "contacts",
            label: `Contacts (${contacts.length})`,
            content: <ContactTable contacts={contacts} />,
          },
          {
            id: "companies",
            label: `Companies (${companies.length})`,
            content: <CompanyTable companies={companies} />,
          },
          {
            id: "messages",
            label: `Messages (${(messages || []).length})`,
            content: <MessageTable messages={messages || []} />,
          },
        ]}
      />
    </div>
  );
}
```

- [ ] **Step 6: Verify event page loads**

Navigate to `/admin/events/<ethcc-uuid>`. Expected: event header, three tabs with tables.

- [ ] **Step 7: Commit**

```bash
git add app/admin/events/ components/admin/contact-table.tsx components/admin/company-table.tsx components/admin/message-table.tsx components/ui/
git commit -m "feat: add event view page with contacts, companies, and messages tabs"
```

---

## Task 8: Contact Detail & Company Detail Pages

**Files:**
- Create: `app/admin/contacts/[id]/page.tsx`
- Create: `app/admin/companies/[id]/page.tsx`
- Create: `components/admin/signals-timeline.tsx`

- [ ] **Step 1: Create signals timeline component**

Create `components/admin/signals-timeline.tsx`:

```tsx
import type { CompanySignal } from "@/lib/types/database";
import { Badge } from "@/components/ui/badge";

export function SignalsTimeline({ signals }: { signals: CompanySignal[] }) {
  if (signals.length === 0) {
    return <p className="text-gray-500 text-sm">No signals yet.</p>;
  }

  return (
    <div className="space-y-3">
      {signals.map((signal) => (
        <div key={signal.id} className="flex items-start gap-3 bg-gray-900 border border-gray-800 rounded p-3">
          <Badge>{signal.signal_type}</Badge>
          <div className="flex-1">
            <p className="text-sm text-gray-300">{signal.description}</p>
            {signal.date && (
              <p className="text-xs text-gray-500 mt-1">{signal.date}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create contact detail page**

Create `app/admin/contacts/[id]/page.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { MessageTable } from "@/components/admin/message-table";
import Link from "next/link";

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: contact } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", id)
    .single();

  if (!contact) notFound();

  const [
    { data: affiliations },
    { data: events },
    { data: messages },
  ] = await Promise.all([
    supabase
      .from("contact_company")
      .select("*, company:companies(*)")
      .eq("contact_id", id),
    supabase
      .from("contact_event")
      .select("*, event:events(*)")
      .eq("contact_id", id),
    supabase
      .from("messages")
      .select("*, company:companies(id, name)")
      .eq("contact_id", id)
      .order("channel")
      .order("sequence_number")
      .order("iteration", { ascending: false }),
  ]);

  const primaryCompany = affiliations?.find((a: any) => a.is_primary)?.company || affiliations?.[0]?.company;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">{contact.full_name}</h1>
        <p className="text-gray-400 text-sm mt-1">
          {contact.title}{primaryCompany ? ` at ${primaryCompany.name}` : ""}
        </p>
        {primaryCompany?.icp_score != null && (
          <Badge variant={primaryCompany.icp_score >= 90 ? "replied" : "scheduled"} className="mt-2">
            ICP {primaryCompany.icp_score}
          </Badge>
        )}
      </div>

      {/* Contact info */}
      <div className="grid grid-cols-2 gap-4 bg-gray-900 border border-gray-800 rounded-lg p-4">
        {[
          ["Email", contact.email],
          ["LinkedIn", contact.linkedin],
          ["Twitter", contact.twitter],
          ["Telegram", contact.telegram],
          ["Phone", contact.phone],
          ["Source", contact.source],
        ].map(([label, value]) => (
          <div key={label as string}>
            <div className="text-xs text-gray-500">{label}</div>
            <div className="text-sm text-gray-300 mt-0.5">{(value as string) || "—"}</div>
          </div>
        ))}
      </div>

      {/* Context */}
      {contact.context && (
        <div>
          <h2 className="text-lg font-medium mb-2">Context</h2>
          <p className="text-sm text-gray-300 bg-gray-900 border border-gray-800 rounded-lg p-4">
            {contact.context}
          </p>
        </div>
      )}

      {/* Company affiliations */}
      <div>
        <h2 className="text-lg font-medium mb-2">Companies</h2>
        <div className="space-y-2">
          {(affiliations || []).map((aff: any) => (
            <div key={aff.id} className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded p-3">
              <Link href={`/admin/companies/${aff.company.id}`} className="text-blue-400 hover:underline text-sm">
                {aff.company.name}
              </Link>
              <span className="text-gray-400 text-sm">{aff.role || "—"}</span>
              {aff.founder_status && <Badge>{aff.founder_status}</Badge>}
              {aff.is_primary && <Badge variant="approved">primary</Badge>}
            </div>
          ))}
        </div>
      </div>

      {/* Events */}
      <div>
        <h2 className="text-lg font-medium mb-2">Events</h2>
        <div className="space-y-2">
          {(events || []).map((ce: any) => (
            <div key={ce.id} className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded p-3">
              <Link href={`/admin/events/${ce.event.id}`} className="text-blue-400 hover:underline text-sm">
                {ce.event.name}
              </Link>
              {ce.participation_type && <Badge>{ce.participation_type}</Badge>}
              {ce.track && <span className="text-gray-400 text-sm">{ce.track}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div>
        <h2 className="text-lg font-medium mb-2">Messages</h2>
        <MessageTable messages={(messages || []).map((m: any) => ({ ...m, contact: { id: contact.id, full_name: contact.full_name } }))} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create company detail page**

Create `app/admin/companies/[id]/page.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { SignalsTimeline } from "@/components/admin/signals-timeline";
import { ContactTable } from "@/components/admin/contact-table";
import { MessageTable } from "@/components/admin/message-table";

export default async function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("id", id)
    .single();

  if (!company) notFound();

  const [
    { data: signals },
    { data: contactLinks },
    { data: messages },
  ] = await Promise.all([
    supabase
      .from("company_signals")
      .select("*")
      .eq("company_id", id)
      .order("date", { ascending: false, nullsFirst: false }),
    supabase
      .from("contact_company")
      .select("*, contact:contacts(*, contact_company(*, company:companies(*)))")
      .eq("company_id", id),
    supabase
      .from("messages")
      .select("*, contact:contacts(id, full_name)")
      .eq("company_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const contacts = (contactLinks || []).map((cl: any) => cl.contact);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">{company.name}</h1>
        <p className="text-gray-400 text-sm mt-1">{company.category || "—"}</p>
        {company.icp_score != null && (
          <Badge variant={company.icp_score >= 90 ? "replied" : "scheduled"} className="mt-2">
            ICP {company.icp_score}
          </Badge>
        )}
      </div>

      {/* Company info */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
        {company.description && <div><div className="text-xs text-gray-500">Description</div><p className="text-sm text-gray-300 mt-0.5">{company.description}</p></div>}
        {company.context && <div><div className="text-xs text-gray-500">Context</div><p className="text-sm text-gray-300 mt-0.5">{company.context}</p></div>}
        {company.usp && <div><div className="text-xs text-gray-500">Our Angle (USP)</div><p className="text-sm text-gray-300 mt-0.5">{company.usp}</p></div>}
        {company.icp_reason && <div><div className="text-xs text-gray-500">ICP Reason</div><p className="text-sm text-gray-300 mt-0.5">{company.icp_reason}</p></div>}
      </div>

      {/* Signals */}
      <div>
        <h2 className="text-lg font-medium mb-2">Signals</h2>
        <SignalsTimeline signals={signals || []} />
      </div>

      {/* Contacts */}
      <div>
        <h2 className="text-lg font-medium mb-2">Contacts ({contacts.length})</h2>
        <ContactTable contacts={contacts} />
      </div>

      {/* Messages */}
      <div>
        <h2 className="text-lg font-medium mb-2">Messages</h2>
        <MessageTable messages={(messages || []).map((m: any) => ({ ...m, company: { id: company.id, name: company.name } }))} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify both detail pages render**

Navigate to `/admin/contacts/<uuid>` and `/admin/companies/<uuid>`. Expected: detail views with all sections.

- [ ] **Step 5: Commit**

```bash
git add app/admin/contacts/ app/admin/companies/ components/admin/signals-timeline.tsx
git commit -m "feat: add contact detail and company detail pages"
```

---

## Task 9: Message Queue Page

**Files:**
- Create: `app/admin/queue/page.tsx`

- [ ] **Step 1: Create message queue page**

Create `app/admin/queue/page.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server";
import { Tabs } from "@/components/ui/tabs";
import { MessageTable } from "@/components/admin/message-table";

export default async function QueuePage() {
  const supabase = await createClient();

  const [
    { data: drafts },
    { data: scheduled },
    { data: recentSent },
    { data: failed },
  ] = await Promise.all([
    supabase
      .from("messages")
      .select("*, contact:contacts(id, full_name), company:companies(id, name)")
      .eq("status", "draft")
      .order("created_at", { ascending: false }),
    supabase
      .from("messages")
      .select("*, contact:contacts(id, full_name), company:companies(id, name)")
      .eq("status", "scheduled")
      .order("scheduled_at", { ascending: true }),
    supabase
      .from("messages")
      .select("*, contact:contacts(id, full_name), company:companies(id, name)")
      .in("status", ["sent", "opened", "replied", "bounced"])
      .order("sent_at", { ascending: false })
      .limit(100),
    supabase
      .from("messages")
      .select("*, contact:contacts(id, full_name), company:companies(id, name)")
      .eq("status", "failed")
      .order("created_at", { ascending: false }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Message Queue</h1>

      <Tabs
        tabs={[
          {
            id: "drafts",
            label: `Drafts (${drafts?.length || 0})`,
            content: <MessageTable messages={drafts || []} />,
          },
          {
            id: "scheduled",
            label: `Scheduled (${scheduled?.length || 0})`,
            content: <MessageTable messages={scheduled || []} />,
          },
          {
            id: "sent",
            label: `Recently Sent (${recentSent?.length || 0})`,
            content: <MessageTable messages={recentSent || []} />,
          },
          {
            id: "failed",
            label: `Failed (${failed?.length || 0})`,
            content: <MessageTable messages={failed || []} />,
          },
        ]}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify queue page loads**

Navigate to `/admin/queue`. Expected: four tabs, tables for each status group.

- [ ] **Step 3: Commit**

```bash
git add app/admin/queue/
git commit -m "feat: add message queue page with status tabs"
```

---

## Task 10: Edge Function — enrich-contact

**Files:**
- Create: `supabase/functions/enrich-contact/index.ts`

- [ ] **Step 1: Create the edge function**

Create `supabase/functions/enrich-contact/index.ts`:

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const APOLLO_API_KEY = Deno.env.get("APOLLO_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { contact_id, contact_ids } = await req.json();
  const ids = contact_ids || [contact_id];

  const results = [];

  for (const id of ids) {
    // Log start
    const { data: log } = await supabase.from("job_log").insert({
      job_type: "enrich_contact",
      target_table: "contacts",
      target_id: id,
      status: "started",
    }).select().single();

    try {
      // Get contact + primary company
      const { data: contact } = await supabase
        .from("contacts")
        .select("*, contact_company(company:companies(name))")
        .eq("id", id)
        .single();

      if (!contact) throw new Error("Contact not found");

      const companyName = contact.contact_company?.[0]?.company?.name;

      // Apollo People Search
      const searchRes = await fetch("https://api.apollo.io/v1/people/match", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": APOLLO_API_KEY,
        },
        body: JSON.stringify({
          first_name: contact.first_name,
          last_name: contact.last_name,
          organization_name: companyName,
        }),
      });

      const searchData = await searchRes.json();
      const person = searchData.person;

      if (!person) {
        await supabase.from("job_log").update({
          status: "completed",
          metadata: { message: "No Apollo match found" },
        }).eq("id", log!.id);
        results.push({ id, status: "no_match" });
        continue;
      }

      // Update contact — don't overwrite existing values
      const updates: Record<string, string> = {};
      if (!contact.email && person.email) updates.email = person.email;
      if (!contact.linkedin && person.linkedin_url) updates.linkedin = person.linkedin_url;
      if (!contact.twitter && person.twitter_url) updates.twitter = person.twitter_url;
      if (!contact.phone && person.phone_numbers?.[0]?.raw_number) updates.phone = person.phone_numbers[0].raw_number;
      if (!contact.apollo_id && person.id) updates.apollo_id = person.id;
      if (!contact.seniority && person.seniority) updates.seniority = person.seniority;
      if (!contact.department && person.departments?.[0]) updates.department = person.departments[0];

      if (Object.keys(updates).length > 0) {
        await supabase.from("contacts").update(updates).eq("id", id);
      }

      await supabase.from("job_log").update({
        status: "completed",
        metadata: { fields_updated: Object.keys(updates), apollo_id: person.id },
      }).eq("id", log!.id);

      results.push({ id, status: "enriched", fields: Object.keys(updates) });
    } catch (error) {
      await supabase.from("job_log").update({
        status: "failed",
        error: (error as Error).message,
      }).eq("id", log!.id);
      results.push({ id, status: "error", error: (error as Error).message });
    }

    // Rate limiting — 500ms between calls
    if (ids.length > 1) await new Promise((r) => setTimeout(r, 500));
  }

  return new Response(JSON.stringify({ results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
```

- [ ] **Step 2: Create shared CORS helper**

Create `supabase/functions/_shared/cors.ts`:

```typescript
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
```

- [ ] **Step 3: Deploy and test**

```bash
npx supabase functions deploy enrich-contact
```

Test with curl:

```bash
curl -X POST https://<your-project-ref>.supabase.co/functions/v1/enrich-contact \
  -H "Authorization: Bearer <secret_key>" \
  -H "Content-Type: application/json" \
  -d '{"contact_id": "<test-uuid>"}'
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/
git commit -m "feat: add enrich-contact edge function with Apollo integration"
```

---

## Task 11: Edge Function — enrich-company

**Files:**
- Create: `supabase/functions/enrich-company/index.ts`

- [ ] **Step 1: Create the edge function**

Create `supabase/functions/enrich-company/index.ts`:

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const BRAVE_API_KEY = Deno.env.get("BRAVE_SEARCH_API_KEY")!;
const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function braveSearch(query: string): Promise<string[]> {
  const res = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`,
    { headers: { "X-Subscription-Token": BRAVE_API_KEY, Accept: "application/json" } }
  );
  const data = await res.json();
  return (data.web?.results || []).map((r: any) => `${r.title}: ${r.description}`);
}

async function perplexitySearch(query: string): Promise<string> {
  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sonar",
      messages: [
        { role: "system", content: "You are a company research assistant. Return concise factual information about recent company news, partnerships, funding, and product launches." },
        { role: "user", content: query },
      ],
    }),
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

async function geminiSynthesize(companyName: string, braveResults: string[], perplexityResult: string): Promise<{ context: string; signals: { type: string; description: string; date: string | null }[] }> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Analyze this research about ${companyName} and produce:
1. A concise "context" paragraph (2-3 sentences) summarizing their current situation, recent news, and why they're relevant right now.
2. A JSON array of individual "signals" — each with "type" (one of: news, funding, partnership, product_launch, regulatory, hiring, award), "description" (one sentence), and "date" (ISO date string or null).

Research results:
${braveResults.join("\n")}

Deeper analysis:
${perplexityResult}

Respond in JSON format only:
{"context": "...", "signals": [{"type": "...", "description": "...", "date": "..."}]}`
          }]
        }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    }
  );
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{"context":"","signals":[]}';
  return JSON.parse(text);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { company_id, company_ids } = await req.json();
  const ids = company_ids || [company_id];
  const results = [];

  for (const id of ids) {
    const { data: log } = await supabase.from("job_log").insert({
      job_type: "enrich_company",
      target_table: "companies",
      target_id: id,
      status: "started",
    }).select().single();

    try {
      const { data: company } = await supabase
        .from("companies")
        .select("*")
        .eq("id", id)
        .single();

      if (!company) throw new Error("Company not found");

      const query = `${company.name} recent news 2025 2026`;
      const [braveResults, perplexityResult] = await Promise.all([
        braveSearch(query),
        perplexitySearch(`What are the most recent news, partnerships, funding events, and product launches for ${company.name}? Focus on 2025-2026.`),
      ]);

      const synthesis = await geminiSynthesize(company.name, braveResults, perplexityResult);

      // Update company context
      await supabase.from("companies").update({ context: synthesis.context }).eq("id", id);

      // Insert signals
      if (synthesis.signals.length > 0) {
        await supabase.from("company_signals").insert(
          synthesis.signals.map((s) => ({
            company_id: id,
            signal_type: s.type,
            description: s.description,
            date: s.date || null,
            source: "enrichment",
          }))
        );
      }

      await supabase.from("job_log").update({
        status: "completed",
        metadata: { signals_count: synthesis.signals.length },
      }).eq("id", log!.id);

      results.push({ id, status: "enriched", signals: synthesis.signals.length });
    } catch (error) {
      await supabase.from("job_log").update({
        status: "failed",
        error: (error as Error).message,
      }).eq("id", log!.id);
      results.push({ id, status: "error", error: (error as Error).message });
    }
  }

  return new Response(JSON.stringify({ results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
```

- [ ] **Step 2: Deploy and test**

```bash
npx supabase functions deploy enrich-company
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/enrich-company/
git commit -m "feat: add enrich-company edge function with Brave, Perplexity, and Gemini"
```

---

## Task 12: Edge Function — generate-messages

**Files:**
- Create: `supabase/functions/generate-messages/index.ts`

- [ ] **Step 1: Create the edge function**

Create `supabase/functions/generate-messages/index.ts`:

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, key) => {
    const parts = key.split(".");
    let val: any = vars;
    for (const p of parts) {
      val = val?.[p];
    }
    return val ?? "";
  });
}

async function callGemini(systemPrompt: string, userPrompt: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userPrompt }] }],
      }),
    }
  );
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const body = await req.json();
  const {
    contact_ids,
    event_id,
    channels = ["linkedin", "email"],
    sequence_number = 1,
    prompt_template_id,
    sender_id,
    cta,
  } = body;

  // Load event config
  const { data: eventConfig } = await supabase
    .from("event_config")
    .select("*, sender:sender_profiles(*), prompt:prompt_templates(*)")
    .eq("event_id", event_id)
    .single();

  // Resolve overrides
  const effectiveSenderId = sender_id || eventConfig?.sender_id;
  const effectiveCta = cta || eventConfig?.cta_url || "";

  let sender = eventConfig?.sender;
  if (sender_id && sender_id !== eventConfig?.sender_id) {
    const { data } = await supabase.from("sender_profiles").select("*").eq("id", sender_id).single();
    sender = data;
  }

  const results = [];

  for (const contactId of contact_ids) {
    const { data: log } = await supabase.from("job_log").insert({
      job_type: "generate_messages",
      target_table: "contacts",
      target_id: contactId,
      status: "started",
    }).select().single();

    try {
      // Load contact with company context
      const { data: contact } = await supabase
        .from("contacts")
        .select("*, contact_company(*, company:companies(*))")
        .eq("id", contactId)
        .single();

      if (!contact) throw new Error("Contact not found");

      const primaryAff = contact.contact_company?.find((cc: any) => cc.is_primary) || contact.contact_company?.[0];
      const company = primaryAff?.company;

      // Load company signals for context
      let signalsContext = "";
      if (company) {
        const { data: signals } = await supabase
          .from("company_signals")
          .select("description")
          .eq("company_id", company.id)
          .order("date", { ascending: false })
          .limit(3);
        signalsContext = (signals || []).map((s: any) => s.description).join(". ");
      }

      // Load previous message if follow-up
      let previousMessage = "";
      if (sequence_number > 1) {
        const { data: prev } = await supabase
          .from("messages")
          .select("body")
          .eq("contact_id", contactId)
          .eq("sequence_number", sequence_number - 1)
          .neq("status", "superseded")
          .order("iteration", { ascending: false })
          .limit(1)
          .single();
        previousMessage = prev?.body || "";
      }

      const templateVars: Record<string, any> = {
        contact: {
          full_name: contact.full_name || "",
          title: contact.title || "",
          context: contact.context || "",
        },
        company: {
          name: company?.name || "",
          context: [company?.context, signalsContext].filter(Boolean).join(" "),
          description: company?.description || "",
          usp: company?.usp || "",
          icp_reason: company?.icp_reason || "",
        },
        sender: {
          name: sender?.name || "",
          tone_notes: sender?.tone_notes || "",
        },
        cta: effectiveCta,
        previous_message: previousMessage,
      };

      for (const channel of channels) {
        // Resolve prompt template for this channel
        let promptTemplate = eventConfig?.prompt;
        if (prompt_template_id) {
          const { data } = await supabase.from("prompt_templates").select("*").eq("id", prompt_template_id).single();
          if (data) promptTemplate = data;
        }
        // Try channel-specific template
        if (!prompt_template_id && channel !== promptTemplate?.channel) {
          const { data: channelTemplate } = await supabase
            .from("prompt_templates")
            .select("*")
            .eq("channel", channel)
            .limit(1)
            .single();
          if (channelTemplate) promptTemplate = channelTemplate;
        }

        if (!promptTemplate) throw new Error(`No prompt template found for channel ${channel}`);

        const systemPrompt = fillTemplate(promptTemplate.system_prompt, templateVars);
        const userPrompt = fillTemplate(promptTemplate.user_prompt_template, templateVars);

        const generated = await callGemini(systemPrompt, userPrompt);

        // Parse subject for email
        let subject: string | null = null;
        let messageBody = generated.trim();
        if (channel === "email" && messageBody.startsWith("Subject:")) {
          const lines = messageBody.split("\n");
          subject = lines[0].replace("Subject:", "").trim();
          messageBody = lines.slice(1).join("\n").trim();
        }

        // Check for existing message at this position — if so, supersede
        const { data: existing } = await supabase
          .from("messages")
          .select("id, iteration")
          .eq("contact_id", contactId)
          .eq("channel", channel)
          .eq("sequence_number", sequence_number)
          .neq("status", "superseded")
          .order("iteration", { ascending: false })
          .limit(1);

        let iteration = 1;
        if (existing && existing.length > 0) {
          iteration = existing[0].iteration + 1;
          await supabase
            .from("messages")
            .update({ status: "superseded" })
            .eq("id", existing[0].id);
        }

        await supabase.from("messages").insert({
          contact_id: contactId,
          company_id: company?.id || null,
          event_id,
          channel,
          sequence_number,
          iteration,
          subject,
          body: messageBody,
          status: "draft",
          sender_id: effectiveSenderId,
          cta: effectiveCta,
        });
      }

      await supabase.from("job_log").update({
        status: "completed",
        metadata: { channels, sequence_number },
      }).eq("id", log!.id);

      results.push({ id: contactId, status: "generated" });
    } catch (error) {
      await supabase.from("job_log").update({
        status: "failed",
        error: (error as Error).message,
      }).eq("id", log!.id);
      results.push({ id: contactId, status: "error", error: (error as Error).message });
    }
  }

  return new Response(JSON.stringify({ results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
```

- [ ] **Step 2: Deploy and test**

```bash
npx supabase functions deploy generate-messages
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/generate-messages/
git commit -m "feat: add generate-messages edge function with Gemini and template system"
```

---

## Task 13: Edge Function — send-message

**Files:**
- Create: `supabase/functions/send-message/index.ts`

- [ ] **Step 1: Create the edge function**

Create `supabase/functions/send-message/index.ts`:

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SENDGRID_API_KEY = Deno.env.get("SENDGRID_API_KEY")!;
const HEYREACH_API_KEY = Deno.env.get("HEYREACH_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function sendEmail(to: string, from: string, subject: string, body: string, signature: string): Promise<void> {
  const htmlBody = body.replace(/\n/g, "<br>") + (signature ? `<br><br>${signature.replace(/\n/g, "<br>")}` : "");
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SENDGRID_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: from },
      subject: subject || "Meeting at the conference?",
      content: [{ type: "text/html", value: htmlBody }],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`SendGrid error: ${res.status} ${err}`);
  }
}

async function sendLinkedIn(accountId: string, linkedinUrl: string, message: string): Promise<void> {
  const res = await fetch("https://api.heyreach.io/api/v1/messages/send", {
    method: "POST",
    headers: {
      "X-API-KEY": HEYREACH_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      accountId,
      linkedinUrl,
      message,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HeyReach error: ${res.status} ${err}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { message_id, message_ids, source } = await req.json();

  let ids = message_ids || (message_id ? [message_id] : []);

  // If called by CRON, fetch scheduled messages
  if (source === "cron" && ids.length === 0) {
    const { data: scheduled } = await supabase
      .from("messages")
      .select("id")
      .eq("status", "scheduled")
      .lte("scheduled_at", new Date().toISOString());
    ids = (scheduled || []).map((m: any) => m.id);
  }

  if (ids.length === 0) {
    return new Response(JSON.stringify({ results: [], message: "No messages to send" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Set processing status to prevent double-sends
  await supabase
    .from("messages")
    .update({ status: "processing" })
    .in("id", ids);

  const results = [];

  for (const id of ids) {
    const { data: log } = await supabase.from("job_log").insert({
      job_type: "send_message",
      target_table: "messages",
      target_id: id,
      status: "started",
    }).select().single();

    try {
      const { data: message } = await supabase
        .from("messages")
        .select("*, contact:contacts(*), sender:sender_profiles(*)")
        .eq("id", id)
        .single();

      if (!message) throw new Error("Message not found");

      // Resolve sender — message override or fall back to event_config
      let sender = message.sender;
      if (!sender && message.event_id) {
        const { data: ec } = await supabase
          .from("event_config")
          .select("sender:sender_profiles(*)")
          .eq("event_id", message.event_id)
          .single();
        sender = ec?.sender;
      }

      switch (message.channel) {
        case "email": {
          if (!message.contact?.email) throw new Error("Contact has no email");
          if (!sender?.email) throw new Error("No sender email configured");
          await sendEmail(
            message.contact.email,
            sender.email,
            message.subject || `${message.contact.first_name} — Coffee at the conference?`,
            message.body,
            sender.signature || ""
          );
          break;
        }
        case "linkedin": {
          if (!message.contact?.linkedin) throw new Error("Contact has no LinkedIn URL");
          if (!sender?.heyreach_account_id) throw new Error("No HeyReach account configured");
          await sendLinkedIn(sender.heyreach_account_id, message.contact.linkedin, message.body);
          break;
        }
        case "twitter": {
          // Manual send — just mark as approved
          await supabase.from("messages").update({ status: "approved" }).eq("id", id);
          await supabase.from("job_log").update({
            status: "completed",
            metadata: { note: "Twitter requires manual send" },
          }).eq("id", log!.id);
          results.push({ id, status: "approved", note: "manual send required" });
          continue;
        }
        default:
          throw new Error(`Unsupported channel: ${message.channel}`);
      }

      await supabase.from("messages").update({
        status: "sent",
        sent_at: new Date().toISOString(),
      }).eq("id", id);

      await supabase.from("job_log").update({ status: "completed" }).eq("id", log!.id);
      results.push({ id, status: "sent" });
    } catch (error) {
      await supabase.from("messages").update({ status: "failed" }).eq("id", id);
      await supabase.from("job_log").update({
        status: "failed",
        error: (error as Error).message,
      }).eq("id", log!.id);
      results.push({ id, status: "failed", error: (error as Error).message });
    }
  }

  return new Response(JSON.stringify({ results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
```

- [ ] **Step 2: Deploy**

```bash
npx supabase functions deploy send-message
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/send-message/
git commit -m "feat: add send-message edge function with SendGrid and HeyReach"
```

---

## Task 14: Edge Function — sync-status

**Files:**
- Create: `supabase/functions/sync-status/index.ts`

- [ ] **Step 1: Create the edge function**

Create `supabase/functions/sync-status/index.ts`:

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SENDGRID_API_KEY = Deno.env.get("SENDGRID_API_KEY")!;
const HEYREACH_API_KEY = Deno.env.get("HEYREACH_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: log } = await supabase.from("job_log").insert({
    job_type: "sync_status",
    status: "started",
  }).select().single();

  try {
    let updatedCount = 0;

    // Sync SendGrid email statuses
    const { data: emailMessages } = await supabase
      .from("messages")
      .select("id, contact:contacts(email)")
      .eq("channel", "email")
      .in("status", ["sent"]);

    for (const msg of emailMessages || []) {
      const email = (msg as any).contact?.email;
      if (!email) continue;

      // SendGrid Activity API — check for events on this email
      const res = await fetch(
        `https://api.sendgrid.com/v3/messages?query=to_email="${email}"&limit=1`,
        { headers: { Authorization: `Bearer ${SENDGRID_API_KEY}` } }
      );

      if (res.ok) {
        const data = await res.json();
        const events = data.messages?.[0]?.events || [];
        const eventTypes = events.map((e: any) => e.event_name);

        let newStatus: string | null = null;
        if (eventTypes.includes("bounce") || eventTypes.includes("dropped")) {
          newStatus = "bounced";
        } else if (eventTypes.includes("open")) {
          newStatus = "opened";
        }

        if (newStatus) {
          await supabase.from("messages").update({ status: newStatus }).eq("id", msg.id);
          updatedCount++;
        }
      }

      await new Promise((r) => setTimeout(r, 200)); // Rate limit
    }

    // Sync HeyReach LinkedIn statuses
    // HeyReach API polling — implementation depends on their specific API
    // This is a placeholder for the HeyReach status sync
    const { data: linkedinMessages } = await supabase
      .from("messages")
      .select("id")
      .eq("channel", "linkedin")
      .in("status", ["sent"]);

    // TODO: Poll HeyReach API for message delivery/reply status
    // Update message statuses accordingly

    await supabase.from("job_log").update({
      status: "completed",
      metadata: { updated_count: updatedCount, checked_email: emailMessages?.length || 0, checked_linkedin: linkedinMessages?.length || 0 },
    }).eq("id", log!.id);

    return new Response(JSON.stringify({ updated: updatedCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    await supabase.from("job_log").update({
      status: "failed",
      error: (error as Error).message,
    }).eq("id", log!.id);

    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
```

- [ ] **Step 2: Deploy**

```bash
npx supabase functions deploy sync-status
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/sync-status/
git commit -m "feat: add sync-status edge function for SendGrid and HeyReach polling"
```

---

## Task 15: Edge Function — process-automations

**Files:**
- Create: `supabase/functions/process-automations/index.ts`

- [ ] **Step 1: Create the edge function**

Create `supabase/functions/process-automations/index.ts`:

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function evaluateConditions(conditions: Record<string, any>, row: Record<string, any>): boolean {
  for (const [field, rule] of Object.entries(conditions)) {
    const value = row[field];
    if (typeof rule === "object" && rule !== null) {
      if ("gte" in rule && (value == null || value < rule.gte)) return false;
      if ("lte" in rule && (value == null || value > rule.lte)) return false;
      if ("eq" in rule && value !== rule.eq) return false;
      if ("neq" in rule && value === rule.neq) return false;
      if ("in" in rule && !rule.in.includes(value)) return false;
    } else {
      if (value !== rule) return false;
    }
  }
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { table, event, id } = await req.json();

  // Load the changed row
  const { data: row } = await supabase.from(table).select("*").eq("id", id).single();
  if (!row) {
    return new Response(JSON.stringify({ message: "Row not found" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Find matching automation rules
  const { data: rules } = await supabase
    .from("automation_rules")
    .select("*")
    .eq("trigger_table", table)
    .eq("trigger_event", event)
    .eq("enabled", true);

  const triggered = [];

  for (const rule of rules || []) {
    // For contact_company triggers, we need to resolve the company for condition checks
    let evalRow = row;
    if (table === "contact_company" && rule.conditions && Object.keys(rule.conditions).some(k => k.startsWith("icp_"))) {
      const { data: company } = await supabase.from("companies").select("*").eq("id", row.company_id).single();
      evalRow = { ...row, ...company };
    }

    if (!evaluateConditions(rule.conditions, evalRow)) continue;

    await supabase.from("job_log").insert({
      job_type: "automation",
      target_table: table,
      target_id: id,
      status: "started",
      metadata: { rule_name: rule.name, action: rule.action },
    });

    // Invoke the appropriate edge function
    const functionName = rule.action.replace(/_/g, "-");
    const payload: Record<string, any> = { ...rule.action_params };

    if (rule.action === "enrich_contact") {
      payload.contact_id = table === "contacts" ? id : row.contact_id;
    } else if (rule.action === "enrich_company") {
      payload.company_id = table === "companies" ? id : row.company_id;
    } else if (rule.action === "generate_sequence") {
      payload.contact_ids = [table === "contacts" ? id : row.contact_id];
    }

    await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    triggered.push({ rule: rule.name, action: rule.action });
  }

  return new Response(JSON.stringify({ triggered }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
```

- [ ] **Step 2: Deploy**

```bash
npx supabase functions deploy process-automations
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/process-automations/
git commit -m "feat: add process-automations edge function for rule-based triggers"
```

---

## Task 16: Data Migration Script

**Files:**
- Create: `scripts/migrate-csv.ts`

- [ ] **Step 1: Install script dependencies**

```bash
npm install csv-parse dotenv tsx
```

- [ ] **Step 2: Create migration script**

Create `scripts/migrate-csv.ts`. This is a long script — structure it as sequential steps:

```typescript
import { createClient } from "@supabase/supabase-js";
import { parse } from "csv-parse/sync";
import { readFileSync } from "fs";
import { config } from "dotenv";

config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_SUPABASE_SECRET_KEY!
);

const BASE = process.cwd();
const SCRAPING = `${BASE}/scraping/data`;
const MATRIX = `${BASE}/app/matrix/base`;

function readCsv(path: string): Record<string, string>[] {
  return parse(readFileSync(path, "utf-8"), { columns: true, skip_empty_lines: true, bom: true });
}

// Dedup maps
const companyMap = new Map<string, string>(); // name -> uuid
const contactMap = new Map<string, string>(); // "fullname|company" -> uuid

async function upsertCompany(name: string, fields: Record<string, any> = {}): Promise<string> {
  const key = name.toUpperCase().trim();
  if (companyMap.has(key)) return companyMap.get(key)!;

  const { data } = await supabase
    .from("companies")
    .upsert({ name: name.trim(), ...fields }, { onConflict: "name" })
    .select("id")
    .single();

  // If upsert doesn't work (no unique on name), try insert/select
  if (!data) {
    const { data: existing } = await supabase
      .from("companies")
      .select("id")
      .ilike("name", key)
      .limit(1)
      .single();
    if (existing) {
      companyMap.set(key, existing.id);
      // Update fields if provided
      if (Object.keys(fields).length > 0) {
        await supabase.from("companies").update(fields).eq("id", existing.id);
      }
      return existing.id;
    }
    const { data: inserted } = await supabase
      .from("companies")
      .insert({ name: name.trim(), ...fields })
      .select("id")
      .single();
    companyMap.set(key, inserted!.id);
    return inserted!.id;
  }

  companyMap.set(key, data.id);
  return data.id;
}

async function upsertContact(fullName: string, companyName: string, fields: Record<string, any> = {}): Promise<string> {
  const key = `${fullName.toUpperCase().trim()}|${companyName.toUpperCase().trim()}`;
  if (contactMap.has(key)) return contactMap.get(key)!;

  const names = fullName.trim().split(/\s+/);
  const firstName = names[0];
  const lastName = names.slice(1).join(" ");

  const { data: existing } = await supabase
    .from("contacts")
    .select("id")
    .ilike("full_name", fullName.trim())
    .limit(1)
    .single();

  if (existing) {
    contactMap.set(key, existing.id);
    if (Object.keys(fields).length > 0) {
      await supabase.from("contacts").update(fields).eq("id", existing.id);
    }
    return existing.id;
  }

  const { data: inserted } = await supabase
    .from("contacts")
    .insert({
      first_name: firstName,
      last_name: lastName,
      full_name: fullName.trim(),
      ...fields,
    })
    .select("id")
    .single();

  contactMap.set(key, inserted!.id);
  return inserted!.id;
}

async function main() {
  console.log("Starting migration...");

  // Get event IDs (seeded)
  const { data: events } = await supabase.from("events").select("id, name");
  const ethccId = events?.find((e) => e.name === "EthCC 2026")?.id;
  if (!ethccId) throw new Error("EthCC 2026 event not found — run seed.sql first");

  // 1. Sponsors → companies + company_event
  console.log("1. Importing sponsors...");
  const sponsors = readCsv(`${SCRAPING}/sponsors.csv`);
  for (const s of sponsors) {
    const companyId = await upsertCompany(s.name, {
      website: s.website || null,
      description: s.description || null,
    });
    await supabase.from("company_event").upsert({
      company_id: companyId,
      event_id: ethccId,
      relationship_type: "sponsor",
      sponsor_tier: s.tier || null,
    }, { onConflict: "company_id,event_id" }).select();
  }
  console.log(`  → ${sponsors.length} sponsors imported`);

  // 2. Company research → companies (usp, icp_score, icp_reason)
  console.log("2. Importing company research...");
  const research = readCsv(`${SCRAPING}/company_research.csv`);
  for (const r of research) {
    await upsertCompany(r.company, {
      usp: r.usp || null,
      icp_score: r.icp_score ? parseInt(r.icp_score) : null,
      icp_reason: r.icp_reason || null,
    });
  }
  console.log(`  → ${research.length} companies enriched with ICP data`);

  // 3. Company news → company_signals + companies.context
  console.log("3. Importing company signals...");
  const newsRaw = readFileSync(`${SCRAPING}/company_news_cache.json`, "utf-8");
  const news: Record<string, string> = JSON.parse(newsRaw);
  let signalCount = 0;
  for (const [companyName, description] of Object.entries(news)) {
    if (description.includes("No notable recent news") || description.includes("No recent 2025-2026 news")) continue;
    const companyId = await upsertCompany(companyName, { context: description });
    await supabase.from("company_signals").insert({
      company_id: companyId,
      signal_type: "news",
      description,
      source: "company_news_cache",
    });
    signalCount++;
  }
  console.log(`  → ${signalCount} signals imported`);

  // 4. Cannes-Grid view (primary source) → contacts, companies, messages
  console.log("4. Importing Cannes-Grid view (238 speakers)...");
  const grid = readCsv(`${MATRIX}/Cannes-Grid view.csv`);
  for (const row of grid) {
    const name = row.Name?.trim();
    const company = row.Company?.trim();
    if (!name) continue;

    const companyId = company ? await upsertCompany(company, {
      category: row["Category (from Company)"] || row["Cat 1"] || null,
      description: row.Notes || null,
    }) : null;

    const contactId = await upsertContact(name, company || "", {
      title: row.Role || null,
      email: row.Email || null,
      linkedin: row.LinkedIn || null,
      twitter: row.X || null,
      source: "speakers",
    });

    // Link contact to company
    if (companyId) {
      await supabase.from("contact_company").upsert({
        contact_id: contactId,
        company_id: companyId,
        role: row.Role || null,
        role_type: row.Role_Type || null,
        is_primary: true,
        source: "speakers",
      }, { onConflict: "contact_id,company_id" }).select();
    }

    // Link contact to event
    await supabase.from("contact_event").upsert({
      contact_id: contactId,
      event_id: ethccId,
      participation_type: "speaker",
    }, { onConflict: "contact_id,event_id" }).select();

    // Create message if exists
    if (row.Message?.trim()) {
      const emailSent = row["Emails Sent"] === "0.0";
      await supabase.from("messages").insert({
        contact_id: contactId,
        company_id: companyId,
        event_id: ethccId,
        channel: "email",
        sequence_number: 1,
        iteration: 1,
        subject: row.Subject || null,
        body: row.Message.trim(),
        status: emailSent ? "sent" : "draft",
        sent_at: emailSent ? new Date().toISOString() : null,
      });
    }
  }
  console.log(`  → ${grid.length} speaker rows imported`);

  // 5. Sponsor contacts → contacts + contact_company + contact_event
  console.log("5. Importing sponsor contacts (464)...");
  const sponsorContacts = readCsv(`${SCRAPING}/sponsor_contacts.csv`);
  for (const sc of sponsorContacts) {
    const companyId = await upsertCompany(sc.company);
    const contactId = await upsertContact(sc.person_name, sc.company, {
      first_name: sc.first_name || null,
      last_name: sc.last_name || null,
      title: sc.title || null,
      seniority: sc.seniority || null,
      department: sc.department || null,
      email: sc.email || null,
      linkedin: sc.linkedin || null,
      twitter: sc.twitter || null,
      phone: sc.phone || null,
      apollo_id: sc.apollo_id || null,
      source: "apollo",
    });

    await supabase.from("contact_company").upsert({
      contact_id: contactId,
      company_id: companyId,
      role: sc.title || null,
      source: "apollo",
    }, { onConflict: "contact_id,company_id" }).select();

    await supabase.from("contact_event").upsert({
      contact_id: contactId,
      event_id: ethccId,
      participation_type: "sponsor_rep",
    }, { onConflict: "contact_id,event_id" }).select();
  }
  console.log(`  → ${sponsorContacts.length} sponsor contacts imported`);

  console.log("\nMigration complete!");
}

main().catch(console.error);
```

- [ ] **Step 3: Add unique constraint on companies.name for upsert support**

Run in SQL editor:

```sql
CREATE UNIQUE INDEX idx_companies_name_unique ON companies (UPPER(TRIM(name)));
```

- [ ] **Step 4: Run migration**

```bash
npx tsx scripts/migrate-csv.ts
```

Expected: logs showing import counts for each step.

- [ ] **Step 5: Verify data in Supabase dashboard**

Check tables in Supabase Table Editor. Expected:
- ~300+ contacts
- ~200+ companies
- ~238 messages
- ~192 company signals
- Contact/company/event join tables populated

- [ ] **Step 6: Commit**

```bash
git add scripts/migrate-csv.ts
git commit -m "feat: add CSV/JSON to Supabase data migration script"
```

---

## Task 17: Set Supabase Edge Function Secrets

**No files — configuration only.**

- [ ] **Step 1: Set all API keys as edge function secrets**

```bash
npx supabase secrets set \
  APOLLO_API_KEY=<your-apollo-key> \
  GEMINI_API_KEY=<your-gemini-key> \
  BRAVE_SEARCH_API_KEY=<your-brave-key> \
  PERPLEXITY_API_KEY=<your-perplexity-key> \
  SENDGRID_API_KEY=<your-sendgrid-key> \
  HEYREACH_API_KEY="<your-heyreach-key>"
```

- [ ] **Step 2: Verify secrets are set**

```bash
npx supabase secrets list
```

Expected: all 6 keys listed.

---

## Task 18: Deploy All Edge Functions & Apply CRON

- [ ] **Step 1: Deploy all edge functions**

```bash
npx supabase functions deploy enrich-contact
npx supabase functions deploy enrich-company
npx supabase functions deploy generate-messages
npx supabase functions deploy send-message
npx supabase functions deploy sync-status
npx supabase functions deploy process-automations
```

- [ ] **Step 2: Apply CRON jobs**

Run `supabase/migrations/004_cron.sql` via Supabase SQL editor (pg_cron is only available on hosted Supabase, not local).

- [ ] **Step 3: Create a test user in Supabase Auth**

Go to Supabase Dashboard > Authentication > Users > Add User. Create an account with email/password for testing.

- [ ] **Step 4: End-to-end verification**

1. Navigate to `/admin/login` → sign in
2. Dashboard shows summary cards with real data counts
3. Click an event in sidebar → event view shows contacts, companies, messages
4. Click a contact → detail page with all info and messages
5. Click a company → detail page with signals and contacts
6. Navigate to `/admin/queue` → messages in tabs
7. Navigate to `/jb` → landing page (no admin shell)
8. Navigate to `/wes` → landing page (no admin shell)

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete outreach app — all views, edge functions, and data migration"
```
