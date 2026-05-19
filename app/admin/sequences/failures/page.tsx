import { createClient } from "@/lib/supabase/server";
import { FailuresClient, type FailureRow } from "./failures-client";

export const dynamic = "force-dynamic";

interface RawFailureRow {
  id: string;
  status: string;
  occurred_at: string | null;
  scheduled_at: string | null;
  sequence_step: number | null;
  detail: Record<string, unknown> | null;
  persons: {
    id: string;
    full_name: string | null;
    email: string | null;
  } | null;
  sequences: {
    id: string;
    name: string | null;
  } | null;
}

export default async function SequenceFailuresPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("interactions")
    .select(
      "id, status, occurred_at, scheduled_at, sequence_step, detail, persons(id, full_name, email), sequences(id, name)"
    )
    .in("status", ["failed", "bounced"])
    .order("occurred_at", { ascending: false, nullsFirst: false })
    .limit(500);

  if (error) {
    return (
      <div className="p-6">
        <p className="text-red-400">Failed to load: {error.message}</p>
      </div>
    );
  }

  const rows: FailureRow[] = ((data ?? []) as unknown as RawFailureRow[]).map((r) => {
    const detail = r.detail ?? {};
    return {
      id: r.id,
      status: r.status,
      personId: r.persons?.id ?? null,
      personName: r.persons?.full_name ?? null,
      personEmail: r.persons?.email ?? null,
      sequenceId: r.sequences?.id ?? null,
      sequenceName: r.sequences?.name ?? null,
      step: r.sequence_step,
      failedAt: r.occurred_at,
      lastError:
        typeof detail.last_error === "string"
          ? (detail.last_error as string)
          : typeof detail.error === "string"
            ? (detail.error as string)
            : null,
      lastStatusCode:
        typeof detail.last_status_code === "number"
          ? (detail.last_status_code as number)
          : null,
      retryCount:
        typeof detail.retry_count === "number" ? (detail.retry_count as number) : 0,
      terminalReason:
        typeof detail.terminal_reason === "string"
          ? (detail.terminal_reason as string)
          : null,
    };
  });

  return <FailuresClient initialRows={rows} />;
}
