// lib/telegram.ts — Telegram Bot API notifications

interface TelegramSendResult {
  ok: boolean;
  description?: string;
}

/**
 * Send a text message to the configured Telegram chat.
 * Gracefully no-ops if env vars are not set.
 */
export async function sendTelegramNotification(
  message: string
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn(
      "[telegram] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — skipping notification"
    );
    return false;
  }

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      }
    );

    const data: TelegramSendResult = await res.json();
    if (!data.ok) {
      console.error("[telegram] Send failed:", data.description);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[telegram] Network error:", err);
    return false;
  }
}

/**
 * Format a reply notification for when a pipeline contact replies via email.
 */
export function formatReplyNotification(
  contact: { full_name: string; id: string },
  company: { name: string; icp_score: number | null } | null,
  email: { subject: string | null; body_preview: string | null }
): string {
  const companyName = company?.name || "Unknown Company";
  const icpScore = company?.icp_score ?? "N/A";
  const preview = email.body_preview?.slice(0, 100) || "(no preview)";
  const subject = email.subject || "(no subject)";

  return [
    `📬 Reply from ${contact.full_name} (${companyName})`,
    `ICP: ${icpScore} | Channel: Email`,
    `Subject: ${subject}`,
    `Preview: ${preview}`,
    `→ /admin/contacts/${contact.id}`,
  ].join("\n");
}

/**
 * Format a notification for when an enrichment job completes.
 */
export function formatEnrichmentNotification(results: {
  job_type: string;
  total_processed: number;
  successes: number;
  failures: number;
}): string {
  return [
    `✅ Enrichment Complete: ${results.job_type}`,
    `Processed: ${results.total_processed}`,
    `Success: ${results.successes} | Failed: ${results.failures}`,
  ].join("\n");
}

/**
 * Format a notification for when a bounce is detected.
 */
export function formatBounceNotification(
  contact: { full_name: string; id: string },
  company: { name: string } | null,
  email: { subject: string | null; from_address: string }
): string {
  const companyName = company?.name || "Unknown Company";

  return [
    `⚠️ Bounce Detected: ${contact.full_name} (${companyName})`,
    `From: ${email.from_address}`,
    `Subject: ${email.subject || "(no subject)"}`,
    `→ /admin/contacts/${contact.id}`,
  ].join("\n");
}
