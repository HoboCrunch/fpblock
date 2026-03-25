// WARNING: Timestamp-only webhook verification — add @sendgrid/eventwebhook for ECDSA before production

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const STATUS_PRIORITY: Record<string, number> = {
  draft: 0,
  scheduled: 1,
  sending: 2,
  sent: 3,
  delivered: 4,
  opened: 5,
  clicked: 6,
  replied: 7,
};

const TERMINAL_STATUSES = new Set(["bounced"]);

function mapSendGridEvent(eventType: string): string | null {
  switch (eventType) {
    case "delivered":
      return "delivered";
    case "open":
      return "opened";
    case "click":
      return "clicked";
    case "bounce":
    case "dropped":
    case "spam_report":
      return "bounced";
    default:
      return null;
  }
}

interface SendGridEvent {
  email?: string;
  timestamp?: number;
  event: string;
  sg_message_id?: string;
  [key: string]: unknown;
}

export async function POST(request: NextRequest) {
  let events: SendGridEvent[];

  try {
    events = await request.json();
    if (!Array.isArray(events)) {
      events = [events];
    }
  } catch (err) {
    console.error("[sendgrid-webhook] Failed to parse request body:", err);
    // Still return 200 so SendGrid doesn't retry
    return NextResponse.json({ ok: true });
  }

  const supabase = await createClient();

  for (const event of events) {
    try {
      const rawMessageId = event.sg_message_id;
      if (!rawMessageId) {
        console.log("[sendgrid-webhook] Event missing sg_message_id, skipping:", event.event);
        continue;
      }

      // Strip .filterXXX suffix — we store the base ID
      const sgMessageId = rawMessageId.split(".")[0];

      const newStatus = mapSendGridEvent(event.event);
      if (!newStatus) {
        console.log("[sendgrid-webhook] Unmapped event type, skipping:", event.event);
        continue;
      }

      // Look up the interaction by sendgrid_message_id stored in detail JSONB
      const { data: interactions, error: lookupError } = await supabase
        .from("interactions")
        .select("id, status, sequence_id, person_id")
        .filter("detail->>sendgrid_message_id", "eq", sgMessageId)
        .limit(1);

      if (lookupError) {
        console.error("[sendgrid-webhook] Lookup error for message id", sgMessageId, lookupError.message);
        continue;
      }

      if (!interactions || interactions.length === 0) {
        console.log("[sendgrid-webhook] No interaction found for sg_message_id:", sgMessageId);
        continue;
      }

      const interaction = interactions[0];
      const currentStatus = interaction.status as string;
      const isTerminal = TERMINAL_STATUSES.has(newStatus);

      if (!isTerminal) {
        // Only advance if new status has strictly higher priority
        const currentPriority = STATUS_PRIORITY[currentStatus] ?? -1;
        const newPriority = STATUS_PRIORITY[newStatus] ?? -1;

        if (newPriority <= currentPriority) {
          console.log(
            `[sendgrid-webhook] Skipping status downgrade: ${currentStatus} -> ${newStatus} for interaction ${interaction.id}`
          );
          continue;
        }
      }

      // Update the interaction status
      const { error: updateError } = await supabase
        .from("interactions")
        .update({ status: newStatus })
        .eq("id", interaction.id);

      if (updateError) {
        console.error("[sendgrid-webhook] Failed to update interaction", interaction.id, updateError.message);
        continue;
      }

      console.log(`[sendgrid-webhook] Updated interaction ${interaction.id}: ${currentStatus} -> ${newStatus}`);

      // For terminal statuses, also update the enrollment
      if (isTerminal && interaction.sequence_id && interaction.person_id) {
        const { error: enrollmentError } = await supabase
          .from("sequence_enrollments")
          .update({ status: "bounced" })
          .eq("sequence_id", interaction.sequence_id)
          .eq("person_id", interaction.person_id);

        if (enrollmentError) {
          console.error(
            "[sendgrid-webhook] Failed to update enrollment for sequence",
            interaction.sequence_id,
            "person",
            interaction.person_id,
            enrollmentError.message
          );
        } else {
          console.log(
            `[sendgrid-webhook] Marked enrollment bounced for sequence ${interaction.sequence_id}, person ${interaction.person_id}`
          );
        }
      }
    } catch (err) {
      console.error("[sendgrid-webhook] Unexpected error processing event:", err);
      // Continue processing remaining events
    }
  }

  // Always return 200 so SendGrid doesn't retry
  return NextResponse.json({ ok: true });
}
