"use client";

import { createClient } from "@/lib/supabase/client";
import { usePathname, useRouter } from "next/navigation";
import { Breadcrumb } from "./breadcrumb";
import { LogOut, Menu } from "lucide-react";

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

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="h-14 bg-[var(--glass-bg)]/80 backdrop-blur-md border-b border-[var(--glass-border)] px-4 md:px-6 flex items-center justify-between shrink-0 sticky top-0 z-10">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuToggle}
          className="p-1.5 text-[var(--text-muted)] hover:text-white transition-colors md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Breadcrumb pathname={pathname} />
      </div>
      <div className="flex items-center gap-4">
        <span className="hidden md:inline text-sm text-[var(--text-muted)]">{userEmail}</span>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-white transition-all duration-200"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </div>
    </header>
  );
}
