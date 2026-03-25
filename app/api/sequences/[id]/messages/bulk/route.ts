import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  let body: {
    action: "approve" | "reject" | "reschedule";
    messageIds: string[];
    scheduledAt?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { action, messageIds, scheduledAt } = body;

  if (!Array.isArray(messageIds) || messageIds.length === 0) {
    return NextResponse.json({ error: "messageIds required" }, { status: 400 });
  }

  // Verify all messages belong to this sequence
  const { data: existing } = await supabase
    .from("interactions")
    .select("id")
    .eq("sequence_id", id)
    .in("id", messageIds);

  const validIds = (existing ?? []).map((r: { id: string }) => r.id);

  if (validIds.length === 0) {
    return NextResponse.json({ error: "No valid messages found" }, { status: 404 });
  }

  let updatePayload: Record<string, unknown>;

  switch (action) {
    case "approve":
      updatePayload = {
        status: "scheduled",
        scheduled_at: new Date().toISOString(),
      };
      break;
    case "reject":
      updatePayload = { status: "failed" };
      break;
    case "reschedule":
      if (!scheduledAt) {
        return NextResponse.json(
          { error: "scheduledAt required for reschedule" },
          { status: 400 }
        );
      }
      updatePayload = { status: "scheduled", scheduled_at: scheduledAt };
      break;
    default:
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const { error } = await supabase
    .from("interactions")
    .update(updatePayload)
    .in("id", validIds);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ updated: validIds.length });
}
