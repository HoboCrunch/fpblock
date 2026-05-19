import Link from "next/link";
import { cn } from "@/lib/utils";
import { Mail, Linkedin, Twitter, MessageSquare, type LucideIcon } from "lucide-react";

export interface SequenceRow {
  sequence_id: string;
  name: string;
  status: string;
  channel: string;
  enrolled: number;
  sent: number;
  opened: number;
  replied: number;
  bounced: number;
}

const CHANNEL_ICON: Record<string, LucideIcon> = {
  email: Mail,
  linkedin: Linkedin,
  twitter: Twitter,
};

interface Props {
  sequences: SequenceRow[];
}

export function SequencePerformance({ sequences }: Props) {
  const top = sequences.slice(0, 6);

  return (
    <section className="glass rounded-xl p-6 h-full flex flex-col">
      <header className="flex items-baseline justify-between mb-4">
        <div>
          <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-white">
            Sequence performance
          </h2>
          <p className="text-xs text-white/40 mt-0.5">
            {sequences.length} active / paused
          </p>
        </div>
        <Link
          href="/admin/sequences"
          className="text-xs text-white/50 hover:text-white transition-colors"
        >
          All sequences →
        </Link>
      </header>

      {top.length === 0 ? (
        <p className="text-sm text-white/40 py-8 text-center">
          No active sequences.
        </p>
      ) : (
        <div className="flex-1 -mx-2">
          <div className="grid grid-cols-[1fr_64px_64px_72px_56px] gap-x-3 px-2 py-1.5 text-[10px] uppercase tracking-wider text-white/30 font-medium">
            <span>Sequence</span>
            <span className="text-right">Sent</span>
            <span className="text-right">Opened</span>
            <span className="text-right">Replied</span>
            <span className="text-right">Rate</span>
          </div>
          <div className="space-y-1">
            {top.map((s) => {
              const replyRate = s.sent > 0 ? (s.replied / s.sent) * 100 : 0;
              const openRate = s.sent > 0 ? (s.opened / s.sent) * 100 : 0;
              const Icon = CHANNEL_ICON[s.channel] || MessageSquare;
              const isActive = s.status === "active";
              return (
                <Link
                  key={s.sequence_id}
                  href={`/admin/sequences/${s.sequence_id}`}
                  className={cn(
                    "grid grid-cols-[1fr_64px_64px_72px_56px] gap-x-3 items-center",
                    "px-2 py-2 rounded-md hover:bg-white/[0.04] transition-colors",
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={cn(
                        "w-1.5 h-1.5 rounded-full shrink-0",
                        isActive ? "bg-emerald-500" : "bg-yellow-500",
                      )}
                      title={s.status}
                    />
                    <Icon className="h-3.5 w-3.5 text-white/40 shrink-0" />
                    <span className="text-sm text-white/85 truncate">{s.name}</span>
                  </div>
                  <span className="text-right text-sm text-white/70 tabular-nums">
                    {s.sent.toLocaleString()}
                  </span>
                  <span className="text-right text-sm text-white/70 tabular-nums">
                    {s.opened.toLocaleString()}
                    <span className="text-[10px] text-white/30 ml-1">
                      {s.sent > 0 ? `${openRate.toFixed(0)}%` : "—"}
                    </span>
                  </span>
                  <span className="text-right text-sm text-white/85 tabular-nums">
                    {s.replied.toLocaleString()}
                  </span>
                  <span
                    className={cn(
                      "text-right text-sm font-medium tabular-nums",
                      replyRate >= 10
                        ? "text-emerald-400"
                        : replyRate >= 5
                          ? "text-[var(--accent-orange)]"
                          : "text-white/50",
                    )}
                  >
                    {s.sent > 0 ? `${replyRate.toFixed(1)}%` : "—"}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
