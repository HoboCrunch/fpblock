"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { SequenceStep, SequenceSchedule } from "@/lib/types/database";
import { getPersonIdsForEvent, type EventPersonRelation } from "@/lib/queries/event-persons";
import {
  resolvePersonIds,
  fetchSampleForIds,
  applySequenceEnrollFilters,
  type SegmentSpec,
  type SamplePerson,
} from "@/lib/segments";

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
  event_id: string | null;
  send_mode?: 'auto' | 'approval';
}) {
  const supabase = await createClient();
  const { data: seq, error } = await supabase
    .from("sequences")
    .insert({
      ...data,
      channel: "email",
      steps: [],
      status: "draft",
      // exclude_bounced is always on — protect sender reputation.
      schedule_config: { timing_mode: "relative", exclude_bounced: true },
    })
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
  const filtered = await applySequenceEnrollFilters(
    supabase,
    sequenceId,
    personIds
  );
  if (filtered.ids.length === 0) {
    return {
      success: true as const,
      enrolled: 0,
      requested: personIds.length,
      dropped: filtered.dropped,
    };
  }
  const rows = filtered.ids.map((pid) => ({
    sequence_id: sequenceId,
    person_id: pid,
    current_step: 0,
    status: "active",
  }));
  const { error } = await supabase
    .from("sequence_enrollments")
    .upsert(rows, { onConflict: "sequence_id,person_id" });
  if (error) return { success: false as const, error: error.message };
  return {
    success: true as const,
    enrolled: filtered.ids.length,
    requested: personIds.length,
    dropped: filtered.dropped,
  };
}

export async function enrollFromEvent(
  sequenceId: string,
  eventId: string,
  relation: EventPersonRelation
) {
  const supabase = await createClient();
  const personIds = await getPersonIdsForEvent(supabase, eventId, relation);
  if (personIds.length === 0) {
    return { success: true as const, enrolled: 0, dropped: { bounced: 0, already_in_active_sequence: 0 } };
  }
  const filtered = await applySequenceEnrollFilters(supabase, sequenceId, personIds);
  if (filtered.ids.length === 0) {
    return {
      success: true as const,
      enrolled: 0,
      dropped: filtered.dropped,
    };
  }
  const rows = filtered.ids.map((pid) => ({
    sequence_id: sequenceId,
    person_id: pid,
    current_step: 0,
    status: "active" as const,
  }));
  const { error } = await supabase
    .from("sequence_enrollments")
    .upsert(rows, { onConflict: "sequence_id,person_id" });
  if (error) return { success: false as const, error: error.message };
  return {
    success: true as const,
    enrolled: filtered.ids.length,
    dropped: filtered.dropped,
  };
}

export async function enrollFromList(sequenceId: string, listId: string) {
  const supabase = await createClient();
  const { data: items, error: itemsError } = await supabase
    .from("person_list_items")
    .select("person_id")
    .eq("list_id", listId);
  if (itemsError) return { success: false as const, error: itemsError.message };
  const personIds = (items ?? []).map((i) => i.person_id);
  if (personIds.length === 0) {
    return {
      success: true as const,
      enrolled: 0,
      requested: 0,
      dropped: { bounced: 0, already_in_active_sequence: 0 },
    };
  }
  const result = await enrollPersons(sequenceId, personIds);
  if (!result.success) {
    return { success: false as const, error: result.error ?? "Enrollment failed" };
  }
  revalidatePath(`/admin/sequences/${sequenceId}`);
  return {
    success: true as const,
    enrolled: result.enrolled,
    requested: result.requested,
    dropped: result.dropped,
  };
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

export async function unenrollFromList(sequenceId: string, listId: string) {
  const supabase = await createClient();
  const { data: items, error: itemsError } = await supabase
    .from("person_list_items")
    .select("person_id")
    .eq("list_id", listId);
  if (itemsError) return { success: false as const, error: itemsError.message };
  const personIds = (items ?? []).map((i) => i.person_id);
  if (personIds.length === 0) {
    return { success: true as const, removed: 0 };
  }
  const { data: deleted, error } = await supabase
    .from("sequence_enrollments")
    .delete()
    .eq("sequence_id", sequenceId)
    .in("person_id", personIds)
    .select("id");
  if (error) return { success: false as const, error: error.message };
  revalidatePath(`/admin/sequences/${sequenceId}`);
  return { success: true as const, removed: deleted?.length ?? 0 };
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

// ---------------------------------------------------------------------------
// Segment-based enrollment
// ---------------------------------------------------------------------------

/**
 * Resolve a SegmentSpec without enrolling. Returns the total match count
 * (pre-limit) and a small sample for UI preview.
 */
export async function previewSegment(
  spec: SegmentSpec,
  sequenceId?: string
): Promise<{
  count: number;
  limited: number;
  sample: SamplePerson[];
}> {
  const supabase = await createClient();
  const resolved = await resolvePersonIds(supabase, spec, sequenceId);
  const sample = await fetchSampleForIds(supabase, resolved.ids, 5);
  return {
    count: resolved.totalBeforeLimit,
    limited: resolved.ids.length,
    sample,
  };
}

/**
 * Resolve a SegmentSpec and enroll the resulting person IDs into the given
 * sequence. Reuses the same `enrollPersons` upsert as the manual flow so
 * downstream behaviour is identical.
 */
export async function enrollFromSegment(
  sequenceId: string,
  spec: SegmentSpec
): Promise<
  | {
      success: true;
      enrolled: number;
      totalMatched: number;
      dropped: { bounced: number; already_in_active_sequence: number };
    }
  | { success: false; error: string }
> {
  const supabase = await createClient();
  const resolved = await resolvePersonIds(supabase, spec, sequenceId);
  if (resolved.ids.length === 0) {
    return {
      success: true,
      enrolled: 0,
      totalMatched: resolved.totalBeforeLimit,
      dropped: { bounced: 0, already_in_active_sequence: 0 },
    };
  }
  const result = await enrollPersons(sequenceId, resolved.ids);
  if (!result.success) {
    return { success: false, error: result.error ?? "Enrollment failed" };
  }
  revalidatePath(`/admin/sequences/${sequenceId}`);
  return {
    success: true,
    enrolled: result.enrolled,
    totalMatched: resolved.totalBeforeLimit,
    dropped: result.dropped,
  };
}

export async function updateSequenceSchedule(id: string, scheduleConfig: SequenceSchedule) {
  const supabase = await createClient();
  // Enforce always-on enrollment guards; the UI no longer exposes these toggles.
  const safeConfig: SequenceSchedule = { ...scheduleConfig, exclude_bounced: true };
  const { error } = await supabase
    .from("sequences")
    .update({ schedule_config: safeConfig, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { success: false, error: error.message };
  revalidatePath(`/admin/sequences/${id}`);
  return { success: true };
}
