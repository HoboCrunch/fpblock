"use client";

import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { cn } from "@/lib/utils";
import type { SequenceSchedule } from "@/lib/types/database";

const TIMING_MODE_OPTIONS = [
  { value: "relative", label: "Relative — send N days after enrollment" },
  { value: "window", label: "Window — send within allowed hours/days" },
  { value: "anchor", label: "Anchor — relative to a fixed date" },
];

const TIMEZONE_OPTIONS = [
  { value: "Europe/Paris", label: "Europe/Paris (CET/CEST)" },
  { value: "America/New_York", label: "America/New_York (ET)" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles (PT)" },
  { value: "America/Chicago", label: "America/Chicago (CT)" },
  { value: "UTC", label: "UTC" },
  { value: "Asia/Singapore", label: "Asia/Singapore (SGT)" },
  { value: "Asia/Dubai", label: "Asia/Dubai (GST)" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo (JST)" },
];

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type Day = typeof DAYS[number];

const DAY_LABELS: Record<Day, string> = {
  mon: "Mo", tue: "Tu", wed: "We", thu: "Th", fri: "Fr", sat: "Sa", sun: "Su",
};

const ANCHOR_DIRECTION_OPTIONS = [
  { value: "before", label: "Before anchor date" },
  { value: "after", label: "After anchor date" },
];

interface ScheduleConfigProps {
  value: SequenceSchedule;
  onChange: (config: SequenceSchedule) => void;
}

export function ScheduleConfig({ value, onChange }: ScheduleConfigProps) {
  const mode = value.timing_mode;
  const window = value.send_window;

  function setMode(newMode: SequenceSchedule["timing_mode"]) {
    onChange({ ...value, timing_mode: newMode });
  }

  function toggleDay(day: Day) {
    const current = window?.days ?? [];
    const next = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day];
    onChange({
      ...value,
      send_window: {
        days: next,
        start_hour: window?.start_hour ?? 9,
        end_hour: window?.end_hour ?? 17,
        timezone: window?.timezone ?? "UTC",
      },
    });
  }

  function setWindowField(field: "start_hour" | "end_hour", num: number) {
    onChange({
      ...value,
      send_window: {
        days: window?.days ?? ["mon", "tue", "wed", "thu", "fri"],
        start_hour: window?.start_hour ?? 9,
        end_hour: window?.end_hour ?? 17,
        timezone: window?.timezone ?? "UTC",
        ...window,
        [field]: num,
      },
    });
  }

  function setTimezone(tz: string) {
    onChange({
      ...value,
      send_window: {
        days: window?.days ?? ["mon", "tue", "wed", "thu", "fri"],
        start_hour: window?.start_hour ?? 9,
        end_hour: window?.end_hour ?? 17,
        timezone: tz,
        ...window,
      },
    });
  }

  return (
    <GlassCard>
      <h3 className="text-sm font-semibold text-white mb-4">Schedule Configuration</h3>

      <div className="space-y-4">
        {/* Timing mode */}
        <div>
          <label className="text-xs text-[var(--text-muted)] mb-1 block">Timing Mode</label>
          <GlassSelect
            options={TIMING_MODE_OPTIONS}
            value={mode}
            onChange={(e) => setMode(e.target.value as SequenceSchedule["timing_mode"])}
          />
        </div>

        {/* Window controls — shown for 'window' and 'anchor' */}
        {(mode === "window" || mode === "anchor") && (
          <>
            {/* Day toggles */}
            <div>
              <label className="text-xs text-[var(--text-muted)] mb-2 block">Allowed Days</label>
              <div className="flex gap-1">
                {DAYS.map((day) => {
                  const active = window?.days?.includes(day) ?? false;
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(day)}
                      className={cn(
                        "w-8 h-8 rounded text-xs font-medium transition-all duration-150",
                        active
                          ? "bg-[var(--accent-orange)]/20 text-[var(--accent-orange)] border border-[var(--accent-orange)]/40"
                          : "bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-muted)] hover:text-white"
                      )}
                    >
                      {DAY_LABELS[day]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Hour range */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[var(--text-muted)] mb-1 block">Start Hour (0–23)</label>
                <GlassInput
                  type="number"
                  min={0}
                  max={23}
                  value={window?.start_hour ?? 9}
                  onChange={(e) => setWindowField("start_hour", parseInt(e.target.value) || 0)}
                />
              </div>
              <div>
                <label className="text-xs text-[var(--text-muted)] mb-1 block">End Hour (0–23)</label>
                <GlassInput
                  type="number"
                  min={0}
                  max={23}
                  value={window?.end_hour ?? 17}
                  onChange={(e) => setWindowField("end_hour", parseInt(e.target.value) || 0)}
                />
              </div>
            </div>

            {/* Timezone */}
            <div>
              <label className="text-xs text-[var(--text-muted)] mb-1 block">Timezone</label>
              <GlassSelect
                options={TIMEZONE_OPTIONS}
                value={window?.timezone ?? "UTC"}
                onChange={(e) => setTimezone(e.target.value)}
              />
            </div>
          </>
        )}

        {/* Anchor-specific controls */}
        {mode === "anchor" && (
          <>
            <div>
              <label className="text-xs text-[var(--text-muted)] mb-1 block">Anchor Date</label>
              <GlassInput
                type="date"
                value={value.anchor_date ?? ""}
                onChange={(e) => onChange({ ...value, anchor_date: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)] mb-1 block">Direction</label>
              <GlassSelect
                options={ANCHOR_DIRECTION_OPTIONS}
                value={value.anchor_direction ?? "before"}
                onChange={(e) =>
                  onChange({ ...value, anchor_direction: e.target.value as "before" | "after" })
                }
              />
            </div>
          </>
        )}

        {mode === "relative" && (
          <p className="text-xs text-[var(--text-muted)]">
            Messages send N days after enrollment with no time-of-day restriction.
          </p>
        )}
      </div>
    </GlassCard>
  );
}
