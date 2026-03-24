/**
 * Resilient fetch wrapper with timeout, retry, and exponential backoff.
 *
 * - Timeout via AbortController (default 30s)
 * - Retries on network errors and 5xx responses
 * - Skips retries on 4xx (client errors are permanent)
 * - Structured logging with context
 */

export interface FetchWithRetryOptions {
  /** Timeout in ms. Default: 30000 */
  timeoutMs?: number;
  /** Max retry attempts. Default: 3 */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff. Default: 1000 */
  baseDelayMs?: number;
  /** Context string for logging, e.g. "apollo" or "perplexity:Lido" */
  context?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  options?: FetchWithRetryOptions
): Promise<Response> {
  const timeoutMs = options?.timeoutMs ?? 30_000;
  const maxRetries = options?.maxRetries ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 1_000;
  const context = options?.context ?? "fetch";

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // Compose caller's signal with our timeout signal
    const callerSignal = init?.signal;
    if (callerSignal) {
      if (callerSignal.aborted) {
        clearTimeout(timeoutId);
        throw callerSignal.reason ?? new Error("Aborted");
      }
      callerSignal.addEventListener("abort", () => controller.abort(callerSignal.reason), {
        once: true,
      });
    }

    try {
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // 2xx/3xx — success
      if (res.ok || (res.status >= 300 && res.status < 400)) {
        return res;
      }

      // 4xx — client error, no retry
      if (res.status >= 400 && res.status < 500) {
        return res;
      }

      // 5xx — server error, retry
      lastError = new Error(`${res.status} ${res.statusText}`);

      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        console.warn(
          `[enrichment] [${context}] attempt ${attempt}/${maxRetries}: retrying after ${res.status} ${res.statusText}`
        );
        await sleep(delay);
      }
    } catch (err) {
      clearTimeout(timeoutId);

      // Check if this was our timeout abort
      if (controller.signal.aborted && !callerSignal?.aborted) {
        lastError = new Error(`Request timed out after ${timeoutMs}ms`);
      } else if (callerSignal?.aborted) {
        // Caller aborted — don't retry
        throw callerSignal.reason ?? new Error("Aborted");
      } else {
        lastError = err instanceof Error ? err : new Error(String(err));
      }

      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        console.warn(
          `[enrichment] [${context}] attempt ${attempt}/${maxRetries} failed: ${lastError.message}`
        );
        await sleep(delay);
      }
    }
  }

  throw lastError ?? new Error("All retries exhausted");
}
