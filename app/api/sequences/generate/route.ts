import { NextResponse, after } from "next/server";
import { runGenerate, serviceClient } from "@/lib/sequences/generate";

export const maxDuration = 300;

// ─── Cron auth ───────────────────────────────────────────────────────────────
// This route is invoked unattended (Vercel Cron, GET), by scoped manual runs
// (POST), and by eager async-mode triggers (POST { async: true }). All paths
// bypass RLS via the service-role client and are gated by CRON_SECRET.

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

// ─── Handlers ──────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runGenerate(serviceClient());
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse optional scope filters + async flag
  let sequenceId: string | undefined;
  let stepFilter: number | undefined;
  let asyncMode = false;
  try {
    const body = await req.json();
    sequenceId = body?.sequenceId;
    stepFilter = body?.step !== undefined ? Number(body.step) : undefined;
    asyncMode = body?.async === true;
  } catch {
    // Body absent or invalid JSON — proceed without filters
  }

  // Async mode: schedule generation in its own invocation (full 300s budget)
  // and return 202 immediately so the caller (eager trigger) stays responsive.
  if (asyncMode) {
    after(async () => {
      try {
        await runGenerate(serviceClient(), { sequenceId });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `[sequences/generate] async runGenerate failed for sequence ${sequenceId}: ${message}`
        );
      }
    });
    return NextResponse.json({ accepted: true }, { status: 202 });
  }

  try {
    const result = await runGenerate(serviceClient(), { sequenceId, stepFilter });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
