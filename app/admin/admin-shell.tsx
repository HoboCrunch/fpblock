"use client";

import { useState } from "react";
import { Sidebar } from "@/components/admin/sidebar";
import { Header } from "@/components/admin/header";

export function AdminShell({
  events,
  userEmail,
  children,
}: {
  events: { id: string; name: string }[];
  userEmail: string;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg-app)] text-white">
      <Sidebar
        events={events}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header
          userEmail={userEmail}
          onMenuToggle={() => setMobileOpen(true)}
        />
        <main className="flex-1 p-3 md:p-6 bg-grid overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
