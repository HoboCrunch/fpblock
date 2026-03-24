// bot/src/notifications.ts — Message formatting, send/edit, rate limiter queue

const BOT_TOKEN = () => process.env.TELEGRAM_BOT_TOKEN!;
const CHAT_ID = () => process.env.TELEGRAM_CHAT_ID!;
const TG_API = () => `https://api.telegram.org/bot${BOT_TOKEN()}`;

// ─── Telegram API helpers ───

export async function sendMessage(text: string): Promise<number | null> {
  try {
    const res = await fetch(`${TG_API()}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID(),
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error("[tg] sendMessage failed:", data.description);
      return null;
    }
    return data.result.message_id;
  } catch (err) {
    console.error("[tg] sendMessage error:", err);
    return null;
  }
}

export async function editMessage(messageId: number, text: string): Promise<boolean> {
  try {
    const res = await fetch(`${TG_API()}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID(),
        message_id: messageId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error("[tg] editMessage failed:", data.description);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[tg] editMessage error:", err);
    return false;
  }
}

// ─── Rate Limiter ───

export class RateLimiter {
  private queue: string[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private processor: (msg: string) => Promise<void>;

  constructor(processor: (msg: string) => Promise<void>, intervalMs = 1000) {
    this.processor = processor;
    this.timer = setInterval(() => this.flush(), intervalMs);
  }

  get queueSize(): number {
    return this.queue.length;
  }

  private collapsed = false;

  enqueue(message: string): void {
    this.queue.push(message);
    if (this.queue.length > 50 || this.collapsed) {
      this.collapsed = true;
      const count = this.queue.length;
      this.queue = [`📋 ${count} notifications queued — showing summary:\n\nToo many events to display individually. Check the dashboard for details.`];
    }
  }

  private async flush(): Promise<void> {
    const msg = this.queue.shift();
    if (msg) {
      await this.processor(msg);
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

// ─── Formatters ───

export function formatReplyNotification(
  contact: { full_name: string; id: string },
  org: { name: string; icp_score: number | null } | null,
  email: { subject: string | null; body_preview: string | null }
): string {
  const orgName = org?.name || "Unknown Company";
  const icp = org?.icp_score ?? "N/A";
  const preview = email.body_preview?.slice(0, 100) || "(no preview)";
  const subject = email.subject || "(no subject)";

  return [
    `📬 <b>Reply from ${contact.full_name}</b> (${orgName})`,
    `ICP: ${icp} | Channel: Email`,
    `Subject: ${subject}`,
    `Preview: ${preview}`,
  ].join("\n");
}

export function formatBounceNotification(
  contact: { full_name: string; id: string },
  org: { name: string } | null,
  email: { from_address: string; subject: string | null }
): string {
  const orgName = org?.name || "Unknown Company";

  return [
    `⚠️ <b>Bounce Detected:</b> ${contact.full_name} (${orgName})`,
    `From: ${email.from_address}`,
    `Subject: ${email.subject || "(no subject)"}`,
  ].join("\n");
}

export function formatInteractionReplied(
  contact: { full_name: string },
  org: { name: string } | null,
  channel: string | null
): string {
  const orgName = org?.name || "Unknown";
  return `💬 <b>${contact.full_name}</b> (${orgName}) replied via ${channel || "unknown"}`;
}

// ─── Legacy batch formatters (kept for backward compatibility) ───

export function formatBatchStart(jobType: string, total: number): string {
  return `⏳ <b>${jobType}</b> — processing ${total} items...`;
}

export function formatBatchProgress(jobType: string, done: number, total: number): string {
  const pct = Math.round((done / total) * 100);
  const bar = "█".repeat(Math.floor(pct / 10)) + "░".repeat(10 - Math.floor(pct / 10));
  return `⏳ <b>${jobType}</b>\n${bar} ${done}/${total} (${pct}%)`;
}

export function formatBatchComplete(
  jobType: string,
  successes: number,
  failures: number,
  error?: string
): string {
  if (error) {
    return `❌ <b>${jobType} Failed</b>\nError: ${error}\nSuccesses: ${successes} | Failures: ${failures}`;
  }
  return `✅ <b>${jobType} Complete</b>\nSuccesses: ${successes} | Failures: ${failures}`;
}

// ─── Enrichment-specific formatters ───

const APP_URL = () => process.env.APP_URL ?? "https://gofpblock.com";

function stageCheck(label: string, done: boolean): string {
  return done ? `✅ ${label}` : `☐ ${label}`;
}

function stageChecklist(stages: string[], completedStages?: Set<string>): string {
  const done = completedStages ?? new Set<string>();
  const labels: [string, string][] = [];
  const hasFullPipeline = stages.includes("full");
  if (hasFullPipeline || stages.includes("apollo")) labels.push(["apollo", "Firmographics"]);
  if (hasFullPipeline || stages.includes("perplexity")) labels.push(["perplexity", "Research"]);
  if (hasFullPipeline || stages.includes("gemini")) labels.push(["gemini", "ICP Score"]);
  if (stages.includes("people_finder")) labels.push(["people_finder", "People Finder"]);
  return labels.map(([key, label]) => stageCheck(label, done.has(key))).join("  ");
}

function formatDuration(ms: number): string | null {
  if (ms <= 0) return null;
  if (ms >= 60000) return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  return `${(ms / 1000).toFixed(0)}s`;
}

export interface EnrichmentProgressStats {
  completed: number;
  failed: number;
  completedStages: Set<string>;
  icpScored: number;
  signalsCreated: number;
  peopleFound: number;
}

export function formatEnrichmentStart(
  jobType: string,
  total: number,
  stages: string[],
  targetLabel: string,
  jobId: string
): string {
  const isOrg = jobType.includes("organization");
  const entity = isOrg ? "companies" : "persons";
  const link = `<a href="${APP_URL()}/admin/enrichment/${jobId}">View job</a>`;

  return [
    `⏳ <b>${isOrg ? "Org" : "Person"} Enrichment</b>  ${link}`,
    ``,
    `${total} ${entity} · ${targetLabel}`,
    stageChecklist(stages),
  ].join("\n");
}

export function formatEnrichmentProgress(
  total: number,
  stages: string[],
  targetLabel: string,
  jobId: string,
  isOrg: boolean,
  stats: EnrichmentProgressStats
): string {
  const done = stats.completed + stats.failed;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const bar = "█".repeat(Math.floor(pct / 10)) + "░".repeat(10 - Math.floor(pct / 10));
  const entity = isOrg ? "companies" : "persons";
  const link = `<a href="${APP_URL()}/admin/enrichment/${jobId}">View job</a>`;

  const lines = [
    `⏳ <b>${isOrg ? "Org" : "Person"} Enrichment</b>  ${link}`,
    ``,
    `${total} ${entity} · ${targetLabel}`,
    stageChecklist(stages, stats.completedStages),
    ``,
    `${bar} ${pct}%  (${done}/${total})`,
  ];

  const metrics: string[] = [];
  if (stats.completed > 0) metrics.push(`${stats.completed} enriched`);
  if (stats.failed > 0) metrics.push(`${stats.failed} failed`);
  if (metrics.length > 0) lines.push(metrics.join(" · "));

  const details: string[] = [];
  if (stats.icpScored > 0) details.push(`${stats.icpScored} ICP scored`);
  if (stats.signalsCreated > 0) details.push(`${stats.signalsCreated} signals`);
  if (stats.peopleFound > 0) details.push(`${stats.peopleFound} people found`);
  if (details.length > 0) lines.push(details.join(" · "));

  return lines.join("\n");
}

export function formatEnrichmentComplete(
  jobType: string,
  meta: Record<string, unknown>,
  jobId: string
): string {
  const isOrg = jobType.includes("organization");
  const durationMs = (meta.duration_ms as number) ?? 0;
  const error = (meta.error as string) ?? null;
  const duration = formatDuration(durationMs);
  const link = `<a href="${APP_URL()}/admin/enrichment/${jobId}">View results</a>`;

  const lines: string[] = [];

  if (isOrg) {
    const total = (meta.org_count as number) ?? 0;
    const enriched = (meta.orgs_enriched as number) ?? 0;
    const failed = (meta.orgs_failed as number) ?? 0;
    const signals = (meta.signals_created as number) ?? 0;
    const people = (meta.people_found as number) ?? 0;
    const peopleCreated = (meta.people_created as number) ?? 0;
    const peopleMerged = (meta.people_merged as number) ?? 0;
    const stages = (meta.stages as string[]) ?? ["full"];
    const targetLabel = (meta.target_label as string) ?? "";

    const icon = (error || failed > enriched) ? "❌" : "✅";
    lines.push(`${icon} <b>Org Enrichment ${error ? "Failed" : "Complete"}</b>  ${link}`);
    if (error) lines.push(`⚠️ ${error}`);
    lines.push(``);
    lines.push(`${total} companies · ${targetLabel}`);
    // All stages considered complete for final message
    const allStages = new Set(["apollo", "perplexity", "gemini", "people_finder"]);
    lines.push(stageChecklist(stages, allStages));
    lines.push(``);

    lines.push(`<b>Results</b>`);
    lines.push(`${enriched} enriched · ${failed} failed`);
    if (signals > 0) lines.push(`${signals} signals created`);
    if (people > 0) {
      let peopleLine = `${people} people found`;
      if (peopleCreated > 0) peopleLine += ` · ${peopleCreated} new`;
      if (peopleMerged > 0) peopleLine += ` · ${peopleMerged} merged`;
      lines.push(peopleLine);
    }
  } else {
    const total = (meta.person_count as number) ?? 0;
    const enriched = (meta.persons_enriched as number) ?? 0;
    const failed = (meta.persons_failed as number) ?? 0;
    const orgsCreated = (meta.orgs_created as number) ?? 0;
    const targetLabel = (meta.target_label as string) ?? "";

    const icon = (error || failed > enriched) ? "❌" : "✅";
    lines.push(`${icon} <b>Person Enrichment ${error ? "Failed" : "Complete"}</b>  ${link}`);
    if (error) lines.push(`⚠️ ${error}`);
    lines.push(``);
    lines.push(`${total} persons · ${targetLabel}`);
    lines.push(``);

    lines.push(`<b>Results</b>`);
    lines.push(`${enriched} enriched · ${failed} failed`);
    if (orgsCreated > 0) lines.push(`${orgsCreated} new orgs linked`);
  }

  if (duration) lines.push(`⏱ ${duration}`);
  return lines.join("\n");
}
