import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ChainSegment {
  text: string;
  href?: string;
  badge?: string;
}

interface CorrelationBadgeProps {
  segments: ChainSegment[];
  className?: string;
}

export function CorrelationBadge({ segments, className }: CorrelationBadgeProps) {
  if (segments.length === 0) {
    return (
      <span className={cn("text-xs text-[var(--text-muted)]", className)}>
        &mdash;
      </span>
    );
  }

  return (
    <span className={cn("inline-flex items-center flex-wrap gap-0.5", className)}>
      {segments.map((segment, i) => (
        <span key={i} className="inline-flex items-center">
          {i > 0 && (
            <span className="mx-1 text-xs text-[var(--text-muted)]">&rarr;</span>
          )}
          {segment.badge ? (
            <Badge variant={segment.badge}>{segment.text}</Badge>
          ) : segment.href ? (
            <Link
              href={segment.href}
              className="text-xs text-[var(--accent-indigo)] hover:underline"
            >
              {segment.text}
            </Link>
          ) : (
            <span className="text-xs text-[var(--text-secondary)]">
              {segment.text}
            </span>
          )}
        </span>
      ))}
    </span>
  );
}
