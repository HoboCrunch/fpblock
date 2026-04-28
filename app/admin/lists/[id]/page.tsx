import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadPersonRows } from "@/lib/data/load-person-rows";
import { getListById, getListItems } from "../actions";
import { ListDetailClient } from "./list-detail-client";
import type { PersonFilterRules } from "@/lib/filters/person-filters";

export default async function ListDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: list }, { data: itemRows }, rowsResult] = await Promise.all([
    getListById(id),
    getListItems(id),
    loadPersonRows(supabase),
  ]);

  if (!list) notFound();

  const memberIds = (itemRows as { person_id: string }[]).map((r) => r.person_id);

  return (
    <ListDetailClient
      list={{
        id: list.id,
        name: list.name,
        description: list.description,
        filter_rules: (list.filter_rules ?? null) as PersonFilterRules | null,
      }}
      initialMemberIds={memberIds}
      rows={rowsResult.rows}
      eventOptions={rowsResult.eventOptions}
      sourceOptions={rowsResult.sourceOptions}
      seniorityOptions={rowsResult.seniorityOptions}
      departmentOptions={rowsResult.departmentOptions}
    />
  );
}
