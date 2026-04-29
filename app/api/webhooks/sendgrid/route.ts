import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyWebhookSignature } from "@/lib/sendgrid";

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

interface SendGridEvent {
  email?: string;
  timestamp?: number;
  event: string;
  sg_message_id?: string;
  // Bounce-related fields (only present on bounce/dropped/blocked events)
  type?: string;
  reason?: string;
  status?: string;
  [key: string]: unknown;
}

type BounceCategory = "hard" | "soft" | "dropped" | null;

/**
 * Categorize a bounce-family event.
 *
 * Hard bounce  -> permanent failure; suppress person, terminate enrollment
 * Soft bounce  -> transient (e.g., mailbox full, greylisting); let retry handle it
 * Dropped      -> SendGrid suppressed before delivery (treat like hard)
 */
function categorizeBounce(event: SendGridEvent): BounceCategory {
  if (event.event === "dropped") return "dropped";

  if (event.event === "bounce") {
    const type = (event.type ?? "").toLowerCase();
    const reason = event.reason ?? "";
    const statusCode = event.status ?? ""; // e.g. "5.1.1" or "4.2.2"

    if (type === "blocked") return "soft";
    if (/^5\d{2}/.test(reason) || /^5\./.test(statusCode) || type === "bounce") {
      return "hard";
    }
    if (/^4\d{2}/.test(reason) || /^4\./.test(statusCode)) return "soft";

    // Unknown bounce — be conservative, treat as hard (matches old behavior)
    return "hard";
  }

  if (event.event === "spam_report") return "hard";

  return null;
}

interface EventMapping {
  /** New interaction.status to set (or null to skip status update). */
  newStatus: string | null;
  /** True when this should also terminate the enrollment. */
  terminal: boolean;
  /** Bounce category, when relevant. */
  bounce: BounceCategory;
  /** Did the recipient reply to this message? */
  isReply: boolean;
  /** Did the recipient click a link? */
  isClick: boolean;
}

function mapSendGridEvent(event: SendGridEvent): EventMapping {
  const type = event.event;
  switch (type) {
    case "delivered":
      return { newStatus: "delivered", terminal: false, bounce: null, isReply: false, isClick: false };
    case "open":
      return { newStatus: "opened", terminal: false, bounce: null, isReply: false, isClick: false };
    case "click":
      return { newStatus: "clicked", terminal: false, bounce: null, isReply: false, isClick: true };
    case "bounce":
    case "dropped":
    case "spam_report": {
      const bounce = categorizeBounce(event);
      // Soft bounces -> failed (non-terminal), let retry logic handle it.
      // Hard bounces and dropped/spam -> bounced (terminal).
      if (bounce === "soft") {
        return { newStatus: "failed", terminal: false, bounce, isReply: false, isClick: false };
      }
      return { newStatus: "bounced", terminal: true, bounce, isReply: false, isClick: false };
    }
    // SendGrid does not natively emit a "reply" event, but inbound parse +
    // some integrations surface it via the events stream. Treat both as
    // reply signals so stop-on-reply can fire.
    case "reply":
    case "inbound_email":
      return { newStatus: "replied", terminal: false, bounce: null, isReply: true, isClick: false };
    default:
      return { newStatus: null, terminal: false, bounce: null, isReply: false, isClick: false };
  }
}

