"use client";

import React from "react";
import { Search } from "lucide-react";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { MultiSelectField } from "@/components/admin/multi-select-field";
import { FilterGroup } from "@/components/admin/filter-group";
import { EventRelationToggle } from "@/components/admin/event-relation-toggle";
import type { PersonFilterRules } from "@/lib/filters/person-filters";
import { cn } from "@/lib/utils";

type Option = { id: string; name: string };

export type PersonFilterSidebarProps = {
  rules: PersonFilterRules;
  onChange: (next: PersonFilterRules) => void;
  eventOptions: Option[];
  sourceOptions: string[];
  seniorityOptions: string[];
  departmentOptions: string[];
};

function Toggle({
  label, checked, onChange,
}: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer text-sm text-[var(--text-secondary)] hover:text-white transition-colors">
      <div
        className={cn(
          "w-8 h-4.5 rounded-full relative transition-colors",
          checked ? "bg-[var(--accent-orange)]/40" : "bg-white/[0.08]",
        )}
        onClick={(e) => { e.preventDefault(); onChange(!checked); }}
      >
        <div
          className={cn(
            "absolute top-0.5 w-3.5 h-3.5 rounded-full transition-all",
            checked ? "left-4 bg-[var(--accent-orange)]" : "left-0.5 bg-[var(--text-muted)]",
          )}
        />
      </div>
      {label}
    </label>
  );
}

export function PersonFilterSidebar({
  rules, onChange, eventOptions, sourceOptions, seniorityOptions, departmentOptions,
}: PersonFilterSidebarProps) {
  const set = (patch: Partial<PersonFilterRules>) => onChange({ ...rules, ...patch });

  const eventScope = rules.eventScope;

  return (
    <div className="p-3 space-y-1">
      <div className="pb-3">
        <GlassInput
          icon={Search}
          placeholder="Search name, email, org..."
          value={rules.search ?? ""}
          onChange={(e) => set({ search: e.target.value })}
        />
      </div>

      <FilterGroup title="Relationships" defaultOpen={true}>
        <div className="space-y-2">
          <GlassSelect
            placeholder="Scope by event..."
            options={eventOptions.map((ev) => ({ value: ev.id, label: ev.name }))}
            value={eventScope?.eventId ?? ""}
            onChange={(e) => {
              const eventId = e.target.value;
              if (!eventId) set({ eventScope: undefined });
              else set({ eventScope: { eventId, speaker: true, orgAffiliated: true } });
            }}
          />
          {eventScope && (
            <EventRelationToggle
              speaker={eventScope.speaker}
              orgAffiliated={eventScope.orgAffiliated}
              onChange={({ speaker, orgAffiliated }) =>
                set({ eventScope: { ...eventScope, speaker, orgAffiliated } })
              }
            />
          )}

          <MultiSelectField
            placeholder="Filter by event..."
            options={eventOptions.map((e) => ({ value: e.id, label: e.name }))}
            values={rules.events ?? []}
            onChange={(v) => set({ events: v.length ? v : undefined })}
          />

          <GlassSelect
            placeholder="Has Organization"
            options={[
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ]}
            value={rules.hasOrg ?? ""}
            onChange={(e) => set({ hasOrg: (e.target.value || undefined) as PersonFilterRules["hasOrg"] })}
          />

          <MultiSelectField
            placeholder="Correlation Type"
            options={[
              { value: "speaker_sponsor", label: "Speaker + Sponsor" },
              { value: "speaker_only", label: "Speaker Only" },
              { value: "sponsor_contact", label: "Sponsor Contact" },
              { value: "org_sponsor", label: "Org Sponsor" },
              { value: "none", label: "No Event Link" },
            ]}
            values={rules.correlationType ?? []}
            onChange={(v) => set({ correlationType: v.length ? v : undefined })}
          />
        </div>
      </FilterGroup>

      <FilterGroup title="Profile" defaultOpen={false}>
        <div className="space-y-2">
          <MultiSelectField
            placeholder="Seniority"
            options={seniorityOptions.map((s) => ({ value: s, label: s }))}
            values={rules.seniority ?? []}
            onChange={(v) => set({ seniority: v.length ? v : undefined })}
          />
          <MultiSelectField
            placeholder="Department"
            options={departmentOptions.map((d) => ({ value: d, label: d }))}
            values={rules.department ?? []}
            onChange={(v) => set({ department: v.length ? v : undefined })}
          />
          <MultiSelectField
            placeholder="Source"
            options={sourceOptions.map((s) => ({ value: s, label: s }))}
            values={rules.source ?? []}
            onChange={(v) => set({ source: v.length ? v : undefined })}
          />
        </div>
      </FilterGroup>

      <FilterGroup title="Contact" defaultOpen={false}>
        <div className="space-y-2">
          <Toggle label="Has Email" checked={!!rules.hasEmail} onChange={(v) => set({ hasEmail: v || undefined })} />
          <Toggle label="Has LinkedIn" checked={!!rules.hasLinkedin} onChange={(v) => set({ hasLinkedin: v || undefined })} />
          <Toggle label="Has Phone" checked={!!rules.hasPhone} onChange={(v) => set({ hasPhone: v || undefined })} />
          <Toggle label="Has Twitter" checked={!!rules.hasTwitter} onChange={(v) => set({ hasTwitter: v || undefined })} />
          <Toggle label="Has Telegram" checked={!!rules.hasTelegram} onChange={(v) => set({ hasTelegram: v || undefined })} />
        </div>
      </FilterGroup>

      <FilterGroup title="Enrichment" defaultOpen={false}>
        <div className="space-y-2">
          <MultiSelectField
            placeholder="Enrichment Status"
            options={[
              { value: "none", label: "None" },
              { value: "in_progress", label: "In Progress" },
              { value: "complete", label: "Complete" },
              { value: "failed", label: "Failed" },
            ]}
            values={rules.enrichmentStatus ?? []}
            onChange={(v) => set({ enrichmentStatus: v.length ? v : undefined })}
          />
          <div className="flex items-center gap-2">
            <GlassInput
              placeholder="ICP Min"
              type="number"
              value={rules.icpMin?.toString() ?? ""}
              onChange={(e) => {
                const n = e.target.value === "" ? undefined : parseInt(e.target.value);
                set({ icpMin: n !== undefined && !Number.isNaN(n) ? n : undefined });
              }}
              className="w-full"
            />
            <GlassInput
              placeholder="ICP Max"
              type="number"
              value={rules.icpMax?.toString() ?? ""}
              onChange={(e) => {
                const n = e.target.value === "" ? undefined : parseInt(e.target.value);
                set({ icpMax: n !== undefined && !Number.isNaN(n) ? n : undefined });
              }}
              className="w-full"
            />
          </div>
        </div>
      </FilterGroup>
    </div>
  );
}
