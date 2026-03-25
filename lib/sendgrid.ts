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
      return { success: false, error: errorText };
    }

    return { success: true, messageId };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// WARNING: Timestamp-only verification — add @sendgrid/eventwebhook for ECDSA before production
export function verifyWebhookSignature(
  publicKey: string,
  payload: string,
  signature: string,
  timestamp: string
): boolean {
  void publicKey;
  void payload;
  void signature;

  const ts = parseInt(timestamp, 10);
  if (isNaN(ts)) return false;

  const nowSeconds = Math.floor(Date.now() / 1000);
  return Math.abs(nowSeconds - ts) <= 300;
}
