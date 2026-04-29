import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { InteractionStatus } from "@/lib/types/database";

type Action =
  | "approve"
  | "approve_at"
  | "reject"
  | "reschedule"
  | "cancel"
  | "retry"
  | "edit"
  | "resend";

interface PatchBody {
  action: Action;
  scheduled_at?: string;
  scheduledAt?: string; // legacy alias
  reason?: string;
  body?: string;
  subject?: string;
}

const TERMINAL_STATUSES: readonly InteractionStatus[] = [
  "sent",
  "delivered",
  "opened",
  "clicked",
  "replied",
  "bounced",
];

/**
 * Map (action, currentStatus) → update payload, or an error.
 * Server-side validation: never resurrect a sent/replied message to draft.
 */
function buildUpdate(
  action: Action,
  status: InteractionStatus,
  scheduledAt: string | undefined,
  reason: string | undefined,
  patch: { body?: string; subject?: string }
): { ok: true; payload: Record<string, unknown> } | { ok: false; error: string; code: number } {
  switch (action) {
    case "approve": {
      if (status !== "draft") {
        return { ok: false, error: `Cannot approve from status "${status}"`, code: 409 };
      }
      return {
        ok: true,
        payload: {
          status: "scheduled",
          scheduled_at: scheduledAt ?? new Date().toISOString(),
        },
      };
    }
    case "approve_at": {
      if (status !== "draft") {
        return { ok: false, error: `Cannot approve from status "${status}"`, code: 409 };
      }
      if (!scheduledAt) {
        return { ok: false, error: "scheduled_at required", code: 400 };
      }
      const ts = Date.parse(scheduledAt);
      if (Number.isNaN(ts)) {
        return { ok: false, error: "Invalid scheduled_at", code: 400 };
      }
      if (ts <= Date.now() - 60_000) {
        return { ok: false, error: "scheduled_at must be in the future", code: 400 };
      }
      return {
        ok: true,
        payload: { status: "scheduled", scheduled_at: new Date(ts).toISOString() },
      };
    }
    case "reschedule": {
      if (status !== "scheduled" && status !== "draft" && status !== "failed") {
        return { ok: false, error: `Cannot reschedule from status "${status}"`, code: 409 };
      }
      if (!scheduledAt) {
        return { ok: false, error: "scheduled_at required", code: 400 };
      }
      const ts = Date.parse(scheduledAt);
      if (Number.isNaN(ts) || ts <= Date.now() - 60_000) {
        return { ok: false, error: "scheduled_at must be a valid future timestamp", code: 400 };
      }
      return {
        ok: true,
        payload: { status: "scheduled", scheduled_at: new Date(ts).toISOString() },
      };
    }
    case "cancel": {
      if (status !== "scheduled") {
        return { ok: false, error: `Cannot cancel from status "${status}"`, code: 409 };
      }
      return { ok: true, payload: { status: "draft", scheduled_at: null } };
    }
    case "reject": {
      if (status !== "draft" && status !== "scheduled") {
        return { ok: false, error: `Cannot reject from status "${status}"`, code: 409 };
      }
      return {
        ok: true,
        payload: {
          status: "failed",
          scheduled_at: null,
          detail: { rejected: true, reason: reason ?? "rejected" },
        },
      };
    }
    case "retry":
    case "resend": {
      if (status !== "failed" && status !== "bounced") {
        return { ok: false, error: `Cannot retry from status "${status}"`, code: 409 };
      }
      const when = scheduledAt
        ? new Date(Date.parse(scheduledAt)).toISOString()
        : new Date(Date.now() + 5 * 60 * 1000).toISOString();
      return {
        ok: true,
        payload: { status: "scheduled", scheduled_at: when },
      };
    }
    case "edit": {
      if (TERMINAL_STATUSES.includes(status)) {
        return { ok: false, error: "Cannot edit a sent message", code: 409 };
      }
      const out: Record<string, unknown> = {};
      if (patch.body !== undefined) out.body = patch.body;
      if (patch.subject !== undefined) out.subject = patch.subject;
      if (Object.keys(out).length === 0) {
        return { ok: false, error: "No fields to update", code: 400 };
      }
      return { ok: true, payload: out };
    }
    default:
      return { ok: false, error: "Invalid action", code: 400 };
  }
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
    .select("id,status")
    .eq("id", msgId)
    .eq("sequence_id", id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  const scheduledAt = body.scheduled_at ?? body.scheduledAt;
  const result = buildUpdate(
    body.action,
    existing.status as InteractionStatus,
    scheduledAt,
    body.reason,
    { body: body.body, subject: body.subject }
  );

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
