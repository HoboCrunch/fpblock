import { cn } from "@/lib/utils";

const variants: Record<string, string> = {
  default: "bg-gray-700 text-gray-200",
  draft: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  scheduled: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  sent: "bg-green-500/10 text-green-400 border-green-500/20",
  replied: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  bounced: "bg-red-500/10 text-red-400 border-red-500/20",
  failed: "bg-red-500/10 text-red-500 border-red-500/20",
  approved: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  processing: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  superseded: "bg-gray-500/10 text-gray-500 border-gray-500/20",
};

export function Badge({
  variant = "default",
  children,
  className,
}: {
  variant?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border",
        variants[variant] || variants.default,
        className
      )}
    >
      {children}
    </span>
  );
}
