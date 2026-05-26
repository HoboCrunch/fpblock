import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { InteractionStatus } from "@/lib/types/database";
import { buildUpdate, type Action } from "@/lib/sequences/message-transitions";

interface PatchBody {
  action: Action;
  scheduled_at?: string;
  scheduledAt?: string; // legacy alias
  reason?: string;
  body?: string;
  subject?: string;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; msgId: string }> }
) {
  const { id, msgId } = await params;
  const supabase = await createClient();

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { data: existing, error: fetchError } = await supabase
    .from("interactions")
    .select("id,status,scheduled_at")
    .eq("id", msgId)
    .eq("sequence_id", id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  const scheduledAt = body.scheduled_at ?? body.scheduledAt;
  const result = buildUpdate(body.action, existing.status as InteractionStatus, {
    scheduledAt,
    existingScheduledAt: existing.scheduled_at as string | null,
    reason: body.reason,
    body: body.body,
    subject: body.subject,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.code });
  }

  const { data, error } = await supabase
    .from("interactions")
    .update(result.payload)
    .eq("id", msgId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
