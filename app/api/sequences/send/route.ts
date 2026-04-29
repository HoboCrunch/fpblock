import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/sendgrid";
import type { SequenceSchedule } from "@/lib/types/database";

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
    schedule_config: SequenceSchedule | null;
    sender_profiles: {
      id: string;
      email: string;
      name: string;
    } | null;
  };
}

/** Start of the current UTC day, ISO. */
function utcDayStartIso(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  ).toISOString();
}

/** Hour 0-23 of `date` in the given IANA timezone. */
function getZonedHour(date: Date, timeZone: string): number {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      hour: "2-digit",
    });
    const h = parseInt(fmt.format(date), 10);
    return Number.isFinite(h) ? (h === 24 ? 0 : h) : date.getUTCHours();
  } catch {
    return date.getUTCHours();
  }
}

/** Quiet window [start, end) wraps at midnight when start > end (e.g. 22..7). */
function isInQuietWindow(hour: number, start: number, end: number): boolean {
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

/**
 * Minutes from `now` until zoned hour first equals `endHour`, capped at 24h.
 * Walks 30-minute candidates forward.
 */
function minutesUntilHour(now: Date, endHour: number, timeZone: string): number {
  for (let step = 1; step <= 48; step++) {
    const minutesAhead = step * 30;
    const candidate = new Date(now.getTime() + minutesAhead * 60 * 1000);
    if (getZonedHour(candidate, timeZone) === endHour) return minutesAhead;
  }
  return 60;
}

export async function POST() {
  const supabase = await createClient();

  // Query scheduled interactions that are due
  const { data: interactions, error: fetchError } = await supabase
    .from("interactions")
    .select(
      "id, person_id, sequence_id, subject, body, detail, persons!inner(id, email), sequences!inner(id, sender_id, schedule_config, sender_profiles(id, email, name))"
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
  let deferred = 0;

  // Per-sequence today's-send-count cache (avoid re-querying inside the loop).
  const todayCounts = new Map<string, number>();
  const dayStart = utcDayStartIso();

  async function getTodayCount(sequenceId: string): Promise<number> {
    const cached = todayCounts.get(sequenceId);
    if (cached !== undefined) return cached;

    const { count, error } = await supabase
      .from("interactions")
      .select("id", { count: "exact", head: true })
      .eq("sequence_id", sequenceId)
      .in("status", ["sent", "delivered", "opened", "clicked", "replied"])
      .gte("occurred_at", dayStart);

    if (error) {
      console.warn(
        "[sequences/send] today-count query failed for sequence",
        sequenceId,
        error.message
      );
      return 0;
    }
    const n = count ?? 0;
    todayCounts.set(sequenceId, n);
    return n;
  }

  async function deferInteraction(
    interactionId: string,
    minutes: number,
    reason: string
  ) {
    const next = new Date(Date.now() + minutes * 60 * 1000).toISOString();
    await supabase
      .from("interactions")
      .update({ scheduled_at: next })
      .eq("id", interactionId);
    deferred++;
    console.log(
      `[sequences/send] deferred interaction ${interactionId} by ${minutes}m — ${reason}`
    );
  }

  for (const interaction of rows) {
    const person = interaction.persons;
    const senderProfile = interaction.sequences?.sender_profiles;
    const schedule = interaction.sequences?.schedule_config ?? null;

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

    // ── Throttle / pacing checks (back-compat: skip if fields undefined) ────
    if (schedule) {
      // Quiet hours (local to schedule timezone)
      const quiet = schedule.quiet_hours_local;
      if (
        quiet &&
        typeof quiet.start === "number" &&
        typeof quiet.end === "number"
      ) {
        const tz = schedule.send_window?.timezone ?? "UTC";
        const now = new Date();
        const hour = getZonedHour(now, tz);
        if (isInQuietWindow(hour, quiet.start, quiet.end)) {
          const wait = minutesUntilHour(now, quiet.end, tz);
          await deferInteraction(
            interaction.id,
            wait,
            `quiet_hours_local ${quiet.start}-${quiet.end} (${tz}); current=${hour}`
          );
          continue;
        }
      }

      // Per-sequence daily throttle
      const throttle = schedule.throttle_per_day;
      if (typeof throttle === "number" && throttle > 0) {
        const todayN = await getTodayCount(interaction.sequence_id);
        if (todayN >= throttle) {
          await deferInteraction(
            interaction.id,
            60,
            `sequence ${interaction.sequence_id} hit throttle_per_day=${throttle} (today=${todayN})`
          );
          continue;
        }
      }

      // Global daily cap (across all sequences)
      const globalCap = schedule.daily_send_cap_global;
      if (typeof globalCap === "number" && globalCap > 0) {
        const { count: globalCount, error: globalErr } = await supabase
          .from("interactions")
          .select("id", { count: "exact", head: true })
          .in("status", ["sent", "delivered", "opened", "clicked", "replied"])
          .gte("occurred_at", dayStart);

        if (!globalErr && (globalCount ?? 0) >= globalCap) {
          await deferInteraction(
            interaction.id,
            60,
            `daily_send_cap_global=${globalCap} hit (today=${globalCount})`
          );
          continue;
        }
      }

      // Per-recipient minimum interval
      const minInterval = schedule.min_interval_minutes;
      if (typeof minInterval === "number" && minInterval > 0) {
        const cutoff = new Date(
          Date.now() - minInterval * 60 * 1000
        ).toISOString();
        const { data: recent } = await supabase
          .from("interactions")
          .select("id, occurred_at")
          .eq("person_id", interaction.person_id)
          .in("status", ["sent", "delivered", "opened", "clicked", "replied"])
          .gte("occurred_at", cutoff)
          .limit(1);

        if (recent && recent.length > 0) {
          await deferInteraction(
            interaction.id,
            minInterval,
            `min_interval_minutes=${minInterval} not yet elapsed for person ${interaction.person_id}`
          );
          continue;
        }
      }
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
      // Bump today-count cache so subsequent iterations see it.
      todayCounts.set(
        interaction.sequence_id,
        (todayCounts.get(interaction.sequence_id) ?? 0) + 1
      );
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

  return NextResponse.json({ sent, failed, skipped, deferred });
}
