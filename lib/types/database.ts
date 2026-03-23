// database.ts  –  TypeScript types mirroring the Supabase schema (CRM Redesign)

// ============================================
// TYPE UNIONS
// ============================================

export type InteractionType = "cold_email" | "cold_linkedin" | "cold_twitter" | "warm_intro" | "meeting" | "call" | "event_encounter" | "note" | "research";
export type InteractionChannel = "email" | "linkedin" | "twitter" | "telegram" | "in_person" | "phone";
export type InteractionDirection = "outbound" | "inbound" | "internal";
export type InteractionStatus = "draft" | "scheduled" | "sending" | "sent" | "delivered" | "opened" | "replied" | "bounced" | "failed";
export type ParticipationRole = "speaker" | "attendee" | "organizer" | "panelist" | "mc" | "sponsor" | "partner" | "exhibitor" | "media";
export type SponsorTier = "presented_by" | "platinum" | "diamond" | "emerald" | "gold" | "silver" | "bronze" | "copper" | "community";

// ============================================
// CORE ENTITIES
// ============================================

export interface Person {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  linkedin_url: string | null;
  twitter_handle: string | null;
  telegram_handle: string | null;
  phone: string | null;
  title: string | null;
  seniority: string | null;
  department: string | null;
  bio: string | null;
  photo_url: string | null;
  source: string | null;
  apollo_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Organization {
  id: string;
  name: string;
  website: string | null;
  linkedin_url: string | null;
  category: string | null;
  description: string | null;
  logo_url: string | null;
  icp_score: number | null;
  icp_reason: string | null;
  context: string | null;
  usp: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PersonOrganization {
  id: string;
  person_id: string;
  organization_id: string;
  role: string | null;
  role_type: string | null;
  is_current: boolean;
  is_primary: boolean;
  source: string | null;
  created_at: string;
  updated_at: string;
}

export interface Event {
  id: string;
  name: string;
  slug: string | null;
  location: string | null;
  date_start: string | null;
  date_end: string | null;
  website: string | null;
  event_type: string | null;
  notes: string | null;
  created_at: string;
}

// ============================================
// EVENT RELATIONSHIPS
// ============================================

export interface EventParticipation {
  id: string;
  event_id: string;
  person_id: string | null;
  organization_id: string | null;
  role: ParticipationRole;
  sponsor_tier: SponsorTier | null;
  confirmed: boolean;
  talk_title: string | null;
  time_slot: string | null;
  track: string | null;
  room: string | null;
  notes: string | null;
}

// ============================================
// INITIATIVES & INTERACTIONS
// ============================================

export interface Initiative {
  id: string;
  name: string;
  initiative_type: string | null;
  event_id: string | null;
  status: string;
  owner: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface InitiativeEnrollment {
  id: string;
  initiative_id: string;
  person_id: string | null;
  organization_id: string | null;
  status: string;
  priority: string | null;
  enrolled_at: string;
}

export interface Interaction {
  id: string;
  person_id: string | null;
  organization_id: string | null;
  event_id: string | null;
  initiative_id: string | null;
  interaction_type: InteractionType;
  channel: InteractionChannel | null;
  direction: InteractionDirection | null;
  subject: string | null;
  body: string | null;
  status: InteractionStatus;
  handled_by: string | null;
  sender_profile_id: string | null;
  sequence_id: string | null;
  sequence_step: number | null;
  scheduled_at: string | null;
  occurred_at: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

// ============================================
// CORRELATION
// ============================================

export interface CorrelationCandidate {
  id: string;
  entity_type: string;
  source_id: string;
  target_id: string;
  confidence: number;
  match_reasons: unknown[] | null;
  status: "pending" | "merged" | "dismissed";
  resolved_by: string | null;
  created_at: string;
}

// ============================================
// SUPPORTING TABLES (renamed)
// ============================================

export interface OrganizationSignal {
  id: string;
  organization_id: string;
  signal_type: string;
  description: string;
  date: string | null;
  source: string | null;
  created_at: string;
}

// ============================================
// VIEW TYPES
// ============================================

export interface PersonWithIcp extends Person {
  primary_org_name: string | null;
  icp_score: number | null;
  icp_reason: string | null;
  org_category: string | null;
  org_role: string | null;
}

// ============================================
// UNCHANGED TABLES
// ============================================

export interface SenderProfile {
  id: string;
  name: string;
  email: string | null;
  heyreach_account_id: string | null;
  signature: string | null;
  tone_notes: string | null;
  created_at: string;
}

export interface EventConfig {
  id: string;
  event_id: string;
  sender_id: string | null;
  cta_url: string | null;
  cta_text: string | null;
  prompt_template_id: string | null;
  notify_emails: string[] | null;
  created_at: string;
}

export interface PromptTemplate {
  id: string;
  name: string;
  channel: string | null;
  system_prompt: string;
  user_prompt_template: string;
  created_at: string;
  updated_at: string;
}

export interface AutomationRule {
  id: string;
  name: string;
  trigger_table: string;
  trigger_event: string;
  conditions: Record<string, unknown>;
  action: string;
  action_params: Record<string, unknown>;
  enabled: boolean;
  created_at: string;
}

export interface JobLog {
  id: string;
  job_type: string;
  target_table: string | null;
  target_id: string | null;
  status: string;
  error: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface SequenceStep {
  step_number: number;
  delay_days: number;
  action_type: "initial" | "follow_up" | "break_up";
  subject_template: string | null;
  body_template: string;
  prompt_template_id: string | null;
}

export interface Sequence {
  id: string;
  name: string;
  channel: string;
  event_id: string | null;
  initiative_id: string | null;
  steps: SequenceStep[];
  status: "draft" | "active" | "paused" | "completed";
  created_at: string;
  updated_at: string;
}

export interface SequenceEnrollment {
  id: string;
  sequence_id: string;
  person_id: string;
  current_step: number;
  status: "active" | "paused" | "completed" | "bounced";
  enrolled_at: string;
}

export interface Upload {
  id: string;
  filename: string;
  row_count: number | null;
  persons_created: number;
  organizations_created: number;
  event_id: string | null;
  status: "processing" | "completed" | "failed";
  errors: Record<string, unknown> | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface InboxSyncState {
  id: string;
  account_email: string;
  last_sync_at: string | null;
  last_email_id: string | null;
  unread_count: number;
  status: "connected" | "error" | "disconnected";
  error_message: string | null;
  updated_at: string;
}

export interface InboundEmail {
  id: string;
  account_email: string;
  message_id: string;
  from_address: string;
  from_name: string | null;
  subject: string | null;
  body_preview: string | null;
  body_html: string | null;
  received_at: string;
  is_read: boolean;
  person_id: string | null;
  correlated_interaction_id: string | null;
  correlation_type: "exact_email" | "domain_match" | "manual" | "none" | null;
  raw_headers: Record<string, unknown> | null;
  created_at: string;
}

export interface CompanyContext {
  id: string;
  company_name: string;
  about: string | null;
  icp_criteria: string | null;
  positioning: string | null;
  language_rules: string | null;
  outreach_strategy: string | null;
  updated_at: string;
}
