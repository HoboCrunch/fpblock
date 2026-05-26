// Server-only: imports next/headers, which is unavailable in client bundles.
import { headers } from "next/headers";

/**
 * Eagerly kick off message generation for a sequence.
 *
 * Issues an async-mode POST to /api/sequences/generate (carrying CRON_SECRET),
 * which authorizes, returns 202 immediately, and runs runGenerate inside
 * after() with the full route budget. We do not await generation — only the
 * 202.
 *
 * Errors are swallowed (logged, not thrown): a failed trigger must never block
 * the calling server action. The generate cron (every 5 minutes) is the
 * backstop and will pick up any ungenerated steps (idempotent).
 */
export async function triggerSequenceGeneration(
  sequenceId: string
): Promise<void> {
  try {
    const h = await headers();
    const host = h.get("host") ?? "";
    const proto = host.startsWith("localhost")
      ? "http"
      : h.get("x-forwarded-proto") ?? "https";
    const url = `${proto}://${host}/api/sequences/generate`;

    await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.CRON_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sequenceId, async: true }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[triggerSequenceGeneration] failed for sequence ${sequenceId} (cron backstop will cover): ${message}`
    );
  }
}
