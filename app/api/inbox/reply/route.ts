import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import {
  getInboxIdentities,
  type InboxIdentity,
} from "@/lib/inbox-sync";
import {
  getMessageIdHeader,
  submitEmail,
  type SendAddress,
} from "@/lib/fastmail";

interface ReplyBody {
  /** The identity to send from (must match a configured FASTMAIL_API_KEY_*). */
  identity: string;
  to: SendAddress[];
  cc?: SendAddress[];
  bcc?: SendAddress[];
  subject: string;
  bodyText: string;
  bodyHtml?: string | null;
  /**
   * inbound_emails.message_id of the message we're replying to. We use it to
   * look up the original's rfc822 Message-Id / References for threading.
   */
  replyToJmapId?: string | null;
}

/**
 * POST /api/inbox/reply
 *
 * Sends an email from one of the configured Fastmail identities via JMAP.
 * Threading headers are derived from the replyToJmapId target so the message
 * lands in the same conversation in the recipient's client.
 */
export async function POST(request: NextRequest) {
  let body: ReplyBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.identity || !Array.isArray(body.to) || body.to.length === 0) {
    return NextResponse.json(
      { error: "identity and to[] are required" },
      { status: 400 }
    );
  }
  if (typeof body.subject !== "string" || typeof body.bodyText !== "string") {
    return NextResponse.json(
      { error: "subject and bodyText are required" },
      { status: 400 }
    );
  }

  const identities = getInboxIdentities();
  const id: InboxIdentity | undefined = identities.find(
    (i) => i.identity.toLowerCase() === body.identity.toLowerCase()
  );
  if (!id) {
    return NextResponse.json(
      { error: `No JMAP key configured for identity ${body.identity}` },
      { status: 400 }
    );
  }

  let inReplyToMessageId: string | null = null;
  let referencesHeader: string | null = null;

  if (body.replyToJmapId) {
    try {
      const headers = await getMessageIdHeader(id.apiKey, body.replyToJmapId);
      inReplyToMessageId = headers.messageId;
      referencesHeader = headers.references;
    } catch (err) {
      console.error("[reply] failed to fetch original headers:", err);
      // Still allow the send to proceed — threading just won't link in clients.
    }
  }

  // Auto-generate a basic text→HTML body if the caller only sent text.
  const bodyHtml =
    body.bodyHtml ??
    `<div style="white-space:pre-wrap;font-family:system-ui,-apple-system,sans-serif">${escapeHtml(
      body.bodyText
    )}</div>`;

  try {
    const result = await submitEmail(id.apiKey, {
      fromIdentity: id.identity,
      to: body.to,
      cc: body.cc,
      bcc: body.bcc,
      subject: body.subject,
      bodyText: body.bodyText,
      bodyHtml,
      inReplyToMessageId,
      referencesHeader,
    });

    // Best-effort: trigger an inbox sync so the new outbound row lands in our
    // DB immediately. If this fails, the next scheduled sync will pick it up.
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const serviceKey = process.env.NEXT_SUPABASE_SECRET_KEY;
      if (supabaseUrl && serviceKey) {
        const supabase = createServiceClient(supabaseUrl, serviceKey);
        const { runInboxSync } = await import("@/lib/inbox-sync");
        await runInboxSync(supabase, [id]);
      }
    } catch (syncErr) {
      console.warn("[reply] post-send sync failed:", syncErr);
    }

    return NextResponse.json({
      ok: true,
      message_id: result.emailId,
      submission_id: result.submissionId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[reply] submit failed:", message);
    return NextResponse.json(
      { error: "Send failed", details: message },
      { status: 500 }
    );
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
