"use client";

import Link from "next/link";
import { memo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { NavTooltip } from "./nav-tooltip";
import type { LucideIcon } from "lucide-react";

export type NavItemData = {
  label: string;
  href: string;
  icon: LucideIcon;
  hasSubItems?: boolean;
};

export const NavItem = memo(function NavItem({
  item,
  active,
  collapsed,
  isTablet,
  onClick,
  children,
}: {
  item: NavItemData;
  active: boolean;
  collapsed: boolean;
  isTablet: boolean;
  onClick: () => void;
  children?: React.ReactNode;
}) {
  const Icon = item.icon;
  const ref = useRef<HTMLAnchorElement>(null);
  const [hovered, setHovered] = useState(false);
  const showTooltip = (collapsed || isTablet) && hovered;

  return (
    <div>
      <Link
        ref={ref}
        href={item.href}
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={cn(
          "group relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200",
          active
            ? "text-[var(--accent-orange)] bg-[var(--accent-orange)]/[0.08]"
            : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-white/[0.04]"
        )}
      >
        {/* active indicator bar */}
        <span
          className={cn(
            "absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full bg-[var(--accent-orange)] transition-all duration-300",
            active ? "h-5 opacity-100" : "h-0 opacity-0"
          )}
        />

        {/* icon wrapper with subtle glow on active */}
        <span
          className={cn(
            "flex items-center justify-center w-5 h-5 shrink-0 transition-all duration-200",
            active && "drop-shadow-[0_0_6px_rgba(245,131,39,0.3)]"
          )}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>

        {/* label */}
        <span
          className={cn(
            "truncate transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
            (collapsed || isTablet) && "lg:opacity-0 lg:w-0 lg:overflow-hidden lg:ml-0 max-lg:opacity-0 max-lg:w-0 max-lg:overflow-hidden max-lg:ml-0",
            !(collapsed || isTablet) && "lg:opacity-100 lg:w-auto lg:ml-0",
            // on mobile overlay always show
            "max-md:!opacity-100 max-md:!w-auto"
          )}
        >
          {item.label}
        </span>

        {children}
      </Link>

      <NavTooltip label={item.label} show={showTooltip} anchorRef={ref} />
    </div>
  );
});
