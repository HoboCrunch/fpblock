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
  persons: "Persons",
  organizations: "Organizations",
  correlations: "Correlations",
  initiatives: "Initiatives",
  lists: "Lists",
};

export function Breadcrumb({ pathname }: BreadcrumbProps) {
  const segments = pathname.split("/").filter(Boolean);

  // Skip "admin" prefix — every page is under /admin
  const visibleSegments = segments.slice(1);

  // If at /admin root, show "Dashboard"
  if (visibleSegments.length === 0) {
    return (
      <div className="text-sm text-white font-[family-name:var(--font-heading)] font-semibold">
        Dashboard
      </div>
    );
  }

  // Build breadcrumb items from remaining segments
  const crumbs = visibleSegments.map((segment, index) => {
    const href = "/" + segments.slice(0, index + 2).join("/");
    const label = labelMap[segment] || decodeURIComponent(segment);
    const isLast = index === visibleSegments.length - 1;
    return { href, label, isLast };
  });

  return (
    <nav className="flex items-center gap-1.5 text-sm">
      {crumbs.map((crumb, i) => (
        <span key={crumb.href} className="flex items-center gap-1.5">
          {i > 0 && (
            <ChevronRight className="h-3 w-3 text-[var(--text-muted)]/50" />
          )}
          {crumb.isLast ? (
            <span className="text-white font-[family-name:var(--font-heading)] font-semibold">
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
