"use client";

import { useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassSelect } from "@/components/ui/glass-select";
import type { EventDecision } from "@/app/admin/uploads/actions";

interface RowState {
  mode: "create" | "map" | "skip";
  eventId: string;
  dateStart: string;
}

interface EventDetectModalProps {
  unknownEvents: string[];
  existingEvents: { id: string; name: string }[];
  onConfirm: (decisions: EventDecision[]) => void;
  onCancel: () => void;
}

export function EventDetectModal({
  unknownEvents,
  existingEvents,
  onConfirm,
  onCancel,
}: EventDetectModalProps) {
  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(
      unknownEvents.map((name) => [
        name,
        { mode: "create", eventId: "", dateStart: "" } as RowState,
      ]),
    ),
  );

  function setRow(name: string, patch: Partial<RowState>) {
    setRows((prev) => ({ ...prev, [name]: { ...prev[name], ...patch } }));
  }

  function confirm() {
    const decisions: EventDecision[] = unknownEvents.map((name) => {
      const r = rows[name];
      if (r.mode === "skip") return { name, mode: "skip" };
      if (r.mode === "map") return { name, mode: "map", eventId: r.eventId };
      return { name, mode: "create", date_start: r.dateStart };
    });
    onConfirm(decisions);
  }

  const eventOptions = [
    { value: "", label: "— Select an event —" },
    ...existingEvents.map((e) => ({ value: e.id, label: e.name })),
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Unknown events"
    >
      <GlassCard className="w-full max-w-2xl max-h-[80vh] overflow-y-auto">
        <h2 className="text-white font-semibold font-[family-name:var(--font-heading)] mb-2">
          New events detected
        </h2>
        <p className="text-sm text-[var(--text-muted)] mb-4">
          These event names aren&apos;t in the database yet. Choose what to do
          with each.
        </p>
        <div className="space-y-4">
          {unknownEvents.map((name) => {
            const r = rows[name];
            return (
              <div
                key={name}
                className="border border-[var(--glass-border)] rounded-lg p-3"
              >
                <div className="text-white font-medium mb-2">{name}</div>
                <div className="space-y-2 text-sm">
                  {/* Create row */}
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`mode-${name}`}
                        checked={r.mode === "create"}
                        onChange={() => setRow(name, { mode: "create" })}
                      />
                      <span>Create event</span>
                    </label>
                    <input
                      type="date"
                      aria-label={`Date start for ${name}`}
                      value={r.dateStart}
                      disabled={r.mode !== "create"}
                      onChange={(e) =>
                        setRow(name, { dateStart: e.target.value })
                      }
                      className="bg-transparent border border-[var(--glass-border)] rounded px-2 py-1 text-sm disabled:opacity-50"
                    />
                  </div>

                  {/* Map row */}
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`mode-${name}`}
                        checked={r.mode === "map"}
                        onChange={() => setRow(name, { mode: "map" })}
                      />
                      <span>Map to existing</span>
                    </label>
                    <div className="flex-1">
                      <GlassSelect
                        aria-label={`Existing event for ${name}`}
                        options={eventOptions}
                        value={r.eventId}
                        onChange={(e) =>
                          setRow(name, { eventId: e.target.value })
                        }
                        disabled={r.mode !== "map"}
                      />
                    </div>
                  </div>

                  {/* Skip row */}
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`mode-${name}`}
                      checked={r.mode === "skip"}
                      onChange={() => setRow(name, { mode: "skip" })}
                    />
                    <span>Skip (leave event blank for these rows)</span>
                  </label>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            className="px-4 py-2 text-sm rounded-lg bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border border-[var(--accent-orange)]/20 hover:bg-[var(--accent-orange)]/25"
          >
            Confirm and import
          </button>
        </div>
      </GlassCard>
    </div>
  );
}