export async function POST(request: NextRequest) {
  // ── Read raw body once (verify needs the bytes, not a re-serialized JSON) ──
  const rawBody = await request.text();

  // ── Verify ECDSA signature ────────────────────────────────────────────────
  const publicKey = process.env.SENDGRID_WEBHOOK_PUBLIC_KEY;
  if (!publicKey) {
    console.error(
      "[sendgrid-webhook] SENDGRID_WEBHOOK_PUBLIC_KEY is not configured — rejecting request"
    );
    return NextResponse.json({ error: "webhook not configured" }, { status: 401 });
  }

  const signature = request.headers.get("x-twilio-email-event-webhook-signature") ?? "";
  const timestamp = request.headers.get("x-twilio-email-event-webhook-timestamp") ?? "";

  const valid = verifyWebhookSignature(publicKey, rawBody, signature, timestamp);
  if (!valid) {
    console.warn("[sendgrid-webhook] Invalid signature — rejecting");
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  // ── Parse events ──────────────────────────────────────────────────────────
  let events: SendGridEvent[];
  try {
    const parsed = JSON.parse(rawBody);
    events = Array.isArray(parsed) ? parsed : [parsed];
  } catch (err) {
    console.error("[sendgrid-webhook] Failed to parse request body:", err);
    // Return 200 so SendGrid doesn't retry malformed payloads forever
    return NextResponse.json({ ok: true });
  }

  const supabase = await createClient();

  for (const event of events) {
    try {
      const rawMessageId = event.sg_message_id;
      if (!rawMessageId) {
        console.log(
          "[sendgrid-webhook] Event missing sg_message_id, skipping:",
          event.event
        );
        continue;
      }

      // Strip .filterXXX suffix — we store the base ID
      const sgMessageId = rawMessageId.split(".")[0];

      const mapping = mapSendGridEvent(event);
      const { newStatus, terminal, bounce, isReply, isClick } = mapping;
      if (!newStatus) {
        console.log("[sendgrid-webhook] Unmapped event type, skipping:", event.event);
        continue;
      }

      // Look up the interaction by sendgrid_message_id stored in detail JSONB
      const { data: interactions, error: lookupError } = await supabase
        .from("interactions")
        .select("id, status, sequence_id, person_id, detail")
        .filter("detail->>sendgrid_message_id", "eq", sgMessageId)
        .limit(1);

      if (lookupError) {
        console.error(
          "[sendgrid-webhook] Lookup error for message id",
          sgMessageId,
          lookupError.message
        );
        continue;
      }

      if (!interactions || interactions.length === 0) {
        console.log(
          "[sendgrid-webhook] No interaction found for sg_message_id:",
          sgMessageId
        );
        continue;
      }

      const interaction = interactions[0];
      const currentStatus = interaction.status as string;
      const isTerminalUpdate = TERMINAL_STATUSES.has(newStatus);
      const isFailedUpdate = newStatus === "failed";

      if (!isTerminalUpdate && !isFailedUpdate) {
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

      // ── Update interaction status ────────────────────────────────────────
      const detailPatch: Record<string, unknown> = {
        ...((interaction.detail as Record<string, unknown> | null) ?? {}),
      };
      if (bounce) {
        detailPatch.bounce_category = bounce;
        if (event.reason) detailPatch.bounce_reason = event.reason;
        if (event.type) detailPatch.bounce_type = event.type;
      }

      const updatePayload: Record<string, unknown> = { status: newStatus };
      if (bounce) updatePayload.detail = detailPatch;

      const { error: updateError } = await supabase
        .from("interactions")
        .update(updatePayload)
        .eq("id", interaction.id);

      if (updateError) {
        console.error(
          "[sendgrid-webhook] Failed to update interaction",
          interaction.id,
          updateError.message
        );
        continue;
      }

      console.log(
        `[sendgrid-webhook] Updated interaction ${interaction.id}: ${currentStatus} -> ${newStatus}`
      );

      // ── Hard bounce / dropped → mark person email as bounced ────────────
      if (terminal && (bounce === "hard" || bounce === "dropped") && interaction.person_id) {
        const { error: personErr } = await supabase
          .from("persons")
          .update({ email_bounced_at: new Date().toISOString() })
          .eq("id", interaction.person_id);
        if (personErr) {
          console.error(
            "[sendgrid-webhook] Failed to set persons.email_bounced_at",
            interaction.person_id,
            personErr.message
          );
        } else {
          console.log(
            `[sendgrid-webhook] Person ${interaction.person_id} email_bounced_at set (${bounce})`
          );
        }
      }

      // ── Terminal bounce → mark enrollment bounced ───────────────────────
      if (terminal && interaction.sequence_id && interaction.person_id) {
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

      // ── Stop-on-reply / stop-on-click ───────────────────────────────────
      if ((isReply || isClick) && interaction.person_id) {
        await maybeStopEnrollments(
          supabase,
          interaction.person_id,
          isReply ? "reply" : "click"
        );
      }
    } catch (err) {
      console.error("[sendgrid-webhook] Unexpected error processing event:", err);
      // Continue processing remaining events
    }
  }

  // Always return 200 so SendGrid doesn't retry
  return NextResponse.json({ ok: true });
}

/**
 * For all active enrollments belonging to `personId`, look up the parent
 * sequence's schedule_config and pause the enrollment if `stop_on_reply`
 * (or `stop_on_click` for click events) is set.
 *
 * Gracefully no-ops if schedule_config is missing or the flag is absent —
 * the field is optional / new (Stream A).
 */
async function maybeStopEnrollments(
  supabase: Awaited<ReturnType<typeof createClient>>,
  personId: string,
  trigger: "reply" | "click"
) {
  try {
    const { data: enrollments, error } = await supabase
      .from("sequence_enrollments")
      .select(
        "id, sequence_id, status, sequences!inner(id, schedule_config, status)"
      )
      .eq("person_id", personId)
      .eq("status", "active");

    if (error) {
      console.error(
        "[sendgrid-webhook] Failed to load enrollments for stop-on-" + trigger,
        error.message
      );
      return;
    }

    type Row = {
      id: string;
      sequence_id: string;
      status: string;
      sequences: {
        id: string;
        status: string;
        schedule_config: { stop_on_reply?: boolean; stop_on_click?: boolean } | null;
      };
    };

    const rows = (enrollments ?? []) as unknown as Row[];

    const flagKey = trigger === "reply" ? "stop_on_reply" : "stop_on_click";

    for (const row of rows) {
      const cfg = row.sequences?.schedule_config ?? null;
      const flag = cfg ? cfg[flagKey] : false;
      if (!flag) continue;

      const { error: pauseError } = await supabase
        .from("sequence_enrollments")
        .update({ status: "paused" })
        .eq("id", row.id);

      if (pauseError) {
        console.error(
          `[sendgrid-webhook] Failed to pause enrollment ${row.id} on ${trigger}:`,
          pauseError.message
        );
      } else {
        console.log(
          `[sendgrid-webhook] Paused enrollment ${row.id} due to ${trigger} (sequence ${row.sequence_id})`
        );
      }
    }
  } catch (err) {
    // Schema may not yet have stop_on_reply / stop_on_click — never blow up the webhook.
    console.warn(
      "[sendgrid-webhook] stop-on-" + trigger + " handler swallowed error:",
      err
    );
  }
}
