"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export interface RetryResult {
  succeeded: string[];
  failed: { id: string; error: string }[];
}

/**
 * Requeue failed/bounced interactions for another send attempt.
 * Resets status to 'scheduled' with retry_count cleared and scheduled_at = now.
 * Only rows currently in 'failed' or 'bounced' are eligible.
 */
export async function retryFailedInteractions(ids: string[]): Promise<RetryResult> {
  if (ids.length === 0) {
    return { succeeded: [], failed: [] };
  }

  const supabase = await createClient();

  const { data: existing, error: fetchError } = await supabase
    .from("interactions")
    .select("id, status, detail")
    .in("id", ids);

  if (fetchError) {
    return {
      succeeded: [],
      failed: ids.map((id) => ({ id, error: fetchError.message })),
    };
  }

  const eligible = new Set(["failed", "bounced"]);
  const seen = new Set<string>();
  const succeeded: string[] = [];
  const failed: { id: string; error: string }[] = [];

  const nowIso = new Date().toISOString();

  for (const row of (existing ?? []) as Array<{
    id: string;
    status: string;
    detail: Record<string, unknown> | null;
  }>) {
    seen.add(row.id);
    if (!eligible.has(row.status)) {
      failed.push({ id: row.id, error: `status "${row.status}" not eligible` });
      continue;
    }

    const prevDetail = row.detail ?? {};
    const { error: updateError } = await supabase
      .from("interactions")
      .update({
        status: "scheduled",
        scheduled_at: nowIso,
        occurred_at: null,
        detail: {
          ...prevDetail,
          retry_count: 0,
          manual_retry_at: nowIso,
        },
      })
      .eq("id", row.id);

    if (updateError) {
      failed.push({ id: row.id, error: updateError.message });
    } else {
      succeeded.push(row.id);
    }
  }

  for (const id of ids) {
    if (!seen.has(id)) {
      failed.push({ id, error: "not found" });
    }
  }

  revalidatePath("/admin/sequences/failures");
  return { succeeded, failed };
}
