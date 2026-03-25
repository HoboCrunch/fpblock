import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/sendgrid";

export const maxDuration = 60;

interface InteractionRow {
  id: string;
  person_id: string;
  sequence_id: string;
  subject: string | null;
  body: string | null;
  detail: Record<string, unknown> | null;
  persons: {
    id: string;
    email: string | null;
  };
  sequences: {
    id: string;
    sender_id: string | null;
    sender_profiles: {
      id: string;
      email: string;
      name: string;
    } | null;
  };
}

export async function POST() {
  const supabase = await createClient();

  // Query scheduled interactions that are due
  const { data: interactions, error: fetchError } = await supabase
    .from("interactions")
    .select(
      "id, person_id, sequence_id, subject, body, detail, persons!inner(id, email), sequences!inner(id, sender_id, sender_profiles(id, email, name))"
    )
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString())
    .limit(50);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const rows = (interactions ?? []) as unknown as InteractionRow[];
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const interaction of rows) {
    const person = interaction.persons;
    const senderProfile = interaction.sequences?.sender_profiles;

    // Skip if no email
    if (!person.email) {
      await supabase
        .from("interactions")
        .update({
          status: "failed",
          detail: {
            ...(interaction.detail ?? {}),
            error: "No email address",
          },
        })
        .eq("id", interaction.id);
      skipped++;
      continue;
    }

    // Skip if no sender profile
    if (!senderProfile) {
      await supabase
        .from("interactions")
        .update({
          status: "failed",
          detail: {
            ...(interaction.detail ?? {}),
            error: "No sender profile configured for sequence",
          },
        })
        .eq("id", interaction.id);
      skipped++;
      continue;
    }

    // Mark as sending
    await supabase
      .from("interactions")
      .update({ status: "sending" })
      .eq("id", interaction.id);

    // Attempt to send
    const result = await sendEmail({
      to: person.email,
      from: { email: senderProfile.email, name: senderProfile.name },
      subject: interaction.subject || "(no subject)",
      html: interaction.body || "",
      replyTo: senderProfile.email,
    });

    if (result.success) {
      await supabase
        .from("interactions")
        .update({
          status: "sent",
          occurred_at: new Date().toISOString(),
          detail: {
            ...(interaction.detail ?? {}),
            sendgrid_message_id: result.messageId ?? null,
          },
        })
        .eq("id", interaction.id);
      sent++;
    } else {
      const currentDetail = interaction.detail ?? {};
      const retryCount = typeof currentDetail.retry_count === "number"
        ? currentDetail.retry_count
        : 0;

      if (retryCount < 3) {
        const nextRetry = retryCount + 1;
        const backoffMs = nextRetry * 5 * 60 * 1000; // retry_count * 5 minutes
        const nextScheduledAt = new Date(Date.now() + backoffMs).toISOString();

        await supabase
          .from("interactions")
          .update({
            status: "scheduled",
            scheduled_at: nextScheduledAt,
            detail: {
              ...currentDetail,
              retry_count: nextRetry,
              last_error: result.error,
            },
          })
          .eq("id", interaction.id);
      } else {
        await supabase
          .from("interactions")
          .update({
            status: "failed",
            detail: {
              ...currentDetail,
              retry_count: retryCount,
              last_error: result.error,
            },
          })
          .eq("id", interaction.id);
        failed++;
      }
    }
  }

  return NextResponse.json({ sent, failed, skipped });
}
