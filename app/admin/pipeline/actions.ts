"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Move a contact between pipeline stages.
 *
 * Moving RIGHT (more advanced stage): update the most recent message's status.
 * Moving LEFT (earlier stage): create a new draft message with iteration+1.
 * Moving FROM "not_contacted": create a new draft message.
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
  contactId: string,
  fromStage: string,
  toStage: string
) {
  const supabase = await createClient();
  const targetStatus = STAGE_TO_STATUS[toStage];

  if (!targetStatus) {
    throw new Error(`Invalid target stage: ${toStage}`);
  }

  if (fromStage === "not_contacted") {
    // Create a new draft message
    const { error } = await supabase.from("messages").insert({
      contact_id: contactId,
      channel: "email",
      sequence_number: 1,
      iteration: 1,
      body: "",
      status: "draft",
    });
    if (error) throw error;
    return;
  }

  // Get most recent message for this contact
  const { data: latestMessage, error: fetchError } = await supabase
    .from("messages")
    .select("id, iteration")
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (fetchError || !latestMessage) {
    throw new Error("No message found for contact");
  }

  const fromIdx = Object.keys(STAGE_TO_STATUS).indexOf(fromStage);
  const toIdx = Object.keys(STAGE_TO_STATUS).indexOf(toStage);

  if (toIdx >= fromIdx) {
    // Moving right — update existing message status
    const { error } = await supabase
      .from("messages")
      .update({ status: targetStatus })
      .eq("id", latestMessage.id);
    if (error) throw error;
  } else {
    // Moving left — create new draft with incremented iteration
    const { error } = await supabase.from("messages").insert({
      contact_id: contactId,
      channel: "email",
      sequence_number: 1,
      iteration: (latestMessage.iteration || 1) + 1,
      body: "",
      status: "draft",
    });
    if (error) throw error;
  }
}
