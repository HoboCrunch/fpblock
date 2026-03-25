"use client";

import { createClient } from "@/lib/supabase/client";
import { usePathname, useRouter } from "next/navigation";
import { Breadcrumb } from "./breadcrumb";
import { LogOut, Menu, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useRef, useEffect } from "react";

function UserAvatar({ email }: { email: string }) {
  const initials = email
    .split("@")[0]
    .split(/[._-]/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-br from-[var(--accent-orange)] to-[#e06a10] shadow-sm shadow-[var(--accent-orange)]/20">
      <span className="text-[10px] font-bold text-white leading-none">
        {initials || "U"}
      </span>
    </div>
  );
}

export function Header({
  userEmail,
  onMenuToggle,
}: {
  userEmail: string;
  onMenuToggle?: () => void;
}) {
  const supabase = createClient();
  const router = useRouter();
  const pathname = usePathname();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [dropdownOpen]);

  return (
    <header className="h-14 bg-[var(--glass-bg)]/80 backdrop-blur-xl border-b border-[var(--glass-border)] px-4 md:px-6 flex items-center justify-between shrink-0 sticky top-0 z-10">
      {/* ── left: menu + breadcrumbs ──────────────────────── */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuToggle}
          className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-white hover:bg-white/[0.06] transition-all duration-200 md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Breadcrumb pathname={pathname} />
      </div>

      {/* ── right: search hint + user ─────────────────────── */}
      <div className="flex items-center gap-2">
        {/* search hint — subtle, non-functional placeholder */}
        <button
          className={cn(
            "hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg",
            "border border-[var(--glass-border)] bg-white/[0.02]",
            "text-[var(--text-muted)]/60 hover:text-[var(--text-muted)] hover:border-[var(--glass-border-hover)] hover:bg-white/[0.04]",
            "transition-all duration-200 text-xs"
          )}
        >
          <Search className="h-3.5 w-3.5" />
          <span>Search</span>
          <kbd className="ml-3 px-1.5 py-0.5 rounded bg-white/[0.06] text-[10px] font-mono text-[var(--text-muted)]/50">
            /
          </kbd>
        </button>

        {/* separator */}
        <div className="hidden md:block w-px h-5 bg-[var(--glass-border)] mx-1" />

        {/* user dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className={cn(
              "flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-all duration-200",
              "hover:bg-white/[0.04]",
              dropdownOpen && "bg-white/[0.04]"
            )}
          >
            <UserAvatar email={userEmail} />
            <span className="hidden md:block text-sm text-[var(--text-secondary)] max-w-[140px] truncate">
              {userEmail.split("@")[0]}
            </span>
          </button>

          {/* dropdown menu */}
          {dropdownOpen && (
            <div
              className={cn(
                "absolute right-0 top-full mt-2 w-56 rounded-xl overflow-hidden",
                "bg-[#1a1a1d]/95 backdrop-blur-xl border border-[var(--glass-border-hover)]",
                "shadow-xl shadow-black/40",
                "animate-[fadeSlideDown_0.15s_ease-out]"
              )}
            >
              {/* user info */}
              <div className="px-3.5 py-3 border-b border-[var(--glass-border)]">
                <div className="flex items-center gap-2.5">
                  <UserAvatar email={userEmail} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {userEmail.split("@")[0]}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] truncate">
                      {userEmail}
                    </p>
                  </div>
                </div>
              </div>

              {/* actions */}
              <div className="p-1.5">
                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    handleLogout();
                  }}
                  className={cn(
                    "flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm",
                    "text-[var(--text-muted)] hover:text-white hover:bg-white/[0.06]",
                    "transition-all duration-200"
                  )}
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
