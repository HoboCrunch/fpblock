"use client";

import { useEffect, useRef, useState } from "react";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Metadata for every sequence parameter the UI surfaces.
 * Used by ParameterField to render labels, helper text, and info popovers.
 */
export interface ParameterMeta {
  label: string;
  description: string;
  example?: string;
  whenToUse?: string;
  tips?: string[];
  preview?: boolean; // not yet enforced by backend
}

export const PARAMETER_GUIDE: Record<string, ParameterMeta> = {
  channel: {
    label: "Channel",
    description: "Delivery channel for every step in this sequence.",
    whenToUse:
      "Pick a channel before you build steps — message templates and senders are channel-specific.",
    example: "email for cold outreach, linkedin for warm intros.",
    tips: [
      "Channel cannot be mixed within a single sequence — clone the sequence to reuse copy on a different channel.",
    ],
  },
  sender_id: {
    label: "Sender",
    description: "The Sender Profile messages are sent from.",
    whenToUse:
      "Required before activating. Switch senders to A/B test deliverability or rotate identities.",
    tips: [
      "Sender tone notes (managed in Settings) feed into AI-generated blocks automatically.",
    ],
  },
  send_mode: {
    label: "Send Mode",
    description:
      "Auto sends messages on schedule. Approval queues every message for human review before sending.",
    whenToUse:
      "Use Approval for first runs of a new template, or anything high-stakes. Switch to Auto once you trust the output.",
    tips: [
      "Switching from Approval to Auto only affects future generations, not the existing approval queue.",
    ],
  },
  timing_mode: {
    label: "Timing Mode",
    description:
      "How step delays are interpreted. Relative = N days after enrollment. Window = restrict to allowed days/hours. Anchor = relative to a fixed event date.",
    whenToUse:
      "Use Anchor for event-driven outreach (e.g. send 14 days before EthCC). Use Window to respect business hours.",
    example: "EthCC outreach uses Anchor with anchor_date set to the event start.",
  },
  send_window_days: {
    label: "Allowed Days",
    description: "Days of the week messages are eligible to send.",
    whenToUse: "Skip weekends for B2B, or restrict to weekdays in target timezone.",
  },
  send_window_hours: {
    label: "Send Hours",
    description: "Local-time start and end hours (0–23) within which messages may send.",
    whenToUse: "Weekday business hours (9–17) is a sane default for B2B email.",
    tips: [
      "End hour must be greater than start hour.",
      "Hours are interpreted in the timezone configured below.",
    ],
  },
  send_window_timezone: {
    label: "Timezone",
    description: "Timezone send hours and quiet hours are evaluated in.",
    whenToUse:
      "Pick the timezone of your audience, not your team — Europe/Paris for EthCC attendees.",
  },
  anchor_date: {
    label: "Anchor Date",
    description:
      "Fixed date that step delays count from (instead of enrollment date).",
    whenToUse:
      "Event-based outreach: set this to your event start date so step 1 lands N days before.",
    example: "Anchor 2026-07-01 + step delay -7 = send 2026-06-24.",
  },
  anchor_direction: {
    label: "Direction",
    description:
      "Whether step delays apply before or after the anchor date.",
    whenToUse: "Use 'before' for pre-event campaigns, 'after' for post-event follow-ups.",
  },
  throttle_per_day: {
    label: "Throttle (per day)",
    description:
      "Maximum number of messages this sequence is allowed to send in a 24-hour period across all enrollments.",
    whenToUse:
      "Protect sender reputation — start small (50/day) on new domains and ramp up.",
    example: "Set to 100 to limit a sequence with 500 enrolled to a 5-day burn-in.",
  },
  min_interval_minutes: {
    label: "Min interval between sends (minutes)",
    description:
      "Minimum gap between two messages going to the same person, regardless of step delay.",
    whenToUse:
      "Insurance against accidentally double-sending if step timings overlap.",
    example: "1440 = at least 24 hours between any two messages to the same person.",
  },
  daily_send_cap_global: {
    label: "Daily Send Cap (global)",
    description:
      "Hard ceiling on total sends per day for this sequence. Stops sends entirely once hit.",
    whenToUse:
      "Use alongside throttle for belt-and-suspenders protection on warmup days.",
  },
  quiet_hours_local: {
    label: "Quiet Hours (local)",
    description:
      "Local-time window during which sends are suppressed even if otherwise allowed by the schedule window.",
    whenToUse:
      "Suppress overnight delivery to avoid landing in spam filters or annoying recipients.",
    example: "22:00 → 07:00 in the recipient's timezone.",
  },
  stop_on_reply: {
    label: "Stop on reply",
    description:
      "When a person replies, automatically pause their enrollment so no more steps fire.",
    whenToUse:
      "Almost always on — keeps you from emailing someone after they've engaged.",
  },
  stop_on_click: {
    label: "Stop on click",
    description:
      "When a person clicks a tracked link, automatically pause their enrollment.",
    whenToUse:
      "Use for nurture flows where a click means they've taken the desired action.",
  },
  exclude_bounced: {
    label: "Exclude bounced",
    description:
      "Skip enrollment for any person whose email has previously bounced.",
    whenToUse:
      "Always on for cold email — protects sender reputation from repeated hard bounces.",
  },
  exclude_already_enrolled: {
    label: "Exclude already enrolled",
    description:
      "Skip enrollment for any person currently active in another sequence.",
    whenToUse:
      "Prevents the same person from receiving overlapping campaigns.",
  },
};

