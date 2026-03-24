// bot/src/realtime.ts — Supabase Realtime subscriptions + event routing

import { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabase } from "./supabase.js";
import { BatchTracker } from "./batch-tracker.js";
import {
  sendMessage,
  editMessage,
  formatReplyNotification,
  formatBounceNotification,
  formatInteractionReplied,
  formatBatchStart,
  formatBatchProgress,
  formatBatchComplete,
  RateLimiter,
} from "./notifications.js";
import { muteState } from "./menus/settings.js";
import type { InboundEmail, Interaction, JobLog } from "./types.js";

const batchTracker = new BatchTracker();

const rateLimiter = new RateLimiter(async (msg) => {
  await sendMessage(msg);
});

let pollTimer: ReturnType<typeof setInterval> | null = null;

export function startRealtimeSubscriptions(): RealtimeChannel {
  const sb = getSupabase();

  console.log("[realtime] Setting up channel subscriptions...");

  const channel = sb
    .channel("crm-notifications")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "inbound_emails" },
      (payload) => {
        console.log("[realtime] inbound_emails INSERT received");
        handleInboundEmail(payload.new as InboundEmail);
      }
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "interactions" },
      (payload) => {
        console.log("[realtime] interactions UPDATE received:", (payload.new as any).status);
        handleInteractionUpdate(payload.new as Interaction);
      }
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "job_log" },
      (payload) => {
        console.log("[realtime] job_log INSERT received:", (payload.new as any).job_type);
        handleJobLogInsert(payload.new as JobLog);
      }
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "job_log" },
      (payload) => {
        console.log("[realtime] job_log UPDATE received:", (payload.new as any).status);
        handleJobLogUpdate(payload.new as JobLog);
      }
    )
    .subscribe((status, err) => {
      console.log(`[realtime] Subscription status: ${status}`);
      if (err) console.error("[realtime] Subscription error:", err);
    });

  pollTimer = setInterval(() => pollBatchProgress(), 5000);

  return channel;
}

export function stopRealtime(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  rateLimiter.stop();
}

// ─── Event Handlers ───

async function handleInboundEmail(email: InboundEmail): Promise<void> {
  if (!email.person_id) return;
  if (muteState.isMuted()) return;

  const sb = getSupabase();

  const { data: person } = await sb
    .from("persons")
    .select("id, full_name")
    .eq("id", email.person_id)
    .single();

  if (!person) return;

  const { data: orgLink } = await sb
    .from("person_organizations")
    .select("organizations ( name, icp_score )")
    .eq("person_id", person.id)
    .eq("is_primary", true)
    .single();

  const org = (orgLink as any)?.organizations || null;

  const msg = formatReplyNotification(
    person,
    org,
    { subject: email.subject, body_preview: email.body_preview }
  );
  rateLimiter.enqueue(msg);
}

async function handleInteractionUpdate(interaction: Interaction): Promise<void> {
  if (muteState.isMuted()) return;
  if (batchTracker.hasActiveJobs()) return;

  if (interaction.status === "bounced" || interaction.status === "replied") {
    const sb = getSupabase();

    let person: { full_name: string; id: string } | null = null;
    let org: { name: string } | null = null;

    if (interaction.person_id) {
      const { data } = await sb
        .from("persons")
        .select("id, full_name")
        .eq("id", interaction.person_id)
        .single();
      person = data;
    }

    if (interaction.organization_id) {
      const { data } = await sb
        .from("organizations")
        .select("name")
        .eq("id", interaction.organization_id)
        .single();
      org = data;
    }

    if (!person) return;

    const msg =
      interaction.status === "bounced"
        ? formatBounceNotification(person, org, {
            from_address: person.full_name,
            subject: interaction.subject,
          })
        : formatInteractionReplied(person, org, interaction.channel);

    rateLimiter.enqueue(msg);
  }
}

async function handleJobLogInsert(job: JobLog): Promise<void> {
  if (job.status !== "processing") return;

  const meta = job.metadata || {};
  const total = (meta.total as number) || 0;

  const msg = formatBatchStart(job.job_type, total);
  const messageId = await sendMessage(msg);

  if (messageId) {
    batchTracker.track(job.id, messageId);
  }
}

async function handleJobLogUpdate(job: JobLog): Promise<void> {
  if (!batchTracker.isTracking(job.id)) return;

  const messageId = batchTracker.getMessageId(job.id);
  if (!messageId) return;

  if (job.status === "completed" || job.status === "failed") {
    const meta = (job.metadata || {}) as Record<string, number>;
    const msg = formatBatchComplete(
      job.job_type,
      meta.successes || 0,
      meta.failures || 0,
      job.status === "failed" ? (job.error || "Unknown error") : undefined
    );
    await editMessage(messageId, msg);
    batchTracker.complete(job.id);
    return;
  }
}

async function pollBatchProgress(): Promise<void> {
  // Capture stale job message IDs before cleanup deletes them
  const staleIds = batchTracker.getStaleJobs();
  const staleMessages = staleIds.map((id) => ({ id, msgId: batchTracker.getMessageId(id) }));
  batchTracker.cleanupStale();
  for (const { msgId } of staleMessages) {
    if (msgId) {
      await editMessage(msgId, "⚠️ Job tracking timed out (no updates for 10 minutes)");
    }
  }

  if (!batchTracker.hasActiveJobs()) return;

  const sb = getSupabase();
  for (const jobId of batchTracker.getActiveJobIds()) {
    const { data: job } = await sb
      .from("job_log")
      .select("*")
      .eq("id", jobId)
      .single();

    if (!job) continue;

    const meta = (job.metadata || {}) as Record<string, number>;
    const done = meta.completed || meta.successes || 0;
    const total = meta.total || 0;
    if (total === 0) continue;

    const messageId = batchTracker.getMessageId(jobId);
    if (!messageId) continue;

    const msg = formatBatchProgress(job.job_type, done, total);
    const edited = await editMessage(messageId, msg);
    if (edited) batchTracker.touchLastEdit(jobId);
  }
}
