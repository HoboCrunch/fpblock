"use client";

import { useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { createEvent } from "@/app/admin/events/actions";

interface EventCreateModalProps {
  initialName?: string;
  onCreated: (event: { id: string; name: string }) => void;
  onCancel: () => void;
}

const fieldLabel =
  "block text-xs font-medium text-[var(--text-secondary)] mb-1";
const plainInput =
  "w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-lg px-3 py-2 text-sm text-white transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--accent-orange)]/40 focus:border-[var(--accent-orange)]/50";

const EVENT_TYPE_SUGGESTIONS = ["conference", "hackathon", "summit", "meetup"];

export function EventCreateModal({
  initialName = "",
  onCreated,
  onCancel,
}: EventCreateModalProps) {
  const [name, setName] = useState(initialName);
  const [eventType, setEventType] = useState("");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [location, setLocation] = useState("");
  const [website, setWebsite] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0 && !pending;

  async function submit() {
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    try {
      const event = await createEvent({
        name: trimmedName,
        event_type: eventType,
        date_start: dateStart,
        date_end: dateEnd,
        location,
        website,
        notes,
      });
      onCreated(event);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create event");
      setPending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Create event"
    >
      <GlassCard className="w-full max-w-lg max-h-[85vh] overflow-y-auto">
        <h2 className="text-white font-semibold font-[family-name:var(--font-heading)] mb-2">
          New event
        </h2>
        <p className="text-sm text-[var(--text-muted)] mb-4">
          Create an event to organize imports and participations.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="space-y-4"
        >
          <div>
            <label htmlFor="event-name" className={fieldLabel}>
              Name
            </label>
            <GlassInput
              id="event-name"
              aria-label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="EthCC Cannes 2026"
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="event-type" className={fieldLabel}>
              Event type
            </label>
            <GlassInput
              id="event-type"
              aria-label="Event type"
              list="event-type-suggestions"
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              placeholder="conference"
            />
            <datalist id="event-type-suggestions">
              {EVENT_TYPE_SUGGESTIONS.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="event-date-start" className={fieldLabel}>
                Date start
              </label>
              <input
                id="event-date-start"
                type="date"
                aria-label="Date start"
                value={dateStart}
                onChange={(e) => setDateStart(e.target.value)}
                className={plainInput}
              />
            </div>
            <div>
              <label htmlFor="event-date-end" className={fieldLabel}>
                Date end
              </label>
              <input
                id="event-date-end"
                type="date"
                aria-label="Date end"
                value={dateEnd}
                onChange={(e) => setDateEnd(e.target.value)}
                className={plainInput}
              />
            </div>
          </div>

          <div>
            <label htmlFor="event-location" className={fieldLabel}>
              Location
            </label>
            <GlassInput
              id="event-location"
              aria-label="Location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Cannes, France"
            />
          </div>

          <div>
            <label htmlFor="event-website" className={fieldLabel}>
              Website
            </label>
            <GlassInput
              id="event-website"
              aria-label="Website"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://example.com"
            />
          </div>

          <div>
            <label htmlFor="event-notes" className={fieldLabel}>
              Notes
            </label>
            <textarea
              id="event-notes"
              aria-label="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className={`${plainInput} resize-none`}
            />
          </div>

          {error && (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="px-4 py-2 text-sm rounded-lg bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border border-[var(--accent-orange)]/20 hover:bg-[var(--accent-orange)]/25 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pending ? "Creating…" : "Create event"}
            </button>
          </div>
        </form>
      </GlassCard>
    </div>
  );
}
