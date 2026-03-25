import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buildContext,
  renderTemplate,
  extractAiBlocks,
} from "@/lib/template-renderer";
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

// ─── Send-window helpers ─────────────────────────────────────────────────────

const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/**
 * Given a schedule_config with a send_window, return the next Date (>= now)
 * that falls within the window. Falls back to now if no window is configured.
 */
function nextSendWindowTime(schedule: SequenceSchedule): Date {
  const { send_window } = schedule;
  if (!send_window) return new Date();

  const { days, start_hour, end_hour, timezone } = send_window;

  // Walk through today + next 7 days looking for a valid slot
  for (let offset = 0; offset <= 7; offset++) {
    const candidate = new Date();
    candidate.setDate(candidate.getDate() + offset);

    // Determine the day-of-week in the target timezone
    const localStr = candidate.toLocaleString("en-US", {
      timeZone: timezone,
      weekday: "short",
    });
    const dayKey = localStr.slice(0, 3).toLowerCase() as (typeof DAY_NAMES)[number];

    if (!days.includes(dayKey)) continue;

    // Determine the current hour in the target timezone
    const tzHourStr = candidate.toLocaleString("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    });
    const tzHour = parseInt(tzHourStr, 10);

    if (offset === 0) {
      // Same day — use current time if within window, else skip to tomorrow
      if (tzHour >= start_hour && tzHour < end_hour) {
        return new Date(); // right now is valid
      }
      // If before the window, advance to start_hour today
      if (tzHour < start_hour) {
        const start = new Date(candidate);
        start.setHours(start.getHours() + (start_hour - tzHour));
        start.setMinutes(0, 0, 0);
        return start;
      }
      // After today's window — try next valid day
      continue;
    }

    // Future day — schedule at start_hour in the target timezone
    // (rough approximation: adjust hours by the TZ offset difference)
    const tzOffset = candidate.getHours() - tzHour;
    const result = new Date(candidate);
    result.setHours(start_hour + tzOffset, 0, 0, 0);
    return result;
  }

  // No window found within 7 days — fall back to now
  return new Date();
}

// ─── Delay / due-date helpers ────────────────────────────────────────────────

function isDue(
  enrollment: SequenceEnrollment,
  steps: SequenceStep[],
  schedule: SequenceSchedule
): boolean {
  const now = new Date();
  const enrolledAt = new Date(enrollment.enrolled_at);
  const currentStepIndex = enrollment.current_step;

  switch (schedule.timing_mode) {
    case "relative":
    case "window": {
      const cumulativeDelayDays = steps
        .slice(0, currentStepIndex + 1)
        .reduce((sum, s) => sum + (s.delay_days || 0), 0);
      const dueDate = new Date(
        enrolledAt.getTime() + cumulativeDelayDays * 24 * 60 * 60 * 1000
      );
      return now >= dueDate;
    }
    case "anchor": {
      if (!schedule.anchor_date) return true; // no anchor — treat as due
      const anchor = new Date(schedule.anchor_date);
      const step = steps[currentStepIndex];
      const delayMs = (step?.delay_days || 0) * 24 * 60 * 60 * 1000;
      const dueDate =
        schedule.anchor_direction === "before"
          ? new Date(anchor.getTime() - delayMs)
          : new Date(anchor.getTime() + delayMs);
      return now >= dueDate;
    }
    default:
      return true;
  }
}

// ─── Main handler ────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const supabase = await createClient();

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
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
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

    // ── Optional step filter ───────────────────────────────────────────────
    if (stepFilter !== undefined && enrollment.current_step !== stepFilter) {
      skipped++;
      continue;
    }

    // ── Check if interaction already exists for this enrollment+step ───────
    const { data: existing } = await supabase
      .from("interactions")
      .select("id")
      .eq("sequence_id", enrollment.sequence_id)
      .eq("person_id", enrollment.person_id)
      .eq("sequence_step", enrollment.current_step)
      .limit(1);

    if (existing && existing.length > 0) {
      skipped++;
      continue;
    }

    // ── Timing check ───────────────────────────────────────────────────────
    const schedule: SequenceSchedule = sequence.schedule_config ?? {
      timing_mode: "relative",
    };

    if (!isDue(enrollment, steps, schedule)) {
      skipped++;
      continue;
    }

    // ── Fetch supporting records ───────────────────────────────────────────
    const step = steps[enrollment.current_step] as SequenceStep;

    // Primary org
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

    // ── Extract and resolve AI blocks ──────────────────────────────────────
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
          const errMsg = aiError?.message ?? "AI generation returned no result";
          // Create failed interaction and skip this enrollment
          await supabase.from("interactions").insert({
            person_id: enrollment.person_id,
            organization_id: organizationId,
            sequence_id: enrollment.sequence_id,
            sequence_step: enrollment.current_step,
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
            `AI generation failed for enrollment ${enrollment.id}, block ${aiBlock.index}: ${errMsg}`
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
          sequence_step: enrollment.current_step,
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
          `AI generation threw for enrollment ${enrollment.id}, block ${aiBlock.index}: ${errMsg}`
        );
        failed++;
        aiFailed = true;
        break;
      }
    }

    if (aiFailed) continue;

    // ── Render templates ───────────────────────────────────────────────────
    const renderedSubject = renderTemplate(
      step.subject_template,
      ctx,
      subjectAiResults
    );
    const renderedBody = renderTemplate(step.body_template, ctx, bodyAiResults);

    // ── Calculate scheduled_at for auto mode ───────────────────────────────
    let scheduledAt: string | null = null;
    if (sequence.send_mode === "auto") {
      scheduledAt = nextSendWindowTime(schedule).toISOString();
    }

    // ── Create the interaction ─────────────────────────────────────────────
    const { error: interactionError } = await supabase
      .from("interactions")
      .insert({
        person_id: enrollment.person_id,
        organization_id: organizationId,
        sequence_id: enrollment.sequence_id,
        sequence_step: enrollment.current_step,
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
        `Failed to create interaction for enrollment ${enrollment.id}: ${interactionError.message}`
      );
      failed++;
      continue;
    }

    generated++;

    // ── Advance enrollment ─────────────────────────────────────────────────
    const nextStep = enrollment.current_step + 1;
    const isLastStep = nextStep >= steps.length;

    await supabase
      .from("sequence_enrollments")
      .update({
        current_step: nextStep,
        ...(isLastStep ? { status: "completed" } : {}),
      })
      .eq("id", enrollment.id);
  }

  return NextResponse.json({ generated, failed, skipped, errors });
}
