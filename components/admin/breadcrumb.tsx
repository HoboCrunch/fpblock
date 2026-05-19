"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { isUuid, useEntityName, type EntityKind } from "@/lib/queries/use-entity-name";

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
  lists: "Lists",
};

// Routes where a UUID segment immediately follows a known collection name
// → fetch the entity's display name for that segment.
const NAMEABLE_PARENTS: Record<string, EntityKind> = {
  events: "events",
  persons: "persons",
  organizations: "organizations",
  lists: "lists",
};

function truncate(s: string, max = 40) {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function Breadcrumb({ pathname }: BreadcrumbProps) {
  const segments = pathname.split("/").filter(Boolean);

  // Skip "admin" prefix — every page is under /admin
  const visibleSegments = segments.slice(1);

  // Resolve a single nameable [id] segment (typical case: /admin/{collection}/{uuid})
  // We support exactly one resolved entity per breadcrumb path.
  let entityKind: EntityKind | null = null;
  let entityId: string | null = null;
  let entityIdx = -1;
  for (let i = 0; i < visibleSegments.length; i++) {
    const seg = visibleSegments[i];
    const parent = visibleSegments[i - 1];
    if (parent && NAMEABLE_PARENTS[parent] && isUuid(seg)) {
      entityKind = NAMEABLE_PARENTS[parent];
      entityId = seg;
      entityIdx = i;
      break;
    }
  }

  const { data: entityName } = useEntityName(entityKind, entityId);

  // If at /admin root, show "Dashboard"
  if (visibleSegments.length === 0) {
    return (
      <div className="text-sm text-white font-[family-name:var(--font-heading)] font-semibold">
        Dashboard
      </div>
    );
  }

  const crumbs = visibleSegments.map((segment, index) => {
    let href = "/" + segments.slice(0, index + 2).join("/");
    let label: string;
    if (index === entityIdx) {
      label = entityName ? truncate(entityName) : decodeURIComponent(segment);
    } else if (segment === "persons" || segment === "organizations") {
      label = "Contacts";
      href = `/admin/contacts?tab=${segment}`;
    } else {
      label = labelMap[segment] || decodeURIComponent(segment);
    }
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
