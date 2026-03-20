"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

interface BreadcrumbProps {
  pathname: string;
}

const labelMap: Record<string, string> = {
  admin: "Admin",
  contacts: "Contacts",
  companies: "Companies",
  events: "Events",
  pipeline: "Pipeline",
  sequences: "Sequences",
  inbox: "Inbox",
  enrichment: "Enrichment",
  uploads: "Uploads",
  settings: "Settings",
  queue: "Queue",
};

export function Breadcrumb({ pathname }: BreadcrumbProps) {
  const segments = pathname.split("/").filter(Boolean);

  // Build breadcrumb items from path segments
  const crumbs = segments.map((segment, index) => {
    const href = "/" + segments.slice(0, index + 1).join("/");
    const label = labelMap[segment] || decodeURIComponent(segment);
    const isLast = index === segments.length - 1;
    return { href, label, isLast };
  });

  // If only /admin, show "Dashboard"
  if (crumbs.length <= 1) {
    return (
      <div className="text-sm text-[var(--text-secondary)] font-[family-name:var(--font-heading)] font-semibold">
        Dashboard
      </div>
    );
  }

  return (
    <nav className="flex items-center gap-1 text-sm">
      {crumbs.map((crumb, i) => (
        <span key={crumb.href} className="flex items-center gap-1">
          {i > 0 && (
            <ChevronRight className="h-3.5 w-3.5 text-[var(--text-muted)]" />
          )}
          {crumb.isLast ? (
            <span className="text-white font-[family-name:var(--font-heading)] font-medium">
              {crumb.label}
            </span>
          ) : (
            <Link
              href={crumb.href}
              className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
            >
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
