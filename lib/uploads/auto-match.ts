// lib/uploads/auto-match.ts
import type { ImportMode } from "./field-sets";

function normalize(header: string): string {
  return header.toLowerCase().trim().replace(/[\s\-]+/g, "_");
}

const PERSON_MAP: Record<string, string> = {
  name: "full_name",
  full_name: "full_name",
  fullname: "full_name",
  first_name: "first_name",
  firstname: "first_name",
  last_name: "last_name",
  lastname: "last_name",
  email: "email",
  email_address: "email",
  linkedin: "linkedin",
  linkedin_url: "linkedin",
  linkedin_profile: "linkedin",
  twitter: "twitter",
  twitter_handle: "twitter",
  twitter_url: "twitter",
  telegram: "telegram",
  telegram_handle: "telegram",
  phone: "phone",
  phone_number: "phone",
  title: "title",
  job_title: "title",
  role: "title",
  seniority: "seniority",
  department: "department",
  company: "organization_name",
  company_name: "organization_name",
  org: "organization_name",
  organization: "organization_name",
  organization_name: "organization_name",
  event: "event",
  event_name: "event",
  notes: "context",
  context: "context",
};

const ORG_MAP: Record<string, string> = {
  name: "name",
  company: "name",
  company_name: "name",
  organization: "name",
  organization_name: "name",
  website: "website",
  url: "website",
  domain: "website",
  category: "category",
  linkedin: "linkedin_url",
  linkedin_url: "linkedin_url",
  industry: "industry",
  employees: "employee_count",
  employee_count: "employee_count",
  headcount: "employee_count",
  revenue: "annual_revenue",
  annual_revenue: "annual_revenue",
  founded: "founded_year",
  founded_year: "founded_year",
  hq: "hq_location",
  hq_location: "hq_location",
  headquarters: "hq_location",
  funding: "funding_total",
  funding_total: "funding_total",
  funding_stage: "latest_funding_stage",
  latest_funding_stage: "latest_funding_stage",
  stage: "latest_funding_stage",
  icp_score: "icp_score",
  icp_reason: "icp_reason",
  event: "event",
  event_name: "event",
};

export function autoMatchHeader(header: string, mode: ImportMode): string {
  if (!header) return "";
  const key = normalize(header);
  const map = mode === "persons" ? PERSON_MAP : ORG_MAP;
  return map[key] ?? "";
}