/**
 * Small accessible info popover triggered by an info icon.
 * No external dep — closes on outside click and Escape.
 */
export function ParameterInfo({ meta }: { meta: ParameterMeta }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        aria-label={`More info: ${meta.label}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="text-[var(--text-muted)] hover:text-white transition-colors"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div
          role="dialog"
          className="absolute left-5 top-0 z-50 w-72 rounded-xl border border-[var(--glass-border-hover)] bg-[#1a1a1d] p-3.5 shadow-2xl shadow-black/60 text-xs space-y-2"
        >
          <p className="text-white font-semibold text-[13px] leading-tight">
            {meta.label}
          </p>
          <p className="text-[var(--text-muted)] leading-relaxed">{meta.description}</p>
          {meta.whenToUse && (
            <div>
              <p className="text-white/70 font-medium uppercase tracking-wide text-[10px] mb-0.5">
                When to use
              </p>
              <p className="text-[var(--text-muted)] leading-relaxed">
                {meta.whenToUse}
              </p>
            </div>
          )}
          {meta.example && (
            <div>
              <p className="text-white/70 font-medium uppercase tracking-wide text-[10px] mb-0.5">
                Example
              </p>
              <p className="text-[var(--text-muted)] leading-relaxed font-mono">
                {meta.example}
              </p>
            </div>
          )}
          {meta.tips && meta.tips.length > 0 && (
            <div>
              <p className="text-white/70 font-medium uppercase tracking-wide text-[10px] mb-0.5">
                Tips
              </p>
              <ul className="text-[var(--text-muted)] leading-relaxed list-disc list-inside space-y-0.5">
                {meta.tips.map((tip, i) => (
                  <li key={i}>{tip}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Wraps a label + control + helper line + info popover.
 * Pass either a parameter key (looks up PARAMETER_GUIDE) or an inline meta object.
 */
interface ParameterFieldProps {
  paramKey?: keyof typeof PARAMETER_GUIDE;
  meta?: ParameterMeta;
  /** Override the label rendered (defaults to meta.label) */
  labelOverride?: string;
  /** Optional warning text shown in red below the helper */
  warning?: string | null;
  className?: string;
  children: React.ReactNode;
}

export function ParameterField({
  paramKey,
  meta: metaProp,
  labelOverride,
  warning,
  className,
  children,
}: ParameterFieldProps) {
  const meta = metaProp ?? (paramKey ? PARAMETER_GUIDE[paramKey] : undefined);
  if (!meta) {
    // Fail soft — just render children if no meta
    return <div className={className}>{children}</div>;
  }
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center gap-1.5">
        <label className="text-xs font-medium text-white/90">
          {labelOverride ?? meta.label}
        </label>
        <ParameterInfo meta={meta} />
        {meta.preview && (
          <span className="ml-1 inline-flex items-center px-1.5 py-px rounded text-[9px] font-medium uppercase tracking-wide bg-[var(--accent-indigo)]/15 text-[var(--accent-indigo)] border border-[var(--accent-indigo)]/25">
            Preview
          </span>
        )}
      </div>
      {children}
      <p className="text-[11px] text-[var(--text-muted)] leading-snug">
        {meta.description}
      </p>
      {warning && (
        <p className="text-[11px] text-amber-400/90 leading-snug">{warning}</p>
      )}
    </div>
  );
}

/**
 * Lightweight checkbox-style toggle that fits the parameter-field pattern.
 */
export function ParameterToggle({
  paramKey,
  meta: metaProp,
  checked,
  onChange,
}: {
  paramKey?: keyof typeof PARAMETER_GUIDE;
  meta?: ParameterMeta;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  const meta = metaProp ?? (paramKey ? PARAMETER_GUIDE[paramKey] : undefined);
  if (!meta) return null;
  return (
    <label className="flex items-start gap-3 p-3 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)]/60 hover:bg-[var(--glass-bg-hover)] hover:border-[var(--glass-border-hover)] transition-colors cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-[var(--glass-border-hover)] bg-transparent accent-[var(--accent-orange)]"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-white">{meta.label}</span>
          <ParameterInfo meta={meta} />
          {meta.preview && (
            <span className="ml-1 inline-flex items-center px-1.5 py-px rounded text-[9px] font-medium uppercase tracking-wide bg-[var(--accent-indigo)]/15 text-[var(--accent-indigo)] border border-[var(--accent-indigo)]/25">
              Preview
            </span>
          )}
        </div>
        <p className="text-[11px] text-[var(--text-muted)] leading-snug mt-0.5">
          {meta.description}
        </p>
      </div>
    </label>
  );
}

/**
 * Section heading used inside the parameters panel.
 */
export function ParameterSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3 border-b border-[var(--glass-border)] pb-2">
        <h4 className="text-sm font-semibold text-white">{title}</h4>
        {description && (
          <p className="text-[11px] text-[var(--text-muted)] text-right">
            {description}
          </p>
        )}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
