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

  const { data: events } = await supabase
    .from("events")
    .select("id, name")
    .order("date_start", { ascending: true });

  return (
    <QueryProvider>
      <AdminShell events={events || []} userEmail={user.email || ""}>
        {children}
      </AdminShell>
    </QueryProvider>
  );
}
