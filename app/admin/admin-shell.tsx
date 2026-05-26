"use client";

import { useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/admin/sidebar";
import { Header } from "@/components/admin/header";
import { ProcessDetailsProvider } from "@/components/admin/process-details-provider";

export function AdminShell({
  events,
  userEmail,
  children,
}: {
  events: { id: string; name: string; date_start: string | null }[];
  userEmail: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleClose = useCallback(() => setMobileOpen(false), []);
  const handleMenuToggle = useCallback(() => setMobileOpen(true), []);

  return (
    <ProcessDetailsProvider>
      <div className="flex h-screen overflow-hidden bg-[var(--bg-app)] text-white">
        <Sidebar
          events={events}
          mobileOpen={mobileOpen}
          onClose={handleClose}
          pathname={pathname}
        />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Header
            userEmail={userEmail}
            onMenuToggle={handleMenuToggle}
            pathname={pathname}
          />
          <main className="flex-1 p-3 md:p-6 bg-grid overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </ProcessDetailsProvider>
  );
}
