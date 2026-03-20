import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { GitBranch } from "lucide-react";
import Link from "next/link";
import type { Sequence } from "@/lib/types/database";

interface SequenceWithCounts extends Sequence {
  enrollment_count: number;
  completed_count: number;
}

export default async function SequencesPage() {
  const supabase = await createClient();

  const { data: sequences } = await supabase
    .from("sequences")
    .select("*")
    .order("created_at", { ascending: false });

  // Get enrollment counts per sequence
  const { data: enrollments } = await supabase
    .from("sequence_enrollments")
    .select("sequence_id, status");

  const enrollmentMap = new Map<
    string,
    { total: number; completed: number }
  >();
  (enrollments ?? []).forEach((e: { sequence_id: string; status: string }) => {
    const existing = enrollmentMap.get(e.sequence_id) ?? {
      total: 0,
      completed: 0,
    };
    existing.total++;
    if (e.status === "completed") existing.completed++;
    enrollmentMap.set(e.sequence_id, existing);
  });

  const sequencesWithCounts: SequenceWithCounts[] = (
    (sequences as Sequence[]) ?? []
  ).map((s) => {
    const counts = enrollmentMap.get(s.id) ?? { total: 0, completed: 0 };
    return {
      ...s,
      enrollment_count: counts.total,
      completed_count: counts.completed,
    };
  });

  const channelVariant: Record<string, string> = {
    email: "glass-indigo",
    linkedin: "glass-indigo",
    twitter: "glass-orange",
    telegram: "glass-orange",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold font-[family-name:var(--font-heading)] text-white">
          Sequences
        </h1>
      </div>

      {sequencesWithCounts.length === 0 ? (
        <GlassCard className="flex flex-col items-center justify-center py-16 text-center">
          <GitBranch className="h-12 w-12 text-[var(--text-muted)] mb-4" />
          <p className="text-[var(--text-secondary)] mb-1">
            No sequences yet
          </p>
          <p className="text-sm text-[var(--text-muted)]">
            Sequences let you automate multi-step outreach campaigns.
          </p>
        </GlassCard>
      ) : (
        <GlassCard padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--glass-border)] text-left">
                  <th className="px-5 py-3 text-[var(--text-muted)] font-medium">
                    Name
                  </th>
                  <th className="px-5 py-3 text-[var(--text-muted)] font-medium">
                    Channel
                  </th>
                  <th className="px-5 py-3 text-[var(--text-muted)] font-medium">
                    Steps
                  </th>
                  <th className="px-5 py-3 text-[var(--text-muted)] font-medium">
                    Contacts Enrolled
                  </th>
                  <th className="px-5 py-3 text-[var(--text-muted)] font-medium">
                    Completion Rate
                  </th>
                </tr>
              </thead>
              <tbody>
                {sequencesWithCounts.map((seq) => {
                  const steps = Array.isArray(seq.steps) ? seq.steps : [];
                  const completionRate =
                    seq.enrollment_count > 0
                      ? Math.round(
                          (seq.completed_count / seq.enrollment_count) * 100
                        )
                      : 0;

                  return (
                    <tr
                      key={seq.id}
                      className="border-b border-[var(--glass-border)] last:border-0 hover:bg-[var(--glass-bg-hover)] transition-all duration-200"
                    >
                      <td className="px-5 py-4">
                        <Link
                          href={`/admin/sequences/${seq.id}`}
                          className="text-white hover:text-[var(--accent-indigo)] transition-colors"
                        >
                          {seq.name}
                        </Link>
                      </td>
                      <td className="px-5 py-4">
                        <Badge variant={channelVariant[seq.channel] ?? "default"}>
                          {seq.channel}
                        </Badge>
                      </td>
                      <td className="px-5 py-4 text-[var(--text-secondary)]">
                        {steps.length}
                      </td>
                      <td className="px-5 py-4 text-[var(--text-secondary)]">
                        {seq.enrollment_count}
                      </td>
                      <td className="px-5 py-4 text-[var(--text-secondary)]">
                        {completionRate}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}
    </div>
  );
}
