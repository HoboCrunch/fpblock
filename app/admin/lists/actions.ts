"use server";

import { createClient } from "@/lib/supabase/server";
import type { PersonFilterRules } from "@/lib/filters/person-filters";

export async function getLists() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("person_lists")
    .select("*, person_list_items(count)")
    .order("updated_at", { ascending: false });
  return { data: data ?? [], error: error?.message ?? null };
}

export async function getListById(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("person_lists")
    .select("*, person_list_items(count)")
    .eq("id", id)
    .single();
  return { data, error: error?.message ?? null };
}

export async function createList(name: string, description?: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("person_lists")
    .insert({ name, description: description || null })
    .select("id")
    .single();
  return { data, error: error?.message ?? null };
}

export async function updateList(id: string, updates: { name?: string; description?: string }) {
  const supabase = await createClient();
  const { error } = await supabase.from("person_lists").update(updates).eq("id", id);
  return { success: !error, error: error?.message ?? null };
}

export async function saveListFilter(id: string, rules: PersonFilterRules | null) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("person_lists")
    .update({ filter_rules: rules })
    .eq("id", id);
  return { success: !error, error: error?.message ?? null };
}

export async function deleteList(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("person_lists").delete().eq("id", id);
  return { success: !error, error: error?.message ?? null };
}

export async function getListItems(listId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("person_list_items")
    .select("person_id")
    .eq("list_id", listId);
  return { data: data ?? [], error: error?.message ?? null };
}

export async function addToList(listId: string, personIds: string[]) {
  if (personIds.length === 0) return { success: true, error: null };
  const supabase = await createClient();
  const rows = personIds.map((pid) => ({ list_id: listId, person_id: pid }));
  const { error } = await supabase
    .from("person_list_items")
    .upsert(rows, { onConflict: "list_id,person_id", ignoreDuplicates: true });
  return { success: !error, error: error?.message ?? null };
}

export async function removeFromList(listId: string, personIds: string[]) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("person_list_items")
    .delete()
    .eq("list_id", listId)
    .in("person_id", personIds);
  return { success: !error, error: error?.message ?? null };
}
