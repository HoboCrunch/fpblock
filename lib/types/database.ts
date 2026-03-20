// database.ts  –  TypeScript types mirroring the Supabase schema

export interface Contact {
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
}

export interface Company {
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
}

export interface Event {
  id: string;
  name: string;
  location: string | null;
  date_start: string | null;
  date_end: string | null;
  website: string | null;
  notes: string | null;
  created_at: string;
}

export type MessageStatus =
  | "draft"
  | "scheduled"
  | "sending"
  | "sent"
  | "delivered"
  | "opened"
  | "replied"
  | "bounced"
  | "failed";

export type MessageChannel = "email" | "linkedin" | "twitter" | "telegram";

export interface Message {
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
  replied_at: string | null;
}

export interface CompanySignal {
  id: string;
  company_id: string;
  signal_type: string;
  description: string;
  date: string | null;
  source: string | null;
  created_at: string;
}

export interface ContactCompany {
  id: string;
  contact_id: string;
  company_id: string;
  role: string | null;
  role_type: string | null;
  founder_status: string | null;
  is_primary: boolean;
  source: string | null;
}

export interface ContactEvent {
  id: string;
  contact_id: string;
  event_id: string;
  participation_type: string | null;
  track: string | null;
  notes: string | null;
}

export interface CompanyEvent {
  id: string;
  company_id: string;
  event_id: string;
  relationship_type: string | null;
  sponsor_tier: string | null;
  notes: string | null;
}

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

export interface Sequence {
  id: string;
  name: string;
  channel: string;
  event_id: string | null;
  steps: SequenceStep[];
  created_at: string;
  updated_at: string;
}

export interface SequenceStep {
  step_number: number;
  delay_days: number;
  action_type: "initial" | "follow_up" | "break_up";
  subject_template: string | null;
  body_template: string;
  prompt_template_id: string | null;
}

export interface SequenceEnrollment {
  id: string;
  sequence_id: string;
  contact_id: string;
  current_step: number;
  status: "active" | "paused" | "completed" | "bounced";
  enrolled_at: string;
}

export interface Upload {
  id: string;
  filename: string;
  row_count: number | null;
  contacts_created: number;
  companies_created: number;
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
  contact_id: string | null;
  correlated_message_id: string | null;
  correlation_type: "exact_email" | "domain_match" | "manual" | "none" | null;
  raw_headers: Record<string, unknown> | null;
  created_at: string;
}
