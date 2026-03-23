"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Move a person between pipeline stages.
 *
 * Moving RIGHT (more advanced stage): update the most recent interaction's status.
 * Moving LEFT (earlier stage): create a new draft interaction.
 * Moving FROM "not_contacted": create a new draft interaction.
 */

const STAGE_TO_STATUS: Record<string, string> = {
  draft: "draft",
  scheduled: "scheduled",
  sent: "sent",
  opened: "opened",
  replied: "replied",
  bounced_failed: "bounced",
};

export async function moveContact(
  personId: string,
  fromStage: string,
  toStage: string
) {
  const supabase = await createClient();
  const targetStatus = STAGE_TO_STATUS[toStage];

  if (!targetStatus) {
    throw new Error(`Invalid target stage: ${toStage}`);
  }

  if (fromStage === "not_contacted") {
    // Create a new draft interaction
    const { error } = await supabase.from("interactions").insert({
      person_id: personId,
      interaction_type: "cold_email",
      channel: "email",
      direction: "outbound",
      body: "",
      status: "draft",
    });
    if (error) throw error;
    return;
  }

  // Get most recent interaction for this person
  const { data: latestInteraction, error: fetchError } = await supabase
    .from("interactions")
    .select("id")
    .eq("person_id", personId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (fetchError || !latestInteraction) {
    throw new Error("No interaction found for person");
  }

  const fromIdx = Object.keys(STAGE_TO_STATUS).indexOf(fromStage);
  const toIdx = Object.keys(STAGE_TO_STATUS).indexOf(toStage);

  if (toIdx >= fromIdx) {
    // Moving right -- update existing interaction status
    const { error } = await supabase
      .from("interactions")
      .update({ status: targetStatus })
      .eq("id", latestInteraction.id);
    if (error) throw error;
  } else {
    // Moving left -- create new draft interaction
    const { error } = await supabase.from("interactions").insert({
      person_id: personId,
      interaction_type: "cold_email",
      channel: "email",
      direction: "outbound",
      body: "",
      status: "draft",
    });
    if (error) throw error;
  }
}
