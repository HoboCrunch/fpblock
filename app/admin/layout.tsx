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
    <div className="flex min-h-screen bg-gray-950 text-white">
      <Sidebar events={events || []} />
      <div className="flex-1 flex flex-col">
        <Header userEmail={user.email || ""} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
