import { createClient } from "@/lib/supabase/server";
import { loadPersonRows } from "@/lib/data/load-person-rows";
import { PersonsTableClient } from "./persons-table-client";

export default async function PersonsListPage() {
  const supabase = await createClient();
  const { rows, eventOptions, sourceOptions, seniorityOptions, departmentOptions } = await loadPersonRows(supabase);
  return (
    <PersonsTableClient
      rows={rows}
      eventOptions={eventOptions}
      sourceOptions={sourceOptions}
      seniorityOptions={seniorityOptions}
      departmentOptions={departmentOptions}
    />
  );
}
