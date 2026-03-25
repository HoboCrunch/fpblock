import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import {
  buildContext,
  extractAiBlocks,
  renderTemplate,
} from "@/lib/template-renderer";
import type { Person, Organization, Event, SenderProfile, SequenceStep } from "@/lib/types/database";

export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  let body: { stepIndex: number; personId: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { stepIndex, personId } = body;

  if (typeof stepIndex !== "number" || !personId) {
    return NextResponse.json(
      { error: "stepIndex and personId are required" },
      { status: 400 }
    );
  }

  // 1. Fetch the sequence
  const { data: sequence, error: seqError } = await supabase
    .from("sequences")
    .select("id, name, steps, event_id, sender_id")
    .eq("id", id)
    .single();

  if (seqError || !sequence) {
    return NextResponse.json({ error: "Sequence not found" }, { status: 404 });
  }

  // 2. Get the step
  const steps = Array.isArray(sequence.steps) ? sequence.steps : [];
  const step = steps[stepIndex] as SequenceStep | undefined;

  if (!step) {
    return NextResponse.json({ error: "Step not found" }, { status: 404 });
  }

  // 3. Fetch person
  const { data: person } = await supabase
    .from("persons")
    .select("*")
    .eq("id", personId)
    .single();

  // 4. Fetch primary org
  let org: Organization | null = null;
  const { data: personOrgs } = await supabase
    .from("person_organizations")
    .select("organizations(*)")
    .eq("person_id", personId)
    .eq("is_primary", true)
    .limit(1);

  if (personOrgs && personOrgs.length > 0) {
    const row = personOrgs[0] as unknown as { organizations: Organization | null };
    org = row.organizations ?? null;
  }

  // 5. Fetch event if set
  let event: Event | null = null;
  if (sequence.event_id) {
    const { data: eventData } = await supabase
      .from("events")
      .select("*")
      .eq("id", sequence.event_id)
      .single();
    event = eventData ?? null;
  }

  // 6. Fetch sender profile if set
  let sender: SenderProfile | null = null;
  if (sequence.sender_id) {
    const { data: senderData } = await supabase
      .from("sender_profiles")
      .select("*")
      .eq("id", sequence.sender_id)
      .single();
    sender = senderData ?? null;
  }

  // 7. Build context
  const ctx = buildContext(
    person as Person | null,
    org,
    event,
    sender
  );

  // 8. Extract AI blocks from subject and body
  const subjectAiBlocks = extractAiBlocks(step.subject_template, ctx);
  const bodyAiBlocks = extractAiBlocks(step.body_template, ctx);

  // 9. Generate AI content for each block
  const subjectAiResults = new Map<number, string>();
  const bodyAiResults = new Map<number, string>();

  for (const block of subjectAiBlocks) {
    try {
      const { data: generated } = await supabase.functions.invoke("generate-messages", {
        body: {
          system_prompt: block.tone || "You are a helpful outreach assistant.",
          user_prompt: block.prompt,
        },
      });
      if (generated?.body) {
        subjectAiResults.set(block.index, generated.body);
      }
    } catch {
      // Leave block as pending on error
    }
  }

  for (const block of bodyAiBlocks) {
    try {
      const { data: generated } = await supabase.functions.invoke("generate-messages", {
        body: {
          system_prompt: block.tone || "You are a helpful outreach assistant.",
          user_prompt: block.prompt,
        },
      });
      if (generated?.body) {
        bodyAiResults.set(block.index, generated.body);
      }
    } catch {
      // Leave block as pending on error
    }
  }

  // 10. Render templates
  const renderedSubject = renderTemplate(step.subject_template, ctx, subjectAiResults);
  const renderedBody = renderTemplate(step.body_template, ctx, bodyAiResults);

  // 11. Return rendered output
  return NextResponse.json({
    subject: renderedSubject,
    body: renderedBody,
    hasSender: !!sender,
  });
}
