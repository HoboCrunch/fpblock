import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { InteractionStatus } from "@/lib/types/database";

type BulkAction = "approve" | "reject" | "reschedule" | "retry";

interface BulkBody {
  action: BulkAction;
  ids?: string[];
  messageIds?: string[]; // legacy alias
  scheduled_at?: string;
  scheduledAt?: string; // legacy alias
  reason?: string;
}

const ALLOWED_FROM: Record<BulkAction, ReadonlySet<InteractionStatus>> = {
  approve: new Set<InteractionStatus>(["draft"]),
  reject: new Set<InteractionStatus>(["draft", "scheduled"]),
  reschedule: new Set<InteractionStatus>(["draft", "scheduled", "failed"]),
  retry: new Set<InteractionStatus>(["failed", "bounced"]),
};

function buildPayload(
  action: BulkAction,
  scheduledAt: string | undefined,
  reason: string | undefined
): { ok: true; payload: Record<string, unknown> } | { ok: false; error: string } {
  switch (action) {
    case "approve":
      // Approve preserves each row's planned scheduled_at (so later steps keep
      // their drip cadence); see the special-cased handling in POST. The
      // payload here only flips the status.
      return { ok: true, payload: { status: "scheduled" } };
    case "reject":
      return {
        ok: true,
        payload: {
          status: "rejected",
          scheduled_at: null,
          detail: { rejected: true, reason: reason ?? "rejected" },
        },
      };
    case "reschedule": {
      if (!scheduledAt) return { ok: false, error: "scheduled_at required for reschedule" };
      const ts = Date.parse(scheduledAt);
      if (Number.isNaN(ts) || ts <= Date.now() - 60_000) {
        return { ok: false, error: "scheduled_at must be a valid future timestamp" };
      }
      return {
        ok: true,
        payload: { status: "scheduled", scheduled_at: new Date(ts).toISOString() },
      };
    }
    case "retry": {
      const when = scheduledAt
        ? new Date(Date.parse(scheduledAt)).toISOString()
        : new Date(Date.now() + 5 * 60 * 1000).toISOString();
      return { ok: true, payload: { status: "scheduled", scheduled_at: when } };
    }
    default:
      return { ok: false, error: "Invalid action" };
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  let body: BulkBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ids = body.ids ?? body.messageIds ?? [];
  const scheduledAt = body.scheduled_at ?? body.scheduledAt;

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids required" }, { status: 400 });
  }

  const built = buildPayload(body.action, scheduledAt, body.reason);
  if (!built.ok) {
    return NextResponse.json({ error: built.error }, { status: 400 });
  }

  // Fetch existing rows to validate ownership + per-row state transition
  const { data: existing, error: fetchError } = await supabase
    .from("interactions")
    .select("id,status")
    .eq("sequence_id", id)
    .in("id", ids);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const allowed = ALLOWED_FROM[body.action];
  const valid: string[] = [];
  const failed: { id: string; error: string }[] = [];
  const seen = new Set<string>();

  for (const row of (existing ?? []) as { id: string; status: InteractionStatus }[]) {
    seen.add(row.id);
    if (allowed.has(row.status)) {
      valid.push(row.id);
    } else {
      failed.push({ id: row.id, error: `status "${row.status}" not eligible` });
    }
  }
  for (const requested of ids) {
    if (!seen.has(requested)) {
      failed.push({ id: requested, error: "not found in this sequence" });
    }
  }

  if (valid.length === 0) {
    return NextResponse.json(
      { succeeded: [], failed, error: "No eligible messages" },
      { status: 409 }
    );
  }

  // Approve keeps each row's planned scheduled_at; only rows that never got one
  // (e.g. legacy drafts) are backfilled to "now" so they aren't stuck unsent.
  if (body.action === "approve") {
    const { error: backfillError } = await supabase
      .from("interactions")
      .update({ scheduled_at: scheduledAt ?? new Date().toISOString() })
      .in("id", valid)
      .is("scheduled_at", null);
    if (backfillError) {
      return NextResponse.json({ error: backfillError.message }, { status: 500 });
    }
  }

  const { error: updateError } = await supabase
    .from("interactions")
    .update(built.payload)
    .in("id", valid);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ succeeded: valid, failed });
}
