import { cn } from "@/lib/utils";
import { type LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  accentColor?: "orange" | "indigo";
  className?: string;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  accentColor = "orange",
  className,
}: StatCardProps) {
  const iconColor =
    accentColor === "indigo"
      ? "text-[var(--accent-indigo)]"
      : "text-[var(--accent-orange)]";

  return (
    <div
      className={cn(
        "glass rounded-xl p-5 transition-all duration-200 glass-hover",
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="font-[family-name:var(--font-heading)] text-3xl font-semibold text-white">
            {value}
          </p>
          <p className="text-sm text-[var(--text-muted)] mt-1">{label}</p>
        </div>
        <Icon className={cn("h-5 w-5", iconColor)} />
      </div>
      {/* Placeholder for future sparkline/trend */}
      <div className="mt-3 h-6" />
    </div>
  );
}
