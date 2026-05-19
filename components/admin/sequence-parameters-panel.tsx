"use client";

import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { ScheduleConfig } from "./schedule-config";
import {
  ParameterField,
  ParameterSection,
  ParameterToggle,
} from "./parameter-guide";
import type { SequenceSchedule, SenderProfile } from "@/lib/types/database";
import { cn } from "@/lib/utils";

interface Props {
  sendMode: "auto" | "approval";
  senderId: string | null;
  senderProfiles: Pick<SenderProfile, "id" | "name" | "email">[];
  scheduleConfig: SequenceSchedule;
  onSendModeChange: (mode: "auto" | "approval") => void;
  onSenderChange: (senderId: string | null) => void;
  onScheduleChange: (config: SequenceSchedule) => void;
}

const SEND_MODE_OPTIONS: { value: "auto" | "approval"; label: string; helper: string }[] = [
  {
    value: "auto",
    label: "Auto",
    helper: "Send messages on schedule with no human review.",
  },
  {
    value: "approval",
    label: "Approval",
    helper: "Queue every message for human approval before sending.",
  },
];

/**
 * Advanced settings body. Renders inside the slide-over sheet on the detail page.
 * Removed: channel (always email), daily_send_cap_global, min_interval_minutes,
 * quiet_hours_local, and exclude_bounced (always on, enforced server-side).
 */
export function SequenceParametersPanel({
  sendMode,
  senderId,
  senderProfiles,
  scheduleConfig,
  onSendModeChange,
  onSenderChange,
  onScheduleChange,
}: Props) {
  const senderOptions = [
    { value: "", label: "No sender" },
    ...senderProfiles.map((s) => ({
      value: s.id,
      label: s.name + (s.email ? ` <${s.email}>` : ""),
    })),
  ];

  function patchSchedule(patch: Partial<SequenceSchedule>) {
    onScheduleChange({ ...scheduleConfig, ...patch });
  }

  return (
    <div className="space-y-7">
      {/* DELIVERY */}
      <ParameterSection title="Delivery" description="Sender and review mode">
        <ParameterField paramKey="sender_id">
          <GlassSelect
            options={senderOptions}
            value={senderId ?? ""}
            onChange={(e) => onSenderChange(e.target.value || null)}
            placeholder="No sender"
          />
        </ParameterField>

        <ParameterField paramKey="send_mode">
          <div className="grid grid-cols-2 gap-2">
            {SEND_MODE_OPTIONS.map((opt) => {
              const active = sendMode === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onSendModeChange(opt.value)}
                  className={cn(
                    "rounded-lg p-3 text-left border transition-all duration-150",
                    active
                      ? "bg-[var(--accent-orange)]/15 border-[var(--accent-orange)]/40"
                      : "bg-[var(--glass-bg)]/60 border-[var(--glass-border)] hover:border-[var(--glass-border-hover)] hover:bg-[var(--glass-bg-hover)]"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full",
                        active
                          ? "bg-[var(--accent-orange)]"
                          : "bg-[var(--glass-border-hover)]"
                      )}
                    />
                    <span
                      className={cn(
                        "text-sm font-medium",
                        active ? "text-[var(--accent-orange)]" : "text-white"
                      )}
                    >
                      {opt.label}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)] mt-1 leading-snug">
                    {opt.helper}
                  </p>
                </button>
              );
            })}
          </div>
        </ParameterField>
      </ParameterSection>

      {/* SCHEDULE */}
      <ScheduleConfig
        value={scheduleConfig}
        onChange={onScheduleChange}
        embedded
      />

      {/* PACING */}
      <ParameterSection
        title="Pacing"
        description="Optional daily throttle"
      >
        <ParameterField paramKey="throttle_per_day">
          <div className="max-w-[180px]">
            <GlassInput
              type="number"
              min={0}
              placeholder="No limit"
              value={scheduleConfig.throttle_per_day ?? ""}
              onChange={(e) =>
                patchSchedule({
                  throttle_per_day: e.target.value
                    ? parseInt(e.target.value)
                    : undefined,
                })
              }
            />
          </div>
        </ParameterField>
      </ParameterSection>

      {/* STOP RULES */}
      <ParameterSection
        title="Stop Rules"
        description="Auto-pause enrollments on engagement"
      >
        <div className="grid sm:grid-cols-2 gap-3">
          <ParameterToggle
            paramKey="stop_on_reply"
            checked={scheduleConfig.stop_on_reply ?? false}
            onChange={(v) => patchSchedule({ stop_on_reply: v })}
          />
          <ParameterToggle
            paramKey="stop_on_click"
            checked={scheduleConfig.stop_on_click ?? false}
            onChange={(v) => patchSchedule({ stop_on_click: v })}
          />
        </div>
      </ParameterSection>

      {/* AUDIENCE FILTERS */}
      <ParameterSection
        title="Audience"
        description="Cross-sequence overlap guard"
      >
        <div className="grid sm:grid-cols-2 gap-3">
          <ParameterToggle
            paramKey="exclude_already_enrolled"
            checked={scheduleConfig.exclude_already_enrolled ?? false}
            onChange={(v) => patchSchedule({ exclude_already_enrolled: v })}
          />
        </div>
        <p className="text-[11px] text-[var(--text-muted)] leading-snug mt-1">
          Bounced contacts are always excluded.
        </p>
      </ParameterSection>
    </div>
  );
}
