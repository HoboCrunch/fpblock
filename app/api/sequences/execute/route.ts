import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { SequenceStep, InteractionType } from "@/lib/types/database";

export const maxDuration = 60;

interface EnrollmentRow {
  id: string;
  sequence_id: string;
  person_id: string;
  current_step: number;
  status: string;
  enrolled_at: string;
  sequences: {
    id: string;
    name: string;
    channel: string;
    steps: SequenceStep[];
    status: string;
  };
  persons: {
    id: string;
    first_name: string | null;
    full_name: string;
    email: string | null;
  };
}

interface PersonOrgRow {
  organization_id: string;
  organizations: { name: string } | null;
}

const CHANNEL_TO_INTERACTION_TYPE: Record<string, InteractionType> = {
  email: "cold_email",
  linkedin: "cold_linkedin",
  twitter: "cold_twitter",
};

function substituteTemplate(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(
    /\{(\w+)\}/g,
    (_, key) => vars[key] ?? `{${key}}`
  );
}

export async function POST() {
  const supabase = await createClient();

  // Find active enrollments in active sequences
  const { data: enrollments, error: fetchError } = await supabase
    .from("sequence_enrollments")
    .select(
      "*, sequences!inner(id, name, channel, steps, status), persons!inner(id, first_name, full_name, email)"
    )
    .eq("status", "active")
    .eq("sequences.status", "active");

  if (fetchError) {
    return NextResponse.json(
      { error: fetchError.message },
      { status: 500 }
    );
  }

  const rows = (enrollments ?? []) as unknown as EnrollmentRow[];
  let processed = 0;
  let interactionsCreated = 0;
  let completed = 0;
  const errors: string[] = [];

  for (const enrollment of rows) {
    const steps = Array.isArray(enrollment.sequences.steps)
      ? enrollment.sequences.steps
      : [];

    // Check if there are remaining steps
    if (enrollment.current_step >= steps.length) {
      // Mark as completed
      await supabase
        .from("sequence_enrollments")
        .update({ status: "completed" })
        .eq("id", enrollment.id);
      completed++;
      continue;
    }

    const step = steps[enrollment.current_step] as SequenceStep;

    // Check delay: compare enrolled_at + cumulative delay_days against now
    const enrolledAt = new Date(enrollment.enrolled_at);
    const cumulativeDelayDays = steps
      .slice(0, enrollment.current_step + 1)
      .reduce((sum: number, s: SequenceStep) => sum + (s.delay_days || 0), 0);
    const dueDate = new Date(
      enrolledAt.getTime() + cumulativeDelayDays * 24 * 60 * 60 * 1000
    );

    if (new Date() < dueDate) {
      // Not yet due
      continue;
    }

    processed++;

    // Look up organization name for template substitution
    let orgName = "";
    const { data: personOrgs } = await supabase
      .from("person_organizations")
      .select("organization_id, organizations(name)")
      .eq("person_id", enrollment.person_id)
      .eq("is_primary", true)
      .limit(1);

    if (personOrgs && personOrgs.length > 0) {
      const po = personOrgs[0] as unknown as PersonOrgRow;
      orgName = po.organizations?.name ?? "";
    }

    // Build template variables
    const vars: Record<string, string> = {
      first_name: enrollment.persons.first_name ?? enrollment.persons.full_name.split(" ")[0],
      full_name: enrollment.persons.full_name,
      company_name: orgName,
    };

    // Generate message body
    let body = substituteTemplate(step.body_template, vars);
    let subject: string | null = step.subject_template
      ? substituteTemplate(step.subject_template, vars)
      : null;

    // If prompt_template_id is set, try to generate via edge function
    if (step.prompt_template_id) {
      try {
        const { data: promptTemplate } = await supabase
          .from("prompt_templates")
          .select("system_prompt, user_prompt_template")
          .eq("id", step.prompt_template_id)
          .single();

        if (promptTemplate) {
          const userPrompt = substituteTemplate(
            promptTemplate.user_prompt_template,
            vars
          );
          // Call Supabase edge function for AI generation
          const { data: generated, error: genError } =
            await supabase.functions.invoke("generate-messages", {
              body: {
                system_prompt: promptTemplate.system_prompt,
                user_prompt: userPrompt,
                channel: enrollment.sequences.channel,
              },
            });

          if (!genError && generated?.body) {
            body = generated.body;
            if (generated.subject) subject = generated.subject;
          }
        }
      } catch {
        // Fall back to template-based body
      }
    }

    // Determine interaction_type from channel
    const interactionType: InteractionType =
      CHANNEL_TO_INTERACTION_TYPE[enrollment.sequences.channel] ?? "cold_email";

    // Look up organization_id for the person
    let organizationId: string | null = null;
    if (personOrgs && personOrgs.length > 0) {
      const po = personOrgs[0] as unknown as PersonOrgRow;
      organizationId = po.organization_id;
    }

    // Create interaction record
    const { error: interactionError } = await supabase.from("interactions").insert({
      person_id: enrollment.person_id,
      organization_id: organizationId,
      interaction_type: interactionType,
      channel: enrollment.sequences.channel,
      direction: "outbound",
      sequence_id: enrollment.sequence_id,
      sequence_step: step.step_number,
      subject,
      body,
      status: "draft",
      detail: {
        iteration: 1,
      },
    });

    if (interactionError) {
      errors.push(
        `Failed to create interaction for enrollment ${enrollment.id}: ${interactionError.message}`
      );
      continue;
    }

    interactionsCreated++;

    // Advance the enrollment
    const nextStep = enrollment.current_step + 1;
    const isLastStep = nextStep >= steps.length;

    await supabase
      .from("sequence_enrollments")
      .update({
        current_step: nextStep,
        ...(isLastStep ? { status: "completed" } : {}),
      })
      .eq("id", enrollment.id);

    if (isLastStep) completed++;
  }

  // Log the execution
  await supabase.from("job_log").insert({
    job_type: "sequence_execution",
    target_table: "sequence_enrollments",
    status: errors.length > 0 ? "completed_with_errors" : "completed",
    metadata: {
      enrollments_checked: rows.length,
      processed,
      interactions_created: interactionsCreated,
      completed,
      errors,
    },
  });

  return NextResponse.json({
    enrollments_checked: rows.length,
    processed,
    interactions_created: interactionsCreated,
    completed,
    errors: errors.length > 0 ? errors : undefined,
  });
}
