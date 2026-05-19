// lib/uploads/field-sets.ts
export type ImportMode = "persons" | "organizations";

export interface FieldDef {
  id: string;
  label: string;
}

export const PERSON_FIELDS: FieldDef[] = [
  { id: "full_name", label: "Full Name" },
  { id: "first_name", label: "First Name" },
  { id: "last_name", label: "Last Name" },
  { id: "email", label: "Email" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "twitter", label: "Twitter" },
  { id: "telegram", label: "Telegram" },
  { id: "phone", label: "Phone" },
  { id: "title", label: "Title" },
  { id: "seniority", label: "Seniority" },
  { id: "department", label: "Department" },
  { id: "organization_name", label: "Organization (by name)" },
  { id: "event", label: "Event (by name)" },
  { id: "context", label: "Notes" },
];

export const ORGANIZATION_FIELDS: FieldDef[] = [
  { id: "name", label: "Name" },
  { id: "website", label: "Website" },
  { id: "category", label: "Category" },
  { id: "linkedin_url", label: "LinkedIn" },
  { id: "icp_score", label: "ICP Score" },
  { id: "icp_reason", label: "ICP Reason" },
  { id: "industry", label: "Industry" },
  { id: "employee_count", label: "Employee Count" },
  { id: "annual_revenue", label: "Annual Revenue" },
  { id: "founded_year", label: "Founded Year" },
  { id: "hq_location", label: "HQ Location" },
  { id: "funding_total", label: "Funding Total" },
  { id: "latest_funding_stage", label: "Latest Funding Stage" },
  { id: "event", label: "Event (by name)" },
];

export function fieldSetForMode(mode: ImportMode): FieldDef[] {
  return mode === "persons" ? PERSON_FIELDS : ORGANIZATION_FIELDS;
}

export function isValidFieldForMode(fieldId: string, mode: ImportMode): boolean {
  return fieldSetForMode(mode).some((f) => f.id === fieldId);
}
