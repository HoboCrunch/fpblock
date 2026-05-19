import { redirect } from "next/navigation";

export default function PersonsListPage() {
  redirect("/admin/contacts?tab=persons");
}
