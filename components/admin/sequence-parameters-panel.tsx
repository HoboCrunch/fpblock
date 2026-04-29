"use client";

import { useState } from "react";
import { ChevronDown, Settings2 } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { Badge } from "@/components/ui/badge";
import { ScheduleConfig } from "./schedule-config";
import {
  ParameterField,
  ParameterSection,
  ParameterToggle,
} from "./parameter-guide";
import type { SequenceSchedule, SenderProfile } from "@/lib/types/database";
import { cn } from "@/lib/utils";

interface Props {
  channel: string;
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
 * Centralized panel where every sequence-level parameter lives.
 * Groups: Delivery, Schedule, Throttle & Pacing, Stop Rules, Audience Filters.
 */
export function SequenceParametersPanel({
  channel,
  sendMode,
  senderId,
  senderProfiles,
  scheduleConfig,
  onSendModeChange,
  onSenderChange,
  onScheduleChange,
}: Props) {
  const [open, setOpen] = useState(true);

  const senderOptions = [
    { value: "", label: "No sender" },
    ...senderProfiles.map((s) => ({
      value: s.id,
      label: s.name + (s.email ? ` <${s.email}>` : ""),
    })),
  ];

  // Throttle helpers — read/write through schedule_config JSONB
  function patchSchedule(patch: Partial<SequenceSchedule>) {
    onScheduleChange({ ...scheduleConfig, ...patch });
  }

  const quietHours = scheduleConfig.quiet_hours_local;

  return (
    <GlassCard padding={false}>
      {/* Panel header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-white/[0.02] transition-colors rounded-xl"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-[var(--accent-orange)]/15 border border-[var(--accent-orange)]/25 flex items-center justify-center">
            <Settings2 className="h-4 w-4 text-[var(--accent-orange)]" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Parameters</h3>
            <p className="text-[11px] text-[var(--text-muted)] leading-tight">
              Delivery, schedule, throttling, and audience rules for this sequence.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-[var(--text-muted)]">
          <span className="hidden sm:inline">
            {scheduleConfig.timing_mode} · {sendMode}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform",
              open && "rotate-180"
            )}
          />
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 pt-1 space-y-6 border-t border-[var(--glass-border)]">
          {/* DELIVERY */}
          <ParameterSection
            title="Delivery"
            description="Channel, sender, and review mode"
          >
            <div className="grid sm:grid-cols-2 gap-4">
              {/* Channel — read-only */}
              <ParameterField paramKey="channel">
                <div className="flex items-center h-[38px] px-3 rounded-lg bg-[var(--glass-bg)]/60 border border-[var(--glass-border)]">
                  <Badge variant="glass-indigo">{channel}</Badge>
                  <span className="ml-2 text-[11px] text-[var(--text-muted)]">
                    fixed for this sequence
                  </span>
                </div>
              </ParameterField>

              {/* Sender */}
              <ParameterField paramKey="sender_id">
                <GlassSelect
                  options={senderOptions}
                  value={senderId ?? ""}
                  onChange={(e) => onSenderChange(e.target.value || null)}
                  placeholder="No sender"
                />
              </ParameterField>
            </div>

            {/* Send mode — tile picker */}
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

          {/* SCHEDULE — embedded */}
          <ScheduleConfig
            value={scheduleConfig}
            onChange={onScheduleChange}
            embedded
          />

          {/* THROTTLE & PACING */}
          <ParameterSection
            title="Throttle & Pacing"
            description="Volume controls — declared, not yet enforced"
          >
            <div className="grid sm:grid-cols-2 gap-4">
              <ParameterField paramKey="throttle_per_day">
                <GlassInput
                  type="number"
                  min={0}
                  placeholder="e.g. 100"
                  value={scheduleConfig.throttle_per_day ?? ""}
                  onChange={(e) =>
                    patchSchedule({
                      throttle_per_day: e.target.value
                        ? parseInt(e.target.value)
                        : undefined,
                    })
                  }
                />
              </ParameterField>

              <ParameterField paramKey="min_interval_minutes">
                <GlassInput
                  type="number"
                  min={0}
                  placeholder="e.g. 1440"
                  value={scheduleConfig.min_interval_minutes ?? ""}
                  onChange={(e) =>
                    patchSchedule({
                      min_interval_minutes: e.target.value
                        ? parseInt(e.target.value)
                        : undefined,
                    })
                  }
                />
              </ParameterField>

              <ParameterField paramKey="daily_send_cap_global">
                <GlassInput
                  type="number"
                  min={0}
                  placeholder="e.g. 200"
                  value={scheduleConfig.daily_send_cap_global ?? ""}
                  onChange={(e) =>
                    patchSchedule({
                      daily_send_cap_global: e.target.value
                        ? parseInt(e.target.value)
                        : undefined,
                    })
                  }
                />
              </ParameterField>

              <ParameterField paramKey="quiet_hours_local">
                <div className="grid grid-cols-2 gap-2">
                  <GlassInput
                    type="number"
                    min={0}
                    max={23}
                    placeholder="Start (22)"
                    value={quietHours?.start ?? ""}
                    onChange={(e) =>
                      patchSchedule({
                        quiet_hours_local: e.target.value
                          ? {
                              start: parseInt(e.target.value) || 0,
                              end: quietHours?.end ?? 7,
                            }
                          : undefined,
                      })
                    }
                  />
                  <GlassInput
                    type="number"
                    min={0}
                    max={23}
                    placeholder="End (7)"
                    value={quietHours?.end ?? ""}
                    onChange={(e) =>
                      patchSchedule({
                        quiet_hours_local: e.target.value
                          ? {
                              start: quietHours?.start ?? 22,
                              end: parseInt(e.target.value) || 0,
                            }
                          : undefined,
                      })
                    }
                  />
                </div>
              </ParameterField>
            </div>
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
            title="Audience Filters"
            description="Who is excluded from enrollment"
          >
            <div className="grid sm:grid-cols-2 gap-3">
              <ParameterToggle
                paramKey="exclude_bounced"
                checked={scheduleConfig.exclude_bounced ?? false}
                onChange={(v) => patchSchedule({ exclude_bounced: v })}
              />
              <ParameterToggle
                paramKey="exclude_already_enrolled"
                checked={scheduleConfig.exclude_already_enrolled ?? false}
                onChange={(v) => patchSchedule({ exclude_already_enrolled: v })}
              />
            </div>
          </ParameterSection>
        </div>
      )}
    </GlassCard>
  );
}
