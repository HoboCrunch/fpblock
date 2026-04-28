import { cn } from "@/lib/utils";

const variants: Record<string, string> = {
  default: "bg-gray-700/50 text-gray-200 border-gray-600/30",
  draft: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  scheduled: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  sending: "bg-orange-400/10 text-orange-400 border-orange-400/20",
  sent: "bg-green-500/10 text-green-400 border-green-500/20",
  delivered: "bg-green-400/10 text-green-300 border-green-400/20",
  opened: "bg-teal-400/10 text-teal-400 border-teal-400/20",
  replied: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  bounced: "bg-red-500/10 text-red-400 border-red-500/20",
  failed: "bg-red-500/10 text-red-500 border-red-500/20",
  approved: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  processing: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  superseded: "bg-gray-500/10 text-gray-500 border-gray-500/20",
  not_contacted: "bg-gray-500/10 text-gray-400 border-gray-500/20",
  // Sponsor tier variants
  "presented_by": "bg-purple-500/10 text-purple-400 border-purple-500/20",
  "platinum": "bg-gray-300/10 text-gray-300 border-gray-300/20",
  "diamond": "bg-cyan-400/10 text-cyan-400 border-cyan-400/20",
  "emerald": "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
  "gold": "bg-amber-400/10 text-amber-400 border-amber-400/20",
  "silver": "bg-gray-400/10 text-gray-400 border-gray-400/20",
  "bronze": "bg-orange-700/10 text-orange-600 border-orange-700/20",
  "copper": "bg-orange-400/10 text-orange-300 border-orange-400/20",
  "community": "bg-blue-400/10 text-blue-400 border-blue-400/20",
  // Seniority variants
  "c-level": "bg-[var(--accent-orange)]/10 text-[var(--accent-orange)] border-[var(--accent-orange)]/20",
  "vp": "bg-[var(--accent-indigo)]/10 text-[var(--accent-indigo)] border-[var(--accent-indigo)]/20",
  "director": "bg-[var(--accent-indigo)]/10 text-[var(--accent-indigo)] border-[var(--accent-indigo)]/20",
  // Glass variants
  glass: "glass text-white",
  "glass-orange":
    "bg-[var(--accent-orange)]/10 text-[var(--accent-orange)] border-[var(--accent-orange)]/20",
  "glass-indigo":
    "bg-[var(--accent-indigo)]/10 text-[var(--accent-indigo)] border-[var(--accent-indigo)]/20",
};

export function Badge({
  variant = "default",
  children,
  className,
  title,
}: {
  variant?: string;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center max-w-full min-w-0 px-2.5 py-0.5 rounded-full text-xs font-medium border",
        variants[variant] || variants.default,
        className
      )}
    >
      <span className="truncate min-w-0">{children}</span>
    </span>
  );
}
