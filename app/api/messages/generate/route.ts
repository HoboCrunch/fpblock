import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { InteractionType } from "@/lib/types/database";

const CHANNEL_TO_INTERACTION_TYPE: Record<string, InteractionType> = {
  email: "cold_email",
  linkedin: "cold_linkedin",
  twitter: "cold_twitter",
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();
  const { person_ids, event_id, channels, sequence_number, prompt_template_id, sender_id, cta } = body;

  if (!person_ids || !Array.isArray(person_ids) || person_ids.length === 0) {
    return NextResponse.json({ error: "person_ids required" }, { status: 400 });
  }

  const { data, error } = await supabase.functions.invoke("generate-messages", {
    body: {
      person_ids,
      event_id,
      channels,
      sequence_number,
      prompt_template_id,
      sender_id,
      cta,
      // Map channel to interaction_type for the edge function
      interaction_types: (channels as string[] | undefined)?.map(
        (ch: string) => CHANNEL_TO_INTERACTION_TYPE[ch] ?? ch
      ),
    },
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
