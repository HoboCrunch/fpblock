// bot/src/types.ts — Minimal types for the Telegram bot (subset of app types)

export type InteractionStatus = "draft" | "scheduled" | "sending" | "sent" | "delivered" | "opened" | "replied" | "bounced" | "failed";
export type InteractionChannel = "email" | "linkedin" | "twitter" | "telegram" | "in_person" | "phone";

export interface Person {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  title: string | null;
  created_at: string;
}

export interface Organization {
  id: string;
  name: string;
  icp_score: number | null;
  category: string | null;
  created_at: string;
}

export interface Interaction {
  id: string;
  person_id: string | null;
  organization_id: string | null;
  channel: InteractionChannel | null;
  status: InteractionStatus;
  subject: string | null;
  created_at: string;
  updated_at: string;
}

export interface InboundEmail {
  id: string;
  from_address: string;
  from_name: string | null;
  subject: string | null;
  body_preview: string | null;
  received_at: string;
  person_id: string | null;
  correlated_interaction_id: string | null;
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
