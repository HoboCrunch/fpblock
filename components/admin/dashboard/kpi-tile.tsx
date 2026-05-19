import { cn } from "@/lib/utils";
import { type LucideIcon } from "lucide-react";

interface KpiTileProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  accent?: "orange" | "indigo" | "emerald" | "neutral";
  /** Optional secondary metric shown under the value (e.g. "12 sent today"). */
  hint?: string;
  /** Optional emphasis color for the hint. */
  hintAccent?: "orange" | "indigo" | "emerald" | "rose" | "neutral";
  /** Optional small label suffix shown next to the value (e.g. "%"). */
  suffix?: string;
  className?: string;
}

const ACCENT_TEXT: Record<string, string> = {
  orange: "text-[var(--accent-orange)]",
  indigo: "text-[var(--accent-indigo)]",
  emerald: "text-emerald-400",
  neutral: "text-white/40",
};

const HINT_TEXT: Record<string, string> = {
  orange: "text-[var(--accent-orange)]",
  indigo: "text-[var(--accent-indigo)]",
  emerald: "text-emerald-400",
  rose: "text-rose-400",
  neutral: "text-white/40",
};

export function KpiTile({
  label,
  value,
  icon: Icon,
  accent = "indigo",
  hint,
  hintAccent = "neutral",
  suffix,
  className,
}: KpiTileProps) {
  return (
    <div
      className={cn(
        "glass glass-hover rounded-xl p-5 transition-all duration-200",
        "flex flex-col justify-between min-h-[124px]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs uppercase tracking-wider text-white/40 font-medium">
          {label}
        </p>
        {Icon && <Icon className={cn("h-4 w-4 shrink-0", ACCENT_TEXT[accent])} />}
      </div>
      <div className="mt-4">
        <div className="flex items-baseline gap-1">
          <p className="font-[family-name:var(--font-heading)] text-[2rem] leading-none font-semibold text-white tabular-nums">
            {value}
          </p>
          {suffix && (
            <span className="text-base text-white/40 font-medium">{suffix}</span>
          )}
        </div>
        <p
          className={cn(
            "mt-2 text-xs tabular-nums",
            hint ? HINT_TEXT[hintAccent] : "text-transparent select-none",
          )}
        >
          {hint || "—"}
        </p>
      </div>
    </div>
  );
}
