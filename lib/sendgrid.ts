import { EventWebhook } from "@sendgrid/eventwebhook";

export interface SendEmailParams {
  to: string;
  from: { email: string; name: string };
  subject: string;
  html: string;
  replyTo?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  /**
   * HTTP status code from SendGrid, or undefined for pre-flight failures
   * (missing API key) and network errors caught in the catch block.
   * 4xx (except 408/429) = client error, no retry. 5xx/timeout = retry.
   */
  statusCode?: number;
}

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    return { success: false, error: "SENDGRID_API_KEY is not set" };
  }

  const body: Record<string, unknown> = {
    personalizations: [{ to: [{ email: params.to }] }],
    from: { email: params.from.email, name: params.from.name },
    subject: params.subject,
    content: [{ type: "text/html", value: params.html }],
  };

  if (params.replyTo) {
    body.reply_to = { email: params.replyTo };
  }

  try {
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const success = response.ok || response.status === 202;
    const messageId = response.headers.get("x-message-id") ?? undefined;

    if (!success) {
      let errorText: string;
      try {
        errorText = await response.text();
      } catch {
        errorText = `HTTP ${response.status}`;
      }
      return { success: false, error: errorText, statusCode: response.status };
    }

    return { success: true, messageId, statusCode: response.status };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Verify a SendGrid signed event webhook request using ECDSA.
 *
 * @param publicKey PEM-formatted public key (set in SendGrid Mail Settings, exposed via
 *                  env var `SENDGRID_WEBHOOK_PUBLIC_KEY`).
 * @param payload   Raw request body as a string (must be the un-parsed bytes — JSON.stringify
 *                  re-serialization will break the signature).
 * @param signature Value of the `X-Twilio-Email-Event-Webhook-Signature` header.
 * @param timestamp Value of the `X-Twilio-Email-Event-Webhook-Timestamp` header.
 * @returns true iff signature is valid AND timestamp is within freshness window (5 minutes).
 */
export function verifyWebhookSignature(
  publicKey: string,
  payload: string,
  signature: string,
  timestamp: string
): boolean {
  if (!publicKey || !payload || !signature || !timestamp) return false;

  // Freshness check — reject anything outside +/- 5 minutes
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts)) return false;
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - ts) > 300) return false;

  try {
    const ew = new EventWebhook();
    const ecdsaKey = ew.convertPublicKeyToECDSA(publicKey);
    return ew.verifySignature(ecdsaKey, payload, signature, timestamp);
  } catch (err) {
    console.error("[sendgrid] Webhook signature verification threw:", err);
    return false;
  }
}
