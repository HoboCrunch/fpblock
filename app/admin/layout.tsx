import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AdminShell } from "./admin-shell";
import { QueryProvider } from "@/lib/queries/query-provider";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: allEvents } = await supabase
    .from("events")
    .select("id, name, date_start, date_end")
    .order("date_start", { ascending: true, nullsFirst: false });

  // Hide past events from the nav: keep if (date_end >= today) OR
  // (date_end is null AND (date_start is null OR date_start >= today)).
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();
  const events = (allEvents || [])
    .filter((e) => {
      const end = e.date_end ? new Date(e.date_end).getTime() : null;
      const start = e.date_start ? new Date(e.date_start).getTime() : null;
      if (end !== null && !Number.isNaN(end)) return end >= todayMs;
      if (start !== null && !Number.isNaN(start)) return start >= todayMs;
      return true; // dateless event — surface it
    })
    .map((e) => ({ id: e.id, name: e.name, date_start: e.date_start }));

  return (
    <QueryProvider>
      <AdminShell events={events} userEmail={user.email || ""}>
        {children}
      </AdminShell>
    </QueryProvider>
  );
}
