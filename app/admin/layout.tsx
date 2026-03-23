import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/admin/sidebar";
import { Header } from "@/components/admin/header";

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
    <div className="flex h-screen overflow-hidden bg-[var(--bg-app)] text-white">
      <Sidebar events={events || []} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header userEmail={user.email || ""} />
        <main className="flex-1 p-6 bg-grid overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
