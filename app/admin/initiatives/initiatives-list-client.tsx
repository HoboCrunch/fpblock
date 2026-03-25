"use client";

import { useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassSelect } from "@/components/ui/glass-select";
import { InitiativeTable, type InitiativeRow } from "@/components/admin/initiative-table";
import { Rocket } from "lucide-react";
import type { Event } from "@/lib/types/database";

export function InitiativesListClient({
  initiatives,
  events,
}: {
  initiatives: InitiativeRow[];
  events: Event[];
}) {
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [eventFilter, setEventFilter] = useState("");

  // Derive unique filter options from data
  const statuses = [...new Set(initiatives.map((i) => i.status).filter(Boolean))];
  const types = [...new Set(initiatives.map((i) => i.initiative_type).filter(Boolean))] as string[];
  const owners = [...new Set(initiatives.map((i) => i.owner).filter(Boolean))] as string[];

  const statusOptions = [
    { value: "", label: "All statuses" },
    ...statuses.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) })),
  ];

  const typeOptions = [
    { value: "", label: "All types" },
    ...types.map((t) => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) })),
  ];

  const ownerOptions = [
    { value: "", label: "All owners" },
    ...owners.map((o) => ({ value: o, label: o })),
  ];

  const eventOptions = [
    { value: "", label: "All events" },
    ...events.map((e) => ({ value: e.id, label: e.name })),
  ];

  const filtered = initiatives.filter((i) => {
    if (statusFilter && i.status !== statusFilter) return false;
    if (typeFilter && i.initiative_type !== typeFilter) return false;
    if (ownerFilter && i.owner !== ownerFilter) return false;
    if (eventFilter && i.event_id !== eventFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <GlassSelect options={statusOptions} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} />
        <GlassSelect options={typeOptions} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} />
        <GlassSelect options={ownerOptions} value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)} />
        <GlassSelect options={eventOptions} value={eventFilter} onChange={(e) => setEventFilter(e.target.value)} />
        <span className="text-sm text-[var(--text-muted)] ml-auto">
          {filtered.length} of {initiatives.length} initiatives
        </span>
      </div>

      {filtered.length === 0 ? (
        <GlassCard className="flex flex-col items-center justify-center py-16 text-center">
          <Rocket className="h-12 w-12 text-[var(--text-muted)] mb-4" />
          <p className="text-[var(--text-secondary)] mb-1">No initiatives found</p>
          <p className="text-sm text-[var(--text-muted)]">
            Initiatives track outreach campaigns, sponsorships, and partnership efforts.
          </p>
        </GlassCard>
      ) : (
        <GlassCard padding={false}>
          <InitiativeTable initiatives={filtered} />
        </GlassCard>
      )}
    </div>
  );
}
