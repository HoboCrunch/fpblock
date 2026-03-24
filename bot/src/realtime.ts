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
  formatEnrichmentStart,
  formatEnrichmentProgress,
  formatEnrichmentComplete,
  RateLimiter,
} from "./notifications.js";
import { muteState } from "./menus/settings.js";
import type { InboundEmail, Interaction, JobLog } from "./types.js";

const batchTracker = new BatchTracker();

const BATCH_JOB_TYPES = ["enrichment_batch_organizations", "enrichment_batch_persons", "enrichment"];

const rateLimiter = new RateLimiter(async (msg) => {
  await sendMessage(msg);
});

let pollTimer: ReturnType<typeof setInterval> | null = null;
let activeChannel: RealtimeChannel | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
const MAX_RECONNECT_DELAY = 60_000;

function createChannel(): RealtimeChannel {
  const sb = getSupabase();

  console.log("[realtime] Setting up channel subscriptions...");

  return sb
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
    );
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  reconnectAttempt++;
  const delay = Math.min(1000 * 2 ** reconnectAttempt, MAX_RECONNECT_DELAY);
  console.log(`[realtime] Reconnecting in ${delay / 1000}s (attempt ${reconnectAttempt})...`);
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    await subscribeWithRetry();
  }, delay);
}

async function subscribeWithRetry(): Promise<void> {
  // Clean up previous channel — unsubscribe only, avoid removeChannel crash
  if (activeChannel) {
    try {
      activeChannel.unsubscribe();
    } catch (e) {
      console.warn("[realtime] Cleanup error (ignored):", e);
    }
    activeChannel = null;
  }

  const channel = createChannel();
  activeChannel = channel;

  channel.subscribe((status, err) => {
    console.log(`[realtime] Subscription status: ${status}`);
    if (err) console.error("[realtime] Subscription error:", err);

    if (status === "SUBSCRIBED") {
      reconnectAttempt = 0;
      console.log("[realtime] Connected successfully");
    } else if (status === "TIMED_OUT" || status === "CHANNEL_ERROR" || status === "CLOSED") {
      console.warn(`[realtime] Lost connection (${status}), will reconnect...`);
      scheduleReconnect();
    }
  });
}

export function startRealtimeSubscriptions(): void {
  subscribeWithRetry();
  pollTimer = setInterval(() => pollBatchProgress(), 5000);
}

export function stopRealtime(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
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
  // Only track parent batch jobs, not child enrichment jobs
  if (!BATCH_JOB_TYPES.includes(job.job_type)) return;
  if (job.status !== "processing") return;

  const meta = (job.metadata ?? {}) as Record<string, unknown>;
  const isOrg = job.job_type.includes("organization");
  const total = (isOrg ? meta.org_count : meta.person_count) as number ?? 0;
  const stages = (meta.stages as string[]) ?? ["full"];
  const targetLabel = (meta.target_label as string) ?? "";

  const text = formatEnrichmentStart(job.job_type, total, stages, targetLabel, job.id);
  const messageId = await sendMessage(text);

  if (messageId) {
    batchTracker.track(job.id, messageId, {
      total,
      jobType: job.job_type,
      createdAt: job.created_at,
      stages,
    });
  }
}

async function handleJobLogUpdate(job: JobLog): Promise<void> {
  if (!batchTracker.isTracking(job.id)) return;

  const trackedJob = batchTracker.getJob(job.id);
  if (!trackedJob) return;

  const messageId = trackedJob.messageId;

  if (job.status === "completed" || job.status === "failed") {
    const meta = (job.metadata ?? {}) as Record<string, unknown>;
    const msg = formatEnrichmentComplete(job.job_type, meta, job.id);
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
    const trackedJob = batchTracker.getJob(jobId);
    if (!trackedJob) continue;

    const isOrgJob = trackedJob.jobType.includes("organization");

    // Query child jobs created around the same time as the parent batch
    const startTime = new Date(
      new Date(trackedJob.createdAt).getTime() - 5000
    ).toISOString();

    const { data: children } = await sb
      .from("job_log")
      .select("target_id, status, job_type, metadata")
      .eq("target_table", isOrgJob ? "organizations" : "contacts")
      .in("job_type", [
        "enrichment_full",
        "enrichment_apollo",
        "enrichment_perplexity",
        "enrichment_gemini",
        "enrichment_people_finder",
      ])
      .gte("created_at", startTime)
      .neq("id", jobId)
      .limit(500);

    if (!children) continue;

    // Deduplicate by target_id — keep terminal status over "processing"
    const byTarget = new Map<string, string>();
    // Aggregate per-stage completion and metrics
    const stageComplete = new Map<string, number>(); // stage -> count of orgs completed
    let icpScored = 0;
    let signalsCreated = 0;
    let peopleFound = 0;

    for (const child of children) {
      if (!child.target_id) continue;
      const childMeta = (child.metadata ?? {}) as Record<string, unknown>;

      // Track overall completion per target
      const existing = byTarget.get(child.target_id);
      if (!existing || (existing === "processing" && child.status !== "processing")) {
        byTarget.set(child.target_id, child.status);
      }

      // Track per-stage completion
      if (child.status === "completed") {
        const stage = child.job_type.replace("enrichment_", "");
        stageComplete.set(stage, (stageComplete.get(stage) ?? 0) + 1);

        // Aggregate metrics from completed stages
        if (child.job_type === "enrichment_gemini" && childMeta.icp_score != null) {
          icpScored++;
        }
        if (child.job_type === "enrichment_gemini") {
          signalsCreated += (childMeta.signals_created as number) ?? 0;
        }
        if (child.job_type === "enrichment_people_finder") {
          peopleFound += (childMeta.found as number) ?? (childMeta.people_found as number) ?? 0;
        }
      }
    }

    const completed = Array.from(byTarget.values()).filter((s) => s === "completed").length;
    const failed = Array.from(byTarget.values()).filter((s) => s === "failed").length;
    const total = trackedJob.total;

    if (total === 0) continue;

    // Only edit if progress actually changed and throttle is satisfied
    if (!batchTracker.shouldUpdate(jobId, completed + failed)) continue;

    // Determine which stages are fully complete (all orgs done for that stage)
    const completedStages = new Set<string>();
    const doneCount = completed + failed;
    for (const [stage, count] of stageComplete) {
      if (count >= doneCount && doneCount > 0) completedStages.add(stage);
    }

    // Fetch parent job metadata for target_label
    const { data: parentJob } = await sb
      .from("job_log")
      .select("metadata")
      .eq("id", jobId)
      .single();
    const parentMeta = (parentJob?.metadata ?? {}) as Record<string, unknown>;
    const targetLabel = (parentMeta.target_label as string) ?? "";

    const msg = formatEnrichmentProgress(
      total,
      trackedJob.stages,
      targetLabel,
      jobId,
      isOrgJob,
      { completed, failed, completedStages, icpScored, signalsCreated, peopleFound }
    );
    await editMessage(trackedJob.messageId, msg);
  }
}
