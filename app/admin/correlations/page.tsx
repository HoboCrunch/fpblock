import { createClient } from "@/lib/supabase/server";
import { CorrelationReview } from "@/components/admin/correlation-review";
import type { CandidateWithEntities } from "@/components/admin/correlation-review";
import type { CorrelationCandidate, Person, Organization } from "@/lib/types/database";

export default async function CorrelationsPage() {
  const supabase = await createClient();

  // Fetch pending correlation candidates, ordered by confidence descending
  const { data: rawCandidates } = await supabase
    .from("correlation_candidates")
    .select("*")
    .eq("status", "pending")
    .order("confidence", { ascending: false });

  const candidates = (rawCandidates ?? []) as CorrelationCandidate[];

  // Collect unique person and org IDs we need to fetch
  const personIds = new Set<string>();
  const orgIds = new Set<string>();

  for (const c of candidates) {
    if (c.entity_type === "person") {
      personIds.add(c.source_id);
      personIds.add(c.target_id);
    } else {
      orgIds.add(c.source_id);
      orgIds.add(c.target_id);
    }
  }

  // Fetch persons and orgs in parallel
  const [personsResult, orgsResult] = await Promise.all([
    personIds.size > 0
      ? supabase
          .from("persons")
          .select("*")
          .in("id", Array.from(personIds))
      : Promise.resolve({ data: [] }),
    orgIds.size > 0
      ? supabase
          .from("organizations")
          .select("*")
          .in("id", Array.from(orgIds))
      : Promise.resolve({ data: [] }),
  ]);

  const personsMap = new Map<string, Person>();
  for (const p of (personsResult.data ?? []) as Person[]) {
    personsMap.set(p.id, p);
  }

  const orgsMap = new Map<string, Organization>();
  for (const o of (orgsResult.data ?? []) as Organization[]) {
    orgsMap.set(o.id, o);
  }

  // Assemble enriched candidates
  const enriched: CandidateWithEntities[] = candidates.map((c) => ({
    ...c,
    source_person: c.entity_type === "person" ? personsMap.get(c.source_id) ?? null : null,
    target_person: c.entity_type === "person" ? personsMap.get(c.target_id) ?? null : null,
    source_organization: c.entity_type === "organization" ? orgsMap.get(c.source_id) ?? null : null,
    target_organization: c.entity_type === "organization" ? orgsMap.get(c.target_id) ?? null : null,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold font-[family-name:var(--font-heading)] text-white">
          Correlation Review
        </h1>
        <span className="text-sm text-[var(--text-muted)]">
          {enriched.length} pending candidate{enriched.length !== 1 ? "s" : ""}
        </span>
      </div>

      <CorrelationReview candidates={enriched} />
    </div>
  );
}
