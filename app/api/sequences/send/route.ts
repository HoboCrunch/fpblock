import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/sendgrid";
import { sendTelegramNotification } from "@/lib/telegram";
import type { SequenceSchedule } from "@/lib/types/database";

export const maxDuration = 60;

const CLAIM_LIMIT = 50;
const STUCK_MINUTES = 10;

interface ClaimedInteraction {
  id: string;
  person_id: string;
  sequence_id: string;
  subject: string | null;
  body: string | null;
  detail: Record<string, unknown> | null;
}

interface JoinedInteraction extends ClaimedInteraction {
  persons: {
    id: string;
    email: string | null;
    full_name: string | null;
  };
  sequences: {
    id: string;
    name: string | null;
    sender_id: string | null;
    schedule_config: SequenceSchedule | null;
    sender_profiles: {
      id: string;
      email: string;
      name: string;
    } | null;
  };
}

interface TerminalFailure {
  interactionId: string;
  personName: string | null;
  personEmail: string | null;
  sequenceName: string | null;
  reason: string;
  kind: "send_failure" | "missing_email" | "missing_sender" | "stuck_sweep";
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

/**
 * Classify a SendGrid failure to decide retry behavior.
 *
 * - 4xx (except 408 timeout and 429 rate-limit): permanent client error, no retry.
 * - 5xx, 408, 429, or network errors (no statusCode): transient, retry with backoff.
 */
function isPermanentFailure(statusCode: number | undefined): boolean {
  if (statusCode === undefined) return false; // network/timeout — retry
  if (statusCode === 408 || statusCode === 429) return false;
  return statusCode >= 400 && statusCode < 500;
}

/** Backoff schedule for transient failures, in minutes. */
const RETRY_BACKOFFS_MINUTES = [5, 30, 120];

// ─── Cron auth + service client ──────────────────────────────────────────────
// Invoked unattended by Vercel Cron (GET). The atomic-claim RPCs and the
// interactions table are not reachable by the anon role, so we use a
// service-role client gated by CRON_SECRET (matching cron/inbox-sync).

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } }
  );
}

type ServiceClient = ReturnType<typeof serviceClient>;

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runSend(serviceClient());
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runSend(serviceClient());
}

