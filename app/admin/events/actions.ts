"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/events/slug";

export interface CreateEventInput {
  name: string;
  event_type?: string;
  date_start?: string;
  date_end?: string;
  location?: string;
  website?: string;
  notes?: string;
}

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function createEvent(
  input: CreateEventInput,
): Promise<{ id: string; name: string }> {
  const name = input.name?.trim() ?? "";
  if (!name) {
    throw new Error("Event name is required");
  }

  const supabase = await createClient();

  const slug = slugify(name) || null;

  const baseRow = {
    name,
    event_type: emptyToNull(input.event_type),
    date_start: emptyToNull(input.date_start),
    date_end: emptyToNull(input.date_end),
    location: emptyToNull(input.location),
    website: emptyToNull(input.website),
    notes: emptyToNull(input.notes),
  };

  let { data, error } = await supabase
    .from("events")
    .insert({ ...baseRow, slug })
    .select("id, name")
    .single();

  // Retry once with a null slug on unique-violation (slug collision).
  if (error && error.code === "23505") {
    ({ data, error } = await supabase
      .from("events")
      .insert({ ...baseRow, slug: null })
      .select("id, name")
      .single());
  }

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create event");
  }

  revalidatePath("/admin/events");

  const row = data as { id: string; name: string };
  return { id: row.id, name: row.name };
}
