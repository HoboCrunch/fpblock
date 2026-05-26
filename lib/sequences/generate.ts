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

// ─── Row shapes returned from Supabase joins ────────────────────────────────

export interface EnrollmentRow extends SequenceEnrollment {
  sequences: Sequence;
  persons: Person;
}

export interface PersonOrgRow {
  organization_id: string;
  organizations: Organization | null;
}

// ─── Service client ──────────────────────────────────────────────────────────
// Generation runs unattended (Vercel Cron) and from scoped manual/eager runs.
// All paths need to bypass RLS — the anon/cookie client returns nothing without
// a logged-in session — so we use a service-role client gated by CRON_SECRET at
// the route boundary, matching app/api/cron/inbox-sync/route.ts.

export function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } }
  );
}

export type ServiceClient = ReturnType<typeof serviceClient>;

export interface GenerateResult {
  generated: number;
  failed: number;
  skipped: number;
  errors: string[];
}

// Per-enrollment accumulator. Each enrollment computes its own tallies locally
// so parallel batch members never race on shared mutable counters; the batch
// loop sums them afterwards.
interface EnrollmentResult {
  generated: number;
  failed: number;
  skipped: number;
  errors: string[];
}

// ─── Main generation logic ─────────────────────────────────────────────────

export async function runGenerate(
  supabase: ServiceClient,
  opts: {
    sequenceId?: string;
    stepFilter?: number;
    concurrency?: number;
  } = {}
): Promise<GenerateResult> {
  const { sequenceId, stepFilter } = opts;
  const concurrency = opts.concurrency ?? 5;

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

  // Per-enrollment body. Returns local tallies so parallel members don't race
  // on shared counters.
  async function processEnrollment(
    enrollment: EnrollmentRow
  ): Promise<EnrollmentResult> {
    const res: EnrollmentResult = {
      generated: 0,
      failed: 0,
      skipped: 0,
      errors: [],
    };

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
      res.skipped++;
      return res;
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
      res.skipped++;
      return res;
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

      // Cheap early-out: skip if a row already exists for this enrollment+step.
      // The upsert below is the real idempotency guard (collision-proof under
      // concurrent eager + cron runs); this pre-check just avoids the AI work.
      const { data: existing } = await supabase
        .from("interactions")
        .select("id")
        .eq("sequence_id", enrollment.sequence_id)
        .eq("person_id", enrollment.person_id)
        .eq("sequence_step", stepIndex)
        .limit(1);

      if (existing && existing.length > 0) {
        res.skipped++;
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
            res.errors.push(
              `AI generation failed for enrollment ${enrollment.id}, step ${stepIndex}, block ${aiBlock.index}: ${errMsg}`
            );
            res.failed++;
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
          res.errors.push(
            `AI generation threw for enrollment ${enrollment.id}, step ${stepIndex}, block ${aiBlock.index}: ${errMsg}`
          );
          res.failed++;
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
      // Idempotent upsert on the (sequence_id, person_id, sequence_step) partial
      // unique index (migration 038). ignoreDuplicates makes overlapping eager +
      // cron runs collision-proof at the DB level rather than via the pre-check.
      const { error: interactionError } = await supabase
        .from("interactions")
        .upsert(
          {
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
          },
          {
            onConflict: "sequence_id,person_id,sequence_step",
            ignoreDuplicates: true,
          }
        );

      if (interactionError) {
        res.errors.push(
          `Failed to create interaction for enrollment ${enrollment.id}, step ${stepIndex}: ${interactionError.message}`
        );
        res.failed++;
        continue;
      }

      res.generated++;
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

    return res;
  }

  // ── Process enrollments in parallel chunks ───────────────────────────────
  // Same chunked-Promise.all pattern as runBatchEnrichment. Each enrollment
  // returns local tallies; we sum them after each batch so the shared counters
  // are mutated only on the (single-threaded) awaiting side — no races.
  let generated = 0;
  let failed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i += concurrency) {
    const batch = rows.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((enrollment) => processEnrollment(enrollment))
    );
    for (const r of batchResults) {
      generated += r.generated;
      failed += r.failed;
      skipped += r.skipped;
      errors.push(...r.errors);
    }
  }

  return { generated, failed, skipped, errors };
}
