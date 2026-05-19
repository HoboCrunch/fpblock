"use client";

import { GlassCard } from "@/components/ui/glass-card";
import { cn } from "@/lib/utils";
import { Settings2, Mail, User2 } from "lucide-react";
import type { SequenceSchedule, SenderProfile } from "@/lib/types/database";

const TIMING_LABELS: Record<NonNullable<SequenceSchedule["timing_mode"]>, string> = {
  relative: "Relative",
  window: "Send window",
  anchor: "Anchored",
};

interface Props {
  sendMode: "auto" | "approval";
  senderId: string | null;
  senderProfiles: Pick<SenderProfile, "id" | "name" | "email">[];
  scheduleConfig: SequenceSchedule;
  onSendModeChange: (mode: "auto" | "approval") => void;
  onOpenAdvanced: () => void;
}

/**
 * Compact at-a-glance config card for the sidebar.
 * Editing of sender/schedule details happens inside the slide-over sheet.
 */
export function SequenceConfigCard({
  sendMode,
  senderId,
  senderProfiles,
  scheduleConfig,
  onSendModeChange,
  onOpenAdvanced,
}: Props) {
  const sender = senderProfiles.find((s) => s.id === senderId);
  const timing = TIMING_LABELS[scheduleConfig.timing_mode] ?? "Relative";

  const scheduleDetail = (() => {
    if (scheduleConfig.timing_mode === "anchor" && scheduleConfig.anchor_date) {
      return `${scheduleConfig.anchor_direction ?? "before"} ${scheduleConfig.anchor_date}`;
    }
    if (scheduleConfig.send_window) {
      const w = scheduleConfig.send_window;
      return `${w.days.length}d · ${w.start_hour}–${w.end_hour}`;
    }
    return "no time-of-day restriction";
  })();

  const stops: string[] = [];
  if (scheduleConfig.stop_on_reply) stops.push("reply");
  if (scheduleConfig.stop_on_click) stops.push("click");

  return (
    <GlassCard padding={false}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--glass-border)]">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-orange)]" />
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/85">
            Configuration
          </h3>
        </div>
        <button
          onClick={onOpenAdvanced}
          className="flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-white transition-colors"
        >
          <Settings2 className="h-3.5 w-3.5" />
          Edit
        </button>
      </div>

      {/* SENDER */}
      <div className="px-4 py-3 border-b border-[var(--glass-border)]/60">
        <div className="flex items-center gap-2 mb-1">
          <User2 className="h-3 w-3 text-[var(--text-muted)]" />
          <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
            Sender
          </span>
        </div>
        {sender ? (
          <div>
            <p className="text-sm text-white truncate">{sender.name}</p>
            {sender.email && (
              <p className="text-[11px] text-[var(--text-muted)] truncate">
                {sender.email}
              </p>
            )}
          </div>
        ) : (
          <button
            onClick={onOpenAdvanced}
            className="text-xs text-[var(--accent-orange)] hover:underline"
          >
            Select sender →
          </button>
        )}
      </div>

      {/* SEND MODE — segmented control (inline edit, no sheet needed) */}
      <div className="px-4 py-3 border-b border-[var(--glass-border)]/60">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
            Mode
          </span>
          <span className="text-[10px] text-[var(--text-muted)]/70">
            {sendMode === "auto" ? "Sends automatically" : "Queues for review"}
          </span>
        </div>
        <div className="relative grid grid-cols-2 rounded-md bg-[var(--glass-bg)]/60 border border-[var(--glass-border)] p-0.5">
          {(["auto", "approval"] as const).map((m) => {
            const active = sendMode === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => onSendModeChange(m)}
                className={cn(
                  "text-xs py-1.5 rounded transition-all capitalize",
                  active
                    ? "bg-[var(--accent-orange)]/20 text-[var(--accent-orange)]"
                    : "text-[var(--text-muted)] hover:text-white"
                )}
              >
                {m}
              </button>
            );
          })}
        </div>
      </div>

      {/* SCHEDULE summary */}
      <div className="px-4 py-3 border-b border-[var(--glass-border)]/60">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
            Schedule
          </span>
          <span className="text-[10px] text-white/80">{timing}</span>
        </div>
        <p className="text-[11px] text-[var(--text-muted)] truncate">
          {scheduleDetail}
        </p>
      </div>

      {/* STOP rules / channel */}
      <div className="flex items-center justify-between px-4 py-3 text-[11px]">
        <span className="inline-flex items-center gap-1 text-[var(--text-muted)]">
          <Mail className="h-3 w-3" /> Email
        </span>
        <span className="text-[var(--text-muted)]">
          {stops.length === 0 ? "No stop rules" : `Stop on ${stops.join(" + ")}`}
        </span>
      </div>
    </GlassCard>
  );
}
