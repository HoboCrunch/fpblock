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
import { cn } from "@/lib/utils";
import { Plus, X, GitBranch, Search } from "lucide-react";

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

const CHANNEL_OPTIONS = [
  { value: "email", label: "Email" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "twitter", label: "Twitter" },
  { value: "telegram", label: "Telegram" },
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
  const [newChannel, setNewChannel] = useState("email");
  const [newEventId, setNewEventId] = useState("");
  const [newSendMode, setNewSendMode] = useState("auto");

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

  const handleHover = useCallback((id: string | null) => {
    setHoveredId(id);
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
      channel: newChannel,
      event_id: newEventId || null,
    });
    if (result.success) {
      setShowCreateModal(false);
      setNewName("");
      setNewChannel("email");
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--glass-border)] text-left">
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                        className="rounded border-[var(--glass-border)] bg-[var(--glass-bg)] accent-[var(--accent-orange)] cursor-pointer"
                      />
                    </th>
                    <th className="px-4 py-3 text-[var(--text-muted)] font-medium">Name</th>
                    <th className="px-4 py-3 text-[var(--text-muted)] font-medium">Channel</th>
                    <th className="px-4 py-3 text-[var(--text-muted)] font-medium">Status</th>
                    <th className="px-4 py-3 text-[var(--text-muted)] font-medium">Steps</th>
                    <th className="px-4 py-3 text-[var(--text-muted)] font-medium">Enrolled</th>
                    <th className="px-4 py-3 text-[var(--text-muted)] font-medium">Delivery</th>
                    <th className="px-4 py-3 text-[var(--text-muted)] font-medium">Mode</th>
                    <th className="px-4 py-3 text-[var(--text-muted)] font-medium">Event</th>
                    <th className="px-4 py-3 text-[var(--text-muted)] font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {sequences.map((seq) => (
                    <SequenceRow
                      key={seq.id}
                      sequence={seq}
                      selected={selectedIds.has(seq.id)}
                      onSelect={handleSelect}
                      onHover={handleHover}
                    />
                  ))}
                </tbody>
              </table>
            </div>
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
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold font-[family-name:var(--font-heading)] text-white">
                New Sequence
              </h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-[var(--text-muted)] hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1.5">Name</label>
                <GlassInput
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. EthCC LinkedIn Outreach"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1.5">Channel</label>
                <GlassSelect
                  options={CHANNEL_OPTIONS}
                  value={newChannel}
                  onChange={(e) => setNewChannel(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1.5">
                  Send Mode
                </label>
                <GlassSelect
                  options={[
                    { value: "auto", label: "Auto — send automatically" },
                    { value: "approval", label: "Approval — review before sending" },
                  ]}
                  value={newSendMode}
                  onChange={(e) => setNewSendMode(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1.5">
                  Event (optional)
                </label>
                <GlassSelect
                  options={eventModalOptions}
                  value={newEventId}
                  onChange={(e) => setNewEventId(e.target.value)}
                  placeholder="Select an event"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 rounded-lg text-sm text-[var(--text-secondary)] hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newName.trim()}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                  "bg-[var(--accent-orange)] text-white hover:bg-[var(--accent-orange)]/90",
                  "shadow-lg shadow-[var(--accent-orange)]/20",
                  "disabled:opacity-50 disabled:cursor-not-allowed"
                )}
              >
                Create Sequence
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
