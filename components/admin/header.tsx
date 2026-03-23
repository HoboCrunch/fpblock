"use client";

import { createClient } from "@/lib/supabase/client";
import { usePathname, useRouter } from "next/navigation";
import { Breadcrumb } from "./breadcrumb";
import { LogOut } from "lucide-react";

export function Header({ userEmail }: { userEmail: string }) {
  const supabase = createClient();
  const router = useRouter();
  const pathname = usePathname();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="h-14 bg-[var(--glass-bg)]/80 backdrop-blur-md border-b border-[var(--glass-border)] px-6 flex items-center justify-between shrink-0 sticky top-0 z-10">
      <Breadcrumb pathname={pathname} />
      <div className="flex items-center gap-4">
        <span className="text-sm text-[var(--text-muted)]">{userEmail}</span>
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
