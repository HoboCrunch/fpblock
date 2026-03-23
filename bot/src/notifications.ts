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
