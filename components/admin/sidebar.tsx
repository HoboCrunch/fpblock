"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { memo, useState, useEffect, useCallback } from "react";
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
  List as ListIcon,
  X,
} from "lucide-react";
import { NavItem } from "./nav-item";
import type { NavItemData } from "./nav-item";

/* ── nav data ────────────────────────────────────────────── */

const mainNavItems: NavItemData[] = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { label: "Persons", href: "/admin/persons", icon: Users },
  { label: "Lists", href: "/admin/lists", icon: ListIcon },
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

const bottomNavItems: NavItemData[] = [
  { label: "Settings", href: "/admin/settings", icon: Settings },
];

/* ── main sidebar export ─────────────────────────────────── */

export const Sidebar = memo(function Sidebar({
  events,
  mobileOpen,
  onClose,
  pathname,
}: {
  events: { id: string; name: string }[];
  mobileOpen: boolean;
  onClose: () => void;
  pathname: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [eventsOpen, setEventsOpen] = useState(true);

  const isActive = useCallback(
    (href: string) => {
      if (href === "/admin") return pathname === "/admin";
      return pathname.startsWith(href);
    },
    [pathname]
  );

  const handleNavClick = useCallback(() => onClose(), [onClose]);

  // Detect tablet for tooltip display
  const [isTablet, setIsTablet] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px) and (max-width: 1023px)");
    setIsTablet(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsTablet(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return (
    <>
      {/* mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden transition-opacity duration-300"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          "h-screen flex flex-col shrink-0 transition-all duration-300 ease-in-out",
          "bg-[var(--glass-bg)]/95 backdrop-blur-xl border-r border-[var(--glass-border)]",
          collapsed ? "w-16" : "w-[248px]",
          "max-lg:w-16",
          "max-md:fixed max-md:left-0 max-md:top-0 max-md:z-50 max-md:w-[264px]",
          mobileOpen
            ? "max-md:translate-x-0 max-md:shadow-2xl max-md:shadow-black/50"
            : "max-md:-translate-x-full"
        )}
      >
        {/* ── logo ────────────────────────────────────────── */}
        <div className="h-14 flex items-center px-4 border-b border-[var(--glass-border)] shrink-0">
          <Link
            href="/admin"
            onClick={handleNavClick}
            className="flex items-center group"
          >
            {/* "FP" — always visible, acts as the logo mark */}
            <span
              className="font-[family-name:var(--font-heading)] font-bold text-lg text-[var(--accent-orange)] leading-none transition-all duration-300 group-hover:drop-shadow-[0_0_8px_rgba(245,131,39,0.35)]"
              style={{ letterSpacing: "-0.5px" }}
            >
              FP
            </span>
            {/* "Block" — hidden when collapsed or tablet */}
            <span
              className={cn(
                "font-[family-name:var(--font-heading)] font-bold text-lg text-white leading-none transition-all duration-300 overflow-hidden",
                collapsed ? "lg:w-0 lg:ml-0 lg:opacity-0" : "lg:w-auto lg:ml-[3px] lg:opacity-100",
                "max-lg:w-0 max-lg:ml-0 max-lg:opacity-0",
                "max-md:!w-auto max-md:!ml-[3px] max-md:!opacity-100"
              )}
              style={{ letterSpacing: "-0.3px" }}
            >
              Block
            </span>
          </Link>

          {/* mobile close */}
          <button
            onClick={onClose}
            className="ml-auto p-1.5 rounded-md text-[var(--text-muted)] hover:text-white hover:bg-white/[0.06] transition-all duration-200 md:hidden"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        {/* ── section label ───────────────────────────────── */}
        <div
          className={cn(
            "px-4 pt-4 pb-1 transition-all duration-300 overflow-hidden",
            (collapsed || isTablet) ? "max-lg:h-0 max-lg:pt-2 max-lg:pb-0" : "",
            collapsed ? "lg:h-0 lg:pt-2 lg:pb-0" : "",
            "max-md:!h-auto max-md:!pt-4 max-md:!pb-1"
          )}
        >
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]/60">
            Navigation
          </span>
        </div>

        {/* ── main nav ────────────────────────────────────── */}
        <nav className="flex-1 py-1 px-2 flex flex-col gap-0.5 overflow-y-auto scrollbar-thin">
          {mainNavItems.map((item) => {
            const active = isActive(item.href);
            const effectiveCollapsed = collapsed || isTablet;

            return (
              <div key={item.href}>
                <div className="flex items-center">
                  <div className="flex-1">
                    <NavItem
                      item={item}
                      active={active}
                      collapsed={collapsed}
                      isTablet={isTablet}
                      onClick={handleNavClick}
                    >
                      {/* events chevron */}
                      {item.hasSubItems && !effectiveCollapsed && (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setEventsOpen(!eventsOpen);
                          }}
                          className="ml-auto p-0.5 text-[var(--text-muted)] hover:text-white transition-colors max-lg:hidden"
                        >
                          <ChevronDown
                            className={cn(
                              "h-3.5 w-3.5 transition-transform duration-300",
                              !eventsOpen && "-rotate-90"
                            )}
                          />
                        </button>
                      )}
                    </NavItem>
                  </div>
                </div>

                {/* event sub-items */}
                {item.hasSubItems && eventsOpen && !effectiveCollapsed && (
                  <div
                    className={cn(
                      "ml-5 pl-3 border-l border-[var(--glass-border)]/60 mt-0.5 mb-1.5 flex flex-col gap-0.5 max-lg:hidden",
                      "animate-[fadeSlideDown_0.2s_ease-out]"
                    )}
                  >
                    {events.map((event) => {
                      const eventHref = `/admin/events/${event.id}`;
                      const eventActive = pathname === eventHref;
                      return (
                        <Link
                          key={event.id}
                          href={eventHref}
                          onClick={handleNavClick}
                          className={cn(
                            "text-xs px-2.5 py-1.5 rounded-md transition-all duration-200 truncate",
                            eventActive
                              ? "text-[var(--accent-orange)] bg-[var(--accent-orange)]/[0.08] font-medium"
                              : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-white/[0.03]"
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

        {/* ── bottom section ──────────────────────────────── */}
        <div className="px-2 pb-3 flex flex-col gap-0.5 border-t border-[var(--glass-border)] pt-2 shrink-0">
          {bottomNavItems.map((item) => {
            const active = isActive(item.href);
            return (
              <NavItem
                key={item.href}
                item={item}
                active={active}
                collapsed={collapsed}
                isTablet={isTablet}
                onClick={handleNavClick}
              />
            );
          })}

          {/* collapse toggle — desktop only */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={cn(
              "hidden lg:flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs",
              "text-[var(--text-muted)]/70 hover:text-[var(--text-secondary)] hover:bg-white/[0.04]",
              "transition-all duration-200 mt-1"
            )}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4 shrink-0" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4 shrink-0" />
                <span className="font-medium">Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
});
