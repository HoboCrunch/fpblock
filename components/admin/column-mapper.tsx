"use client";

import { useMemo } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassSelect } from "@/components/ui/glass-select";
import { cn } from "@/lib/utils";

export type FieldMapping = Record<string, string>;

const PERSON_FIELDS = [
  { value: "", label: "-- Skip --" },
  { value: "full_name", label: "Full Name" },
  { value: "first_name", label: "First Name" },
  { value: "last_name", label: "Last Name" },
  { value: "email", label: "Email" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "twitter", label: "Twitter" },
  { value: "phone", label: "Phone" },
  { value: "title", label: "Title" },
  { value: "seniority", label: "Seniority" },
  { value: "department", label: "Department" },
  { value: "telegram", label: "Telegram" },
  { value: "context", label: "Context / Notes" },
  { value: "company_name", label: "Organization Name" },
  { value: "company_website", label: "Organization Website" },
  { value: "company_category", label: "Organization Category" },
  { value: "company_linkedin", label: "Organization LinkedIn" },
  { value: "icp_score", label: "ICP Score" },
  { value: "icp_reason", label: "ICP Reason" },
];

const AUTO_MATCH: Record<string, string> = {
  name: "full_name",
  full_name: "full_name",
  fullname: "full_name",
  first_name: "first_name",
  firstname: "first_name",
  last_name: "last_name",
  lastname: "last_name",
  email: "email",
  linkedin: "linkedin",
  linkedin_url: "linkedin",
  twitter: "twitter",
  twitter_handle: "twitter",
  phone: "phone",
  title: "title",
  job_title: "title",
  seniority: "seniority",
  department: "department",
  company: "company_name",
  company_name: "company_name",
  org: "company_name",
  organization: "company_name",
  website: "company_website",
  company_website: "company_website",
  category: "company_category",
  icp_score: "icp_score",
  icp_reason: "icp_reason",
  context: "context",
  notes: "context",
  telegram: "telegram",
};

interface ColumnMapperProps {
  csvHeaders: string[];
  csvPreview: string[][];
  mapping: FieldMapping;
  onMappingChange: (mapping: FieldMapping) => void;
}

export function ColumnMapper({
  csvHeaders,
  csvPreview,
  mapping,
  onMappingChange,
}: ColumnMapperProps) {
  const effectiveMapping = useMemo(() => {
    const m: FieldMapping = { ...mapping };
    csvHeaders.forEach((header) => {
      if (!(header in m)) {
        const normalized = header.toLowerCase().trim().replace(/\s+/g, "_");
        m[header] = AUTO_MATCH[normalized] ?? "";
      }
    });
    return m;
  }, [csvHeaders, mapping]);

  function updateField(csvHeader: string, targetField: string) {
    onMappingChange({ ...effectiveMapping, [csvHeader]: targetField });
  }

  return (
    <div className="space-y-6">
      {/* Mapping UI */}
      <GlassCard>
        <h3 className="text-white font-semibold font-[family-name:var(--font-heading)] mb-4">
          Map Columns
        </h3>
        <div className="space-y-3">
          {csvHeaders.map((header) => (
            <div key={header} className="flex items-center gap-4">
              <div className="w-1/3 text-sm text-[var(--text-secondary)] truncate font-mono">
                {header}
              </div>
              <div className="text-[var(--text-muted)]">&rarr;</div>
              <div className="flex-1">
                <GlassSelect
                  options={PERSON_FIELDS}
                  value={effectiveMapping[header] ?? ""}
                  onChange={(e) => updateField(header, e.target.value)}
                />
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* Preview Table */}
      <GlassCard padding={false}>
        <div className="p-4 border-b border-[var(--glass-border)]">
          <h3 className="text-white font-semibold font-[family-name:var(--font-heading)]">
            Preview (first {Math.min(csvPreview.length, 10)} rows)
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--glass-border)]">
                {csvHeaders.map((header) => (
                  <th
                    key={header}
                    className={cn(
                      "px-4 py-2 text-left font-medium whitespace-nowrap",
                      effectiveMapping[header]
                        ? "text-[var(--accent-orange)]"
                        : "text-[var(--text-muted)]"
                    )}
                  >
                    {effectiveMapping[header] || header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {csvPreview.slice(0, 10).map((row, ri) => (
                <tr
                  key={ri}
                  className="border-b border-[var(--glass-border)] last:border-0"
                >
                  {csvHeaders.map((header, ci) => (
                    <td
                      key={ci}
                      className="px-4 py-2 text-[var(--text-secondary)] whitespace-nowrap max-w-[200px] truncate"
                    >
                      {row[ci] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}
