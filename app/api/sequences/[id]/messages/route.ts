import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status");
  const stepParam = url.searchParams.get("step");
  const search = url.searchParams.get("search");

  let query = supabase
    .from("interactions")
    .select(
      "id,person_id,sequence_step,subject,body,status,scheduled_at,occurred_at,detail,persons(full_name,title)"
    )
    .eq("sequence_id", id)
    .order("scheduled_at", { ascending: true });

  if (statusParam) {
    const statuses = statusParam.split(",").filter(Boolean);
    if (statuses.length > 0) {
      query = query.in("status", statuses);
    }
  }

  if (stepParam !== null) {
    query = query.eq("sequence_step", Number(stepParam));
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type Row = {
    id: string;
    person_id: string | null;
    sequence_step: number | null;
    subject: string | null;
    body: string | null;
    status: string;
    scheduled_at: string | null;
    occurred_at: string | null;
    detail: Record<string, unknown> | null;
    persons: { full_name: string; title: string | null } | { full_name: string; title: string | null }[] | null;
  };

  let messages = (data as Row[]).map((row) => {
    const person = Array.isArray(row.persons) ? row.persons[0] : row.persons;
    return {
    id: row.id,
    person_id: row.person_id,
    person_name: person?.full_name ?? null,
    person_title: person?.title ?? null,
    person_org: null,
    sequence_step: row.sequence_step,
    subject: row.subject,
    body: row.body,
    status: row.status,
    scheduled_at: row.scheduled_at,
    occurred_at: row.occurred_at,
    detail: row.detail,
  };
  });

  if (search) {
    const term = search.toLowerCase();
    messages = messages.filter(
      (m) =>
        (m.person_name?.toLowerCase().includes(term) ?? false) ||
        (m.subject?.toLowerCase().includes(term) ?? false)
    );
  }

  return NextResponse.json(messages);
}
