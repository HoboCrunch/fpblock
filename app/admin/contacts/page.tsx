import { createClient } from "@/lib/supabase/server";
import { loadPersonRows } from "@/lib/data/load-person-rows";
import { loadOrgRows } from "@/lib/data/load-org-rows";
import { ContactsTabsClient, type ContactsTab } from "./contacts-tabs-client";

function normalizeTab(value: string | string[] | undefined): ContactsTab {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "organizations" ? "organizations" : "persons";
}

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const supabase = await createClient();
  const params = await searchParams;
  const initialTab = normalizeTab(params.tab);

  const [personData, orgData] = await Promise.all([
    loadPersonRows(supabase),
    loadOrgRows(supabase),
  ]);

  return (
    <ContactsTabsClient
      initialTab={initialTab}
      personData={personData}
      orgData={orgData}
    />
  );
}
