"use server";

import { createClient } from "@/lib/supabase/server";
import type { SequenceStep } from "@/lib/types/database";

export async function updateSequenceSteps(
  sequenceId: string,
  steps: SequenceStep[]
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("sequences")
    .update({ steps, updated_at: new Date().toISOString() })
    .eq("id", sequenceId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}
