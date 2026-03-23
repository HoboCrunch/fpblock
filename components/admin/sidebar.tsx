"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useState } from "react";
import {
  LayoutDashboard,
  Users,
  Building2,
  Calendar,
  Kanban,
  GitBranch,
  Mail,
  Sparkles,
  Upload,
  Settings,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Rocket,
  GitMerge,
} from "lucide-react";

const mainNavItems = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { label: "Persons", href: "/admin/persons", icon: Users },
  { label: "Organizations", href: "/admin/organizations", icon: Building2 },
  { label: "Events", href: "/admin/events", icon: Calendar, hasSubItems: true },
  { label: "Pipeline", href: "/admin/pipeline", icon: Kanban },
  { label: "Initiatives", href: "/admin/initiatives", icon: Rocket },
  { label: "Sequences", href: "/admin/sequences", icon: GitBranch },
  { label: "Inbox", href: "/admin/inbox", icon: Mail },
  { label: "Enrichment", href: "/admin/enrichment", icon: Sparkles },
  { label: "Correlations", href: "/admin/correlations", icon: GitMerge },
  { label: "Uploads", href: "/admin/uploads", icon: Upload },
];

const bottomNavItems = [
  { label: "Settings", href: "/admin/settings", icon: Settings },
];

export function Sidebar({
  events,
}: {
  events: { id: string; name: string }[];
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [eventsOpen, setEventsOpen] = useState(true);

  const isActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  };

  return (
    <aside
      className={cn(
        "glass border-r border-[var(--glass-border)] h-screen flex flex-col transition-all duration-200 shrink-0 overflow-y-auto scrollbar-thin",
        collapsed ? "w-16" : "w-60",
        // Auto-collapse on tablet
        "max-lg:w-16 max-md:hidden"
      )}
    >
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b border-[var(--glass-border)]">
        <span
          className={cn(
            "font-[family-name:var(--font-heading)] font-semibold text-lg text-white transition-all duration-200",
            collapsed && "lg:hidden"
          )}
        >
          FP Block
        </span>
        <span
          className={cn(
            "font-[family-name:var(--font-heading)] font-semibold text-lg text-[var(--accent-orange)]",
            !collapsed && "lg:hidden"
          )}
        >
          FP
        </span>
      </div>

      {/* Main nav */}
      <nav className="flex-1 py-3 px-2 flex flex-col gap-0.5">
        {mainNavItems.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;

          return (
            <div key={item.href}>
              <div className="flex items-center">
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200 flex-1 relative",
                    active
                      ? "text-[var(--accent-orange)] bg-[var(--accent-orange)]/5"
                      : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)]"
                  )}
                >
                  {/* Orange left border for active */}
                  {active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-[var(--accent-orange)]" />
                  )}
                  <Icon className="h-4.5 w-4.5 shrink-0" />
                  <span
                    className={cn(
                      "transition-all duration-200",
                      collapsed && "lg:hidden"
                    )}
                  >
                    {item.label}
                  </span>
                </Link>
                {/* Expand/collapse toggle for Events */}
                {item.hasSubItems && !collapsed && (
                  <button
                    onClick={() => setEventsOpen(!eventsOpen)}
                    className="p-1 text-[var(--text-muted)] hover:text-white transition-colors max-lg:hidden"
                  >
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 transition-transform duration-200",
                        !eventsOpen && "-rotate-90"
                      )}
                    />
                  </button>
                )}
              </div>

              {/* Event sub-items */}
              {item.hasSubItems && eventsOpen && !collapsed && (
                <div className="ml-4 pl-4 border-l border-[var(--glass-border)] mt-0.5 mb-1 flex flex-col gap-0.5 max-lg:hidden">
                  {events.map((event) => {
                    const eventHref = `/admin/events/${event.id}`;
                    const eventActive = pathname === eventHref;
                    return (
                      <Link
                        key={event.id}
                        href={eventHref}
                        className={cn(
                          "text-xs px-2 py-1.5 rounded-md transition-all duration-200 truncate",
                          eventActive
                            ? "text-[var(--accent-orange)] bg-[var(--accent-orange)]/5"
                            : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                        )}
                      >
                        {event.name}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Bottom nav (Settings) */}
      <div className="px-2 pb-2 flex flex-col gap-0.5 border-t border-[var(--glass-border)] pt-2">
        {bottomNavItems.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200 relative",
                active
                  ? "text-[var(--accent-orange)] bg-[var(--accent-orange)]/5"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--glass-bg-hover)]"
              )}
            >
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-[var(--accent-orange)]" />
              )}
              <Icon className="h-4.5 w-4.5 shrink-0" />
              <span
                className={cn(
                  "transition-all duration-200",
                  collapsed && "lg:hidden"
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}

        {/* Collapse toggle - only on desktop */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex items-center justify-center gap-3 px-3 py-2 rounded-lg text-sm text-[var(--text-muted)] hover:text-white hover:bg-[var(--glass-bg-hover)] transition-all duration-200 mt-1"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4 shrink-0" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4 shrink-0" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
