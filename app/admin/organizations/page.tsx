import { redirect } from "next/navigation";

export default function OrganizationsListPage() {
  redirect("/admin/contacts?tab=organizations");
}