async function runSend(supabase: ServiceClient) {

  const terminalFailures: TerminalFailure[] = [];

  // ── 1) Stuck-row sweep ────────────────────────────────────────────────────
  // Reverts any 'sending' row older than STUCK_MINUTES to 'scheduled'.
  // Crashed handlers, function timeouts, and any residual race condition
  // would otherwise leave rows stuck mid-flight forever.
  const { data: sweptData, error: sweepError } = await supabase.rpc(
    "reclaim_stuck_interactions",
    { p_stuck_minutes: STUCK_MINUTES }
  );
  if (sweepError) {
    console.error("[sequences/send] sweeper failed:", sweepError.message);
  }
  const swept = (sweptData ?? []) as ClaimedInteraction[];
  if (swept.length > 0) {
    console.log(`[sequences/send] swept ${swept.length} stuck row(s)`);
    // Surface the sweep via Telegram alongside terminal failures.
    for (const row of swept) {
      terminalFailures.push({
        interactionId: row.id,
        personName: null,
        personEmail: null,
        sequenceName: null,
        reason: "Row stuck in 'sending' — reverted to scheduled",
        kind: "stuck_sweep",
      });
    }
  }

  // ── 2) Atomic claim ───────────────────────────────────────────────────────
  // Single SQL statement flips up to CLAIM_LIMIT due rows from 'scheduled' to
  // 'sending' via FOR UPDATE SKIP LOCKED, so overlapping invocations claim
  // disjoint sets.
  const { data: claimedData, error: claimError } = await supabase.rpc(
    "claim_due_interactions",
    { p_limit: CLAIM_LIMIT }
  );
  if (claimError) {
    return NextResponse.json({ error: claimError.message }, { status: 500 });
  }
  const claimed = (claimedData ?? []) as ClaimedInteraction[];

  if (claimed.length === 0) {
    await maybeNotify(terminalFailures);
    return NextResponse.json({ sent: 0, failed: 0, skipped: 0, deferred: 0, swept: swept.length });
  }

  // Hydrate joined data for the claimed ids.
  const claimedIds = claimed.map((c) => c.id);
  const { data: hydratedData, error: hydrateError } = await supabase
    .from("interactions")
    .select(
      "id, person_id, sequence_id, subject, body, detail, persons!inner(id, email, full_name), sequences!inner(id, name, sender_id, schedule_config, sender_profiles(id, email, name))"
    )
    .in("id", claimedIds);

  if (hydrateError) {
    // The rows are still 'sending'; the sweeper will recover them on the next run.
    return NextResponse.json({ error: hydrateError.message }, { status: 500 });
  }
  const rows = (hydratedData ?? []) as unknown as JoinedInteraction[];

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

  /**
   * Defer a claimed row back to 'scheduled' for later. Resets status because
   * the atomic claim already flipped it to 'sending'.
   */
  async function deferInteraction(
    interactionId: string,
    minutes: number,
    reason: string
  ) {
    const next = new Date(Date.now() + minutes * 60 * 1000).toISOString();
    await supabase
      .from("interactions")
      .update({ status: "scheduled", scheduled_at: next })
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

    // Skip if no email — terminal.
    if (!person.email) {
      await supabase
        .from("interactions")
        .update({
          status: "failed",
          occurred_at: new Date().toISOString(),
          detail: {
            ...(interaction.detail ?? {}),
            error: "No email address",
          },
        })
        .eq("id", interaction.id);
      skipped++;
      terminalFailures.push({
        interactionId: interaction.id,
        personName: person.full_name,
        personEmail: null,
        sequenceName: interaction.sequences?.name ?? null,
        reason: "No email address on person",
        kind: "missing_email",
      });
      continue;
    }

    // Skip if no sender profile — terminal.
    if (!senderProfile) {
      await supabase
        .from("interactions")
        .update({
          status: "failed",
          occurred_at: new Date().toISOString(),
          detail: {
            ...(interaction.detail ?? {}),
            error: "No sender profile configured for sequence",
          },
        })
        .eq("id", interaction.id);
      skipped++;
      terminalFailures.push({
        interactionId: interaction.id,
        personName: person.full_name,
        personEmail: person.email,
        sequenceName: interaction.sequences?.name ?? null,
        reason: "No sender profile configured for sequence",
        kind: "missing_sender",
      });
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

    // Attempt to send. Status is already 'sending' from the atomic claim.
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
      todayCounts.set(
        interaction.sequence_id,
        (todayCounts.get(interaction.sequence_id) ?? 0) + 1
      );
      continue;
    }

    // Failure path: classify, then retry-with-backoff or fail terminally.
    const currentDetail = interaction.detail ?? {};
    const retryCount =
      typeof currentDetail.retry_count === "number" ? currentDetail.retry_count : 0;
    const permanent = isPermanentFailure(result.statusCode);
    const exhausted = retryCount >= RETRY_BACKOFFS_MINUTES.length;

    if (permanent || exhausted) {
      await supabase
        .from("interactions")
        .update({
          status: "failed",
          occurred_at: new Date().toISOString(),
          detail: {
            ...currentDetail,
            retry_count: retryCount,
            last_error: result.error,
            last_status_code: result.statusCode ?? null,
            terminal_reason: permanent ? "permanent_4xx" : "retries_exhausted",
          },
        })
        .eq("id", interaction.id);
      failed++;
      terminalFailures.push({
        interactionId: interaction.id,
        personName: person.full_name,
        personEmail: person.email,
        sequenceName: interaction.sequences?.name ?? null,
        reason: `${permanent ? `Permanent error (HTTP ${result.statusCode})` : "Retries exhausted"}: ${result.error?.slice(0, 200) ?? "unknown"}`,
        kind: "send_failure",
      });
    } else {
      const nextRetry = retryCount + 1;
      const backoffMinutes =
        RETRY_BACKOFFS_MINUTES[retryCount] ??
        RETRY_BACKOFFS_MINUTES[RETRY_BACKOFFS_MINUTES.length - 1];
      const nextScheduledAt = new Date(
        Date.now() + backoffMinutes * 60 * 1000
      ).toISOString();

      await supabase
        .from("interactions")
        .update({
          status: "scheduled",
          scheduled_at: nextScheduledAt,
          detail: {
            ...currentDetail,
            retry_count: nextRetry,
            last_error: result.error,
            last_status_code: result.statusCode ?? null,
          },
        })
        .eq("id", interaction.id);
    }
  }

  await maybeNotify(terminalFailures);
  return NextResponse.json({
    sent,
    failed,
    skipped,
    deferred,
    swept: swept.length,
  });
}

async function maybeNotify(failures: TerminalFailure[]) {
  if (failures.length === 0) return;

  const lines: string[] = [
    `⚠️ <b>Sequence dispatcher: ${failures.length} issue${failures.length === 1 ? "" : "s"}</b>`,
  ];

  const sendFailures = failures.filter((f) => f.kind === "send_failure");
  const sweeps = failures.filter((f) => f.kind === "stuck_sweep");
  const missing = failures.filter(
    (f) => f.kind === "missing_email" || f.kind === "missing_sender"
  );

  if (sendFailures.length > 0) {
    lines.push("");
    lines.push(`<b>Send failures (${sendFailures.length})</b>`);
    for (const f of sendFailures.slice(0, 5)) {
      const who = f.personName || f.personEmail || f.interactionId.slice(0, 8);
      const seq = f.sequenceName ? ` · ${f.sequenceName}` : "";
      lines.push(`• ${who}${seq} — ${f.reason}`);
    }
    if (sendFailures.length > 5) {
      lines.push(`• …and ${sendFailures.length - 5} more`);
    }
  }

  if (sweeps.length > 0) {
    lines.push("");
    lines.push(`<b>Stuck rows reclaimed (${sweeps.length})</b>`);
    lines.push("Rows reverted from 'sending' to 'scheduled' after sitting >10m.");
  }

  if (missing.length > 0) {
    lines.push("");
    lines.push(`<b>Config gaps (${missing.length})</b>`);
    for (const f of missing.slice(0, 3)) {
      const who = f.personName || f.personEmail || f.interactionId.slice(0, 8);
      lines.push(`• ${who} — ${f.reason}`);
    }
    if (missing.length > 3) {
      lines.push(`• …and ${missing.length - 3} more`);
    }
  }

  lines.push("");
  lines.push("→ /admin/sequences/failures");

  await sendTelegramNotification(lines.join("\n"));
}
