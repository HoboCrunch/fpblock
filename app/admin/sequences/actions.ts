"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { SequenceStep, SequenceSchedule } from "@/lib/types/database";

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

export async function createSequence(data: {
  name: string;
  channel: string;
  event_id: string | null;
  send_mode?: 'auto' | 'approval';
}) {
  const supabase = await createClient();
  const { data: seq, error } = await supabase
    .from("sequences")
    .insert({ ...data, steps: [], status: "draft" })
    .select("id")
    .single();
  if (error) return { success: false, error: error.message };
  return { success: true, id: seq.id };
}

export async function deleteSequence(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("sequences").delete().eq("id", id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function updateSequenceStatus(id: string, status: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("sequences")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function enrollPersons(
  sequenceId: string,
  personIds: string[]
) {
  const supabase = await createClient();
  const rows = personIds.map((pid) => ({
    sequence_id: sequenceId,
    person_id: pid,
    current_step: 0,
    status: "active",
  }));
  const { error } = await supabase
    .from("sequence_enrollments")
    .upsert(rows, { onConflict: "sequence_id,person_id" });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function unenrollPerson(enrollmentId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("sequence_enrollments")
    .delete()
    .eq("id", enrollmentId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function searchPersons(query: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("persons")
    .select("id, full_name, email")
    .or(`full_name.ilike.%${query}%,email.ilike.%${query}%`)
    .limit(20);
  return data || [];
}

export async function updateSequenceName(id: string, name: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("sequences")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath(`/admin/sequences/${id}`);
  return { success: true };
}

export async function updateSequenceSendMode(id: string, sendMode: 'auto' | 'approval') {
  const supabase = await createClient();
  const { error } = await supabase
    .from("sequences")
    .update({ send_mode: sendMode, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath(`/admin/sequences/${id}`);
  return { success: true };
}

export async function updateSequenceSender(id: string, senderId: string | null) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("sequences")
    .update({ sender_id: senderId, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath(`/admin/sequences/${id}`);
  return { success: true };
}

export async function updateSequenceSchedule(id: string, scheduleConfig: SequenceSchedule) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("sequences")
    .update({ schedule_config: scheduleConfig, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath(`/admin/sequences/${id}`);
  return { success: true };
}
