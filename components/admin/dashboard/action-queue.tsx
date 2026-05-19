import Link from "next/link";
import {
  FileText,
  Clock,
  AlertTriangle,
  Inbox,
  GitMerge,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface ActionQueueCounts {
  drafts_pending: number;
  scheduled_today: number;
  failures: number;
  unread_inbox: number;
  replies_24h: number;
  pending_correlations: number;
}

interface Props {
  counts: ActionQueueCounts;
}

interface Item {
  key: string;
  label: string;
  count: number;
  hint?: string;
  href: string;
  icon: LucideIcon;
  /** Show only if count > 0? Defaults true. */
  showEmpty?: boolean;
  tone: "neutral" | "warn" | "danger" | "info";
}

const TONE: Record<Item["tone"], { icon: string; ring: string; bg: string }> = {
  neutral: {
    icon: "text-white/50",
    ring: "ring-white/[0.06]",
    bg: "bg-white/[0.02]",
  },
  warn: {
    icon: "text-yellow-400",
    ring: "ring-yellow-500/20",
    bg: "bg-yellow-500/[0.04]",
  },
  danger: {
    icon: "text-rose-400",
    ring: "ring-rose-500/25",
    bg: "bg-rose-500/[0.04]",
  },
  info: {
    icon: "text-[var(--accent-indigo)]",
    ring: "ring-[var(--accent-indigo)]/25",
    bg: "bg-[var(--accent-indigo)]/[0.04]",
  },
};

export function ActionQueue({ counts }: Props) {
  const items: Item[] = [
    {
      key: "unread",
      label: "Unread inbox",
      count: counts.unread_inbox,
      hint:
        counts.replies_24h > 0
          ? `${counts.replies_24h} new in last 24h`
          : undefined,
      href: "/admin/inbox",
      icon: Inbox,
      tone: counts.unread_inbox > 0 ? "info" : "neutral",
    },
    {
      key: "drafts",
      label: "Drafts to review",
      count: counts.drafts_pending,
      hint:
        counts.scheduled_today > 0
          ? `${counts.scheduled_today} scheduled today`
          : undefined,
      href: "/admin/pipeline?stage=draft",
      icon: FileText,
      tone: counts.drafts_pending > 0 ? "warn" : "neutral",
    },
    {
      key: "failures",
      label: "Failures (30d)",
      count: counts.failures,
      href: "/admin/sequences/failures",
      icon: AlertTriangle,
      tone: counts.failures > 0 ? "danger" : "neutral",
    },
    {
      key: "scheduled",
      label: "Scheduled today",
      count: counts.scheduled_today,
      href: "/admin/pipeline?stage=scheduled",
      icon: Clock,
      tone: counts.scheduled_today > 0 ? "info" : "neutral",
    },
    {
      key: "correlations",
      label: "Correlations pending",
      count: counts.pending_correlations,
      href: "/admin/correlations",
      icon: GitMerge,
      tone: counts.pending_correlations > 0 ? "warn" : "neutral",
    },
  ];

  const totalActions =
    counts.drafts_pending +
    counts.failures +
    counts.unread_inbox +
    counts.pending_correlations;

  return (
    <section className="glass rounded-xl p-6 h-full flex flex-col">
      <header className="flex items-baseline justify-between mb-4">
        <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-white">
          Needs attention
        </h2>
        <span className="text-xs text-white/40 tabular-nums">
          {totalActions === 0 ? "All clear" : `${totalActions} open`}
        </span>
      </header>

      <ul className="flex-1 space-y-1.5">
        {items.map((item) => {
          const tone = TONE[item.tone];
          const Icon = item.icon;
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2.5",
                  "ring-1 transition-all duration-200",
                  tone.bg,
                  tone.ring,
                  "hover:bg-white/[0.06] hover:ring-white/[0.12]",
                )}
              >
                <Icon className={cn("h-4 w-4 shrink-0", tone.icon)} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white/80 truncate">{item.label}</p>
                  {item.hint && (
                    <p className="text-[11px] text-white/40 truncate">{item.hint}</p>
                  )}
                </div>
                <span
                  className={cn(
                    "font-[family-name:var(--font-heading)] text-base font-semibold tabular-nums tabular",
                    item.count > 0 ? "text-white" : "text-white/30",
                  )}
                >
                  {item.count.toLocaleString()}
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-white/20 group-hover:text-white/60 transition-colors" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
