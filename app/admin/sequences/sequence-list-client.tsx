"use client";

import { useState, useCallback } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useSequences, type SequenceFilters } from "@/lib/queries/use-sequences";
import { useEvents } from "@/lib/queries/use-events";
import { queryKeys } from "@/lib/queries/query-keys";
import { createSequence, deleteSequence, updateSequenceStatus } from "./actions";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { SequenceRow } from "@/components/admin/sequence-row";
import { SequencePreview } from "@/components/admin/sequence-preview";
import { TwoPanelLayout } from "@/components/admin/two-panel-layout";
import { DataTable } from "@/components/ui/data-table";
import { HeaderCell } from "@/components/ui/data-cell";
import { cn } from "@/lib/utils";
import { Plus, X, GitBranch, Search } from "lucide-react";

const SEQUENCE_COLS = "40px minmax(180px,2fr) 96px 96px 56px 140px minmax(160px,1.5fr) 110px 200px 130px";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "completed", label: "Completed" },
];

const MODE_OPTIONS = [
  { value: "", label: "All modes" },
  { value: "auto", label: "Auto" },
  { value: "approval", label: "Approval" },
];

export function SequenceListClient() {
  const queryClient = useQueryClient();

  // Filters
  const [filters, setFilters] = useState<SequenceFilters>({});
  const [statusFilter, setStatusFilter] = useState("");
  const [modeFilter, setModeFilter] = useState("");
  const [eventFilter, setEventFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");

  // Selection + hover
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Create modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEventId, setNewEventId] = useState("");
  const [newSendMode, setNewSendMode] = useState<"auto" | "approval">("auto");

  // Data
  const { data: sequences = [], isLoading } = useSequences(filters);
  const { data: events = [] } = useEvents();

  const eventOptions = [
    { value: "", label: "All events" },
    ...events.map((e) => ({ value: e.id, label: e.name })),
  ];

  const eventModalOptions = [
    { value: "", label: "No event" },
    ...events.map((e) => ({ value: e.id, label: e.name })),
  ];

  // Apply filters when inputs change
  const applyFilters = useCallback(
    (search: string, status: string, mode: string, event: string) => {
      setFilters({
        search: search || undefined,
        status: status ? [status] : undefined,
        sendMode: mode || undefined,
        eventId: event || undefined,
      });
    },
    []
  );

  // Mutations
  const deleteMutation = useMutation({
    mutationFn: deleteSequence,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.sequences.all }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      updateSequenceStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.sequences.all }),
  });

  // Handlers
  const handleSelect = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const handleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(sequences.map((s) => s.id)) : new Set());
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selectedIds.size} sequence(s)? This cannot be undone.`)) return;
    await Promise.all([...selectedIds].map((id) => deleteMutation.mutateAsync(id)));
    setSelectedIds(new Set());
  };

  const handleBulkActivate = async () => {
    await Promise.all(
      [...selectedIds].map((id) => statusMutation.mutateAsync({ id, status: "active" }))
    );
    setSelectedIds(new Set());
  };

  const handleBulkPause = async () => {
    await Promise.all(
      [...selectedIds].map((id) => statusMutation.mutateAsync({ id, status: "paused" }))
    );
    setSelectedIds(new Set());
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const result = await createSequence({
      name: newName.trim(),
      event_id: newEventId || null,
      send_mode: newSendMode,
    });
    if (result.success) {
      setShowCreateModal(false);
      setNewName("");
      setNewEventId("");
      setNewSendMode("auto");
      queryClient.invalidateQueries({ queryKey: queryKeys.sequences.all });
    }
  };

  const hoveredSequence = hoveredId ? (sequences.find((s) => s.id === hoveredId) ?? null) : null;
  const allSelected = sequences.length > 0 && selectedIds.size === sequences.length;

  const sidebar = (
    <>
      {/* Search */}
      <GlassCard>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
          <GlassInput
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              applyFilters(e.target.value, statusFilter, modeFilter, eventFilter);
            }}
            placeholder="Search sequences..."
            className="pl-9"
          />
        </div>
      </GlassCard>

      {/* Filters */}
      <GlassCard className="space-y-3">
        <p className="text-xs text-[var(--text-muted)] uppercase tracking-wide font-medium">
          Filters
        </p>

        <div>
          <label className="block text-xs text-[var(--text-secondary)] mb-1.5">Status</label>
          <GlassSelect
            options={STATUS_OPTIONS}
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              applyFilters(searchInput, e.target.value, modeFilter, eventFilter);
            }}
          />
        </div>

        <div>
          <label className="block text-xs text-[var(--text-secondary)] mb-1.5">Mode</label>
          <GlassSelect
            options={MODE_OPTIONS}
            value={modeFilter}
            onChange={(e) => {
              setModeFilter(e.target.value);
              applyFilters(searchInput, statusFilter, e.target.value, eventFilter);
            }}
          />
        </div>

        <div>
          <label className="block text-xs text-[var(--text-secondary)] mb-1.5">Event</label>
          <GlassSelect
            options={eventOptions}
            value={eventFilter}
            onChange={(e) => {
              setEventFilter(e.target.value);
              applyFilters(searchInput, statusFilter, modeFilter, e.target.value);
            }}
          />
        </div>
      </GlassCard>

      {/* Selection summary */}
      {selectedIds.size > 0 && (
        <GlassCard className="space-y-3">
          <p className="text-sm text-white font-medium">
            {selectedIds.size} selected
          </p>
          <div className="flex flex-col gap-2">
            <button
              onClick={handleBulkActivate}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors"
            >
              Activate
            </button>
            <button
              onClick={handleBulkPause}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 transition-colors"
            >
              Pause
            </button>
            <button
              onClick={handleBulkDelete}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
            >
              Delete
            </button>
          </div>
        </GlassCard>
      )}

      {/* Sequence preview */}
      <SequencePreview sequence={hoveredSequence} />
    </>
  );

  return (
    <>
      <TwoPanelLayout
        title="Sequences"
        actions={
          <button
            onClick={() => setShowCreateModal(true)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
              "bg-[var(--accent-orange)] text-white hover:bg-[var(--accent-orange)]/90",
              "shadow-lg shadow-[var(--accent-orange)]/20"
            )}
          >
            <Plus className="h-4 w-4" />
            New Sequence
          </button>
        }
        sidebar={sidebar}
      >
        {isLoading ? (
          <GlassCard className="flex items-center justify-center py-16">
            <p className="text-[var(--text-muted)]">Loading sequences...</p>
          </GlassCard>
        ) : sequences.length === 0 ? (
          <GlassCard className="flex flex-col items-center justify-center py-16 text-center">
            <GitBranch className="h-12 w-12 text-[var(--text-muted)] mb-4" />
            <p className="text-[var(--text-secondary)] mb-1">No sequences found</p>
            <p className="text-sm text-[var(--text-muted)]">
              Sequences let you automate multi-step outreach campaigns.
            </p>
          </GlassCard>
        ) : (
          <GlassCard padding={false}>
            <DataTable
              rows={sequences}
              gridTemplate={SEQUENCE_COLS}
              estimateRowHeight={40}
              minWidth="1100px"
              scrollHeight="calc(100vh - 240px)"
              emptyMessage="No sequences found"
              header={
                <>
                  <HeaderCell>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="rounded border-[var(--glass-border)] bg-[var(--glass-bg)] accent-[var(--accent-orange)]"
                    />
                  </HeaderCell>
                  <HeaderCell>Name</HeaderCell>
                  <HeaderCell>Channel</HeaderCell>
                  <HeaderCell>Status</HeaderCell>
                  <HeaderCell>Steps</HeaderCell>
                  <HeaderCell>Enrolled</HeaderCell>
                  <HeaderCell>Delivery</HeaderCell>
                  <HeaderCell>Mode</HeaderCell>
                  <HeaderCell>Event</HeaderCell>
                  <HeaderCell>Updated</HeaderCell>
                </>
              }
              renderRow={(seq) => (
                <SequenceRow
                  sequence={seq}
                  selected={selectedIds.has(seq.id)}
                  onSelect={handleSelect}
                />
              )}
              getRowKey={(seq) => seq.id}
              onRowMouseEnter={(seq) => setHoveredId(seq.id)}
              onRowMouseLeave={() => setHoveredId(null)}
            />
          </GlassCard>
        )}
      </TwoPanelLayout>

      {/* Create Sequence Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowCreateModal(false)}
          />
          <div className="relative glass rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl">
            <div className="flex items-start justify-between mb-5">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
                  Outreach
                </p>
                <h2 className="text-xl font-semibold font-[family-name:var(--font-heading)] text-white mt-0.5">
                  New email sequence
                </h2>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-[var(--text-muted)] hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-white/90 mb-1.5">Name</label>
                <GlassInput
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. EthCC pre-event invites"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-white/90 mb-1.5">
                  Send mode
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { v: "auto", t: "Auto", h: "Send on schedule" },
                      { v: "approval", t: "Approval", h: "Review every send" },
                    ] as { v: "auto" | "approval"; t: string; h: string }[]
                  ).map((opt) => {
                    const active = newSendMode === opt.v;
                    return (
                      <button
                        key={opt.v}
                        type="button"
                        onClick={() => setNewSendMode(opt.v)}
                        className={cn(
                          "rounded-lg px-3 py-2.5 text-left border transition-all",
                          active
                            ? "bg-[var(--accent-orange)]/15 border-[var(--accent-orange)]/40"
                            : "bg-[var(--glass-bg)]/60 border-[var(--glass-border)] hover:border-[var(--glass-border-hover)]"
                        )}
                      >
                        <span
                          className={cn(
                            "text-sm font-medium",
                            active ? "text-[var(--accent-orange)]" : "text-white"
                          )}
                        >
                          {opt.t}
                        </span>
                        <span className="block text-[11px] text-[var(--text-muted)] mt-0.5">
                          {opt.h}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-white/90 mb-1.5">
                  Event <span className="text-[var(--text-muted)] font-normal">(optional)</span>
                </label>
                <GlassSelect
                  options={eventModalOptions}
                  value={newEventId}
                  onChange={(e) => setNewEventId(e.target.value)}
                  placeholder="Select an event"
                />
              </div>

              <p className="text-[11px] text-[var(--text-muted)] leading-snug pt-1 border-t border-[var(--glass-border)]/60">
                Channel is email. Bounced contacts are automatically excluded. You&apos;ll add steps, sender, and schedule on the next screen.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-3 py-1.5 rounded-lg text-sm text-[var(--text-secondary)] hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newName.trim()}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200",
                  "bg-[var(--accent-orange)] text-white hover:bg-[var(--accent-orange)]/90",
                  "shadow-lg shadow-[var(--accent-orange)]/20",
                  "disabled:opacity-50 disabled:cursor-not-allowed"
                )}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
