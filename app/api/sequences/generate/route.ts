import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import {
  buildContext,
  renderTemplate,
  extractAiBlocks,
} from "@/lib/template-renderer";
import { computeStepScheduledAt } from "@/lib/sequences/schedule";
import type {
  Sequence,
  SequenceEnrollment,
  SequenceStep,
  SequenceSchedule,
  Person,
  Organization,
  Event,
  SenderProfile,
} from "@/lib/types/database";

export const maxDuration = 60;

// ─── Row shapes returned from Supabase joins ────────────────────────────────

interface EnrollmentRow extends SequenceEnrollment {
  sequences: Sequence;
  persons: Person;
}

interface PersonOrgRow {
  organization_id: string;
  organizations: Organization | null;
}

// ─── Cron auth + service client ──────────────────────────────────────────────
// This route is invoked unattended (Vercel Cron, GET) and by scoped manual
// runs (POST). Both paths need to bypass RLS — the anon/cookie client returns
// nothing without a logged-in session — so we use a service-role client gated
// by CRON_SECRET, matching app/api/cron/inbox-sync/route.ts.

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } }
  );
}

type ServiceClient = ReturnType<typeof serviceClient>;

// ─── Main handler ────────────────────────────────────────────────────────────

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

  // Parse optional scope filters
  let sequenceId: string | undefined;
  let stepFilter: number | undefined;
  try {
    const body = await req.json();
    sequenceId = body?.sequenceId;
    stepFilter = body?.step !== undefined ? Number(body.step) : undefined;
  } catch {
    // Body absent or invalid JSON — proceed without filters
  }

  try {
    const result = await runGenerate(serviceClient(), sequenceId, stepFilter);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function runGenerate(
  supabase: ServiceClient,
  sequenceId?: string,
  stepFilter?: number
) {
  // Build the base query
  let query = supabase
    .from("sequence_enrollments")
    .select(
      `*,
       sequences!inner(id, name, channel, steps, status, send_mode, sender_id, event_id, schedule_config),
       persons!inner(id, full_name, first_name, last_name, email, linkedin_url, twitter_handle, title, seniority, department, bio, photo_url, source, apollo_id, enrichment_status, last_enriched_at, notes, phone, telegram_handle, created_at, updated_at)`
    )
    .eq("status", "active")
    .eq("sequences.status", "active");

  if (sequenceId) {
    query = query.eq("sequence_id", sequenceId);
  }

  const { data: enrollments, error: fetchError } = await query;

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  const rows = (enrollments ?? []) as unknown as EnrollmentRow[];

  let generated = 0;
  let failed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const enrollment of rows) {
    const sequence = enrollment.sequences;
    const steps: SequenceStep[] = Array.isArray(sequence.steps)
      ? sequence.steps
      : [];

    // ── Already past the end of the sequence ──────────────────────────────
    if (enrollment.current_step >= steps.length) {
      await supabase
        .from("sequence_enrollments")
        .update({ status: "completed" })
        .eq("id", enrollment.id);
      skipped++;
      continue;
    }

    const schedule: SequenceSchedule = sequence.schedule_config ?? {
      timing_mode: "relative",
    };
    const enrolledAt = new Date(enrollment.enrolled_at);

    // ── Which steps to generate ────────────────────────────────────────────
    // Pre-generate a row for every remaining step up front so reviewers see the
    // whole sequence immediately. The drip cadence is carried by each row's
    // scheduled_at (computed below), not by *when* the row is created — the
    // sender only dispatches rows whose scheduled_at <= now. A scoped manual run
    // (stepFilter) targets a single step instead.
    if (stepFilter !== undefined && enrollment.current_step > stepFilter) {
      skipped++;
      continue;
    }
    const startStep =
      stepFilter !== undefined ? stepFilter : enrollment.current_step;
    const endStep = stepFilter !== undefined ? stepFilter + 1 : steps.length;

    // ── Fetch supporting records (once per enrollment) ─────────────────────
    let primaryOrg: Organization | null = null;
    let organizationId: string | null = null;

    const { data: personOrgs } = await supabase
      .from("person_organizations")
      .select("organization_id, organizations(*)")
      .eq("person_id", enrollment.person_id)
      .eq("is_primary", true)
      .limit(1);

    if (personOrgs && personOrgs.length > 0) {
      const po = personOrgs[0] as unknown as PersonOrgRow;
      organizationId = po.organization_id;
      primaryOrg = po.organizations ?? null;
    }

    // Event (if sequence has one)
    let event: Event | null = null;
    if (sequence.event_id) {
      const { data: eventRow } = await supabase
        .from("events")
        .select("*")
        .eq("id", sequence.event_id)
        .single();
      event = eventRow ?? null;
    }

    // Sender profile (if sequence has one)
    let sender: SenderProfile | null = null;
    if (sequence.sender_id) {
      const { data: senderRow } = await supabase
        .from("sender_profiles")
        .select("*")
        .eq("id", sequence.sender_id)
        .single();
      sender = senderRow ?? null;
    }

    // ── Build template context ─────────────────────────────────────────────
    const ctx = buildContext(
      enrollment.persons as Person,
      primaryOrg,
      event,
      sender
    );

    // ── Generate each missing step ─────────────────────────────────────────
    for (let stepIndex = startStep; stepIndex < endStep; stepIndex++) {
      const step = steps[stepIndex];
      if (!step) continue;

      // Skip if a row already exists for this enrollment+step.
      const { data: existing } = await supabase
        .from("interactions")
        .select("id")
        .eq("sequence_id", enrollment.sequence_id)
        .eq("person_id", enrollment.person_id)
        .eq("sequence_step", stepIndex)
        .limit(1);

      if (existing && existing.length > 0) {
        skipped++;
        continue;
      }

      // ── Extract and resolve AI blocks for this step ──────────────────────
      const subjectAiBlocks = extractAiBlocks(step.subject_template, ctx);
      const bodyAiBlocks = extractAiBlocks(step.body_template, ctx);

      const allAiBlocks = [
        ...subjectAiBlocks.map((b) => ({ ...b, source: "subject" as const })),
        ...bodyAiBlocks.map((b) => ({ ...b, source: "body" as const })),
      ];

      const subjectAiResults = new Map<number, string>();
      const bodyAiResults = new Map<number, string>();
      const hasAiBlocks = allAiBlocks.length > 0;
      let aiFailed = false;

      for (const aiBlock of allAiBlocks) {
        try {
          const { data: aiResult, error: aiError } =
            await supabase.functions.invoke("generate-messages", {
              body: {
                system_prompt:
                  aiBlock.tone || "You are a helpful outreach assistant.",
                user_prompt: aiBlock.prompt,
              },
            });

          if (aiError || !aiResult) {
            const errMsg =
              aiError?.message ?? "AI generation returned no result";
            // Record a failed row for this step, then move to the next step.
            await supabase.from("interactions").insert({
              person_id: enrollment.person_id,
              organization_id: organizationId,
              sequence_id: enrollment.sequence_id,
              sequence_step: stepIndex,
              interaction_type: "cold_email",
              channel: sequence.channel,
              direction: "outbound",
              status: "failed",
              detail: {
                error: errMsg,
                ai_block_index: aiBlock.index,
                generated_at: new Date().toISOString(),
              },
            });
            errors.push(
              `AI generation failed for enrollment ${enrollment.id}, step ${stepIndex}, block ${aiBlock.index}: ${errMsg}`
            );
            failed++;
            aiFailed = true;
            break;
          }

          const generatedText: string =
            aiResult?.body ?? aiResult?.text ?? String(aiResult);

          if (aiBlock.source === "subject") {
            subjectAiResults.set(aiBlock.index, generatedText);
          } else {
            bodyAiResults.set(aiBlock.index, generatedText);
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          await supabase.from("interactions").insert({
            person_id: enrollment.person_id,
            organization_id: organizationId,
            sequence_id: enrollment.sequence_id,
            sequence_step: stepIndex,
            interaction_type: "cold_email",
            channel: sequence.channel,
            direction: "outbound",
            status: "failed",
            detail: {
              error: errMsg,
              ai_block_index: aiBlock.index,
              generated_at: new Date().toISOString(),
            },
          });
          errors.push(
            `AI generation threw for enrollment ${enrollment.id}, step ${stepIndex}, block ${aiBlock.index}: ${errMsg}`
          );
          failed++;
          aiFailed = true;
          break;
        }
      }

      // A failed AI block already recorded a 'failed' row for this step.
      if (aiFailed) continue;

      // ── Render templates ───────────────────────────────────────────────────
      const renderedSubject = renderTemplate(
        step.subject_template,
        ctx,
        subjectAiResults
      );
      const renderedBody = renderTemplate(
        step.body_template,
        ctx,
        bodyAiResults
      );

      // Each step's planned send time carries the drip cadence. Drafts (approval
      // mode) store it too so the queue shows when each step is due to go out,
      // and approval preserves it.
      const scheduledAt = computeStepScheduledAt({
        enrolledAt,
        steps,
        stepIndex,
        schedule,
      });

      // ── Create the interaction ───────────────────────────────────────────
      const { error: interactionError } = await supabase
        .from("interactions")
        .insert({
          person_id: enrollment.person_id,
          organization_id: organizationId,
          sequence_id: enrollment.sequence_id,
          sequence_step: stepIndex,
          interaction_type: "cold_email",
          channel: sequence.channel,
          direction: "outbound",
          subject: renderedSubject || null,
          body: renderedBody || null,
          status: sequence.send_mode === "auto" ? "scheduled" : "draft",
          scheduled_at: scheduledAt,
          detail: {
            ai_blocks_used: hasAiBlocks,
            generated_at: new Date().toISOString(),
          },
        });

      if (interactionError) {
        errors.push(
          `Failed to create interaction for enrollment ${enrollment.id}, step ${stepIndex}: ${interactionError.message}`
        );
        failed++;
        continue;
      }

      generated++;
    }

    // ── Advance enrollment ─────────────────────────────────────────────────
    // All remaining steps now have rows; their scheduled_at gates actual
    // sending, so the enrollment is done being generated. (A scoped step run
    // leaves the enrollment position untouched.)
    if (stepFilter === undefined) {
      await supabase
        .from("sequence_enrollments")
        .update({ current_step: steps.length, status: "completed" })
        .eq("id", enrollment.id);
    }
  }

  return { generated, failed, skipped, errors };
}
