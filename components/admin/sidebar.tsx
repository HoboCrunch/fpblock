"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Dashboard", href: "/admin", icon: "◻" },
  { label: "Message Queue", href: "/admin/queue", icon: "✉" },
];

export function Sidebar({ events }: { events: { id: string; name: string }[] }) {
  const pathname = usePathname();

  return (
    <aside className="w-56 bg-gray-900 border-r border-gray-800 min-h-screen p-4 flex flex-col gap-1">
      <div className="text-white font-semibold text-lg mb-6 px-2">FP Block</div>
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors",
            pathname === item.href
              ? "bg-gray-800 text-white"
              : "text-gray-400 hover:text-white hover:bg-gray-800/50"
          )}
        >
          <span>{item.icon}</span>
          {item.label}
        </Link>
      ))}
      <div className="mt-6 mb-2 px-3 text-xs text-gray-500 uppercase tracking-wider">Events</div>
      {events.map((event) => (
        <Link
          key={event.id}
          href={`/admin/events/${event.id}`}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors",
            pathname === `/admin/events/${event.id}`
              ? "bg-gray-800 text-white"
              : "text-gray-400 hover:text-white hover:bg-gray-800/50"
          )}
        >
          {event.name}
        </Link>
      ))}
    </aside>
  );
}
