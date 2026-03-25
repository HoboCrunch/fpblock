import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; msgId: string }> }
) {
  const { id, msgId } = await params;
  const supabase = await createClient();

  let body: {
    action: "edit" | "approve" | "reject" | "cancel" | "resend";
    body?: string;
    subject?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Verify the message belongs to this sequence
  const { data: existing, error: fetchError } = await supabase
    .from("interactions")
    .select("id,status")
    .eq("id", msgId)
    .eq("sequence_id", id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  let updatePayload: Record<string, unknown>;

  switch (body.action) {
    case "approve":
      updatePayload = {
        status: "scheduled",
        scheduled_at: new Date().toISOString(),
      };
      break;
    case "reject":
      updatePayload = { status: "failed" };
      break;
    case "cancel":
      updatePayload = { status: "draft", scheduled_at: null };
      break;
    case "resend":
      updatePayload = {
        status: "scheduled",
        scheduled_at: new Date().toISOString(),
      };
      break;
    case "edit": {
      const patch: Record<string, unknown> = {};
      if (body.body !== undefined) patch.body = body.body;
      if (body.subject !== undefined) patch.subject = body.subject;
      if (Object.keys(patch).length === 0) {
        return NextResponse.json(
          { error: "No fields to update" },
          { status: 400 }
        );
      }
      updatePayload = patch;
      break;
    }
    default:
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("interactions")
    .update(updatePayload)
    .eq("id", msgId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
