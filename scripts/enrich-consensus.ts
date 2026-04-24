import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { runBatchEnrichment } from "../lib/enrichment/pipeline";
import { runBatchPersonEnrichment } from "../lib/enrichment/person-pipeline";

config({ path: ".env.local" });

const EVENT_ID = "a830978d-07e5-49a2-9e9b-11575eaf996a";

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_SUPABASE_SECRET_KEY!
  );

  const mode = process.argv[2] ?? "both"; // "persons" | "orgs" | "both"

  // ----- Resolve event window -----
  const { data: eventRow } = await supabase
    .from("events")
    .select("created_at")
    .eq("id", EVENT_ID)
    .single();
  if (!eventRow) throw new Error("Consensus event not found");
  const since = eventRow.created_at;
  console.log(`Consensus event created_at: ${since}`);

  // ========== ORGS ==========
  if (mode === "orgs" || mode === "both") {
    console.log("\n=== Resolving new orgs (created during consensus import) ===");
    // Fetch all orgs created since event creation — paginated in case > 1000
    const allNewOrgs: { id: string; name: string }[] = [];
    let from = 0;
    const pageSize = 500;
    while (true) {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name")
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      allNewOrgs.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
    }
    console.log(`Found ${allNewOrgs.length} new orgs to enrich`);

    if (allNewOrgs.length > 0) {
      const { data: job, error: jobErr } = await supabase
        .from("job_log")
        .insert({
          job_type: "enrichment_batch_organizations",
          target_table: "organizations",
          status: "processing",
          metadata: {
            stages: ["full"],
            org_count: allNewOrgs.length,
            organization_ids: allNewOrgs.length <= 500 ? allNewOrgs.map((o) => o.id) : null,
            target_label: "consensus: new orgs",
            event_id: EVENT_ID,
          },
        })
        .select("id")
        .single();
      if (jobErr || !job) throw new Error(`Failed to create org job: ${jobErr?.message}`);
      console.log(`Parent job: ${job.id}`);

      const start = Date.now();
      try {
        const result = await runBatchEnrichment(
          supabase,
          allNewOrgs.map((o) => o.id),
          {
            stages: ["full"],
            concurrency: 3,
            parentJobId: job.id,
            peopleFinderConfig: {
              perCompany: 5,
              seniorities: ["owner", "founder", "c_suite", "vp", "director"],
              departments: [],
            },
            onProgress: (completed, total, orgName) => {
              if (completed % 10 === 0 || completed === total) {
                const elapsed = ((Date.now() - start) / 1000).toFixed(0);
                console.log(`  [orgs ${completed}/${total}] ${elapsed}s — last: ${orgName}`);
              }
            },
          }
        );

        const totalSignals = result.results.reduce((s, r) => s + r.signalsCreated, 0);
        const totalPeopleFound = result.results.reduce((s, r) => s + (r.peopleFinder?.found ?? 0), 0);
        const totalPeopleCreated = result.results.reduce((s, r) => s + (r.peopleFinder?.created ?? 0), 0);

        await supabase
          .from("job_log")
          .update({
            status: "completed",
            metadata: {
              stages: ["full"],
              org_count: allNewOrgs.length,
              orgs_enriched: result.succeeded,
              orgs_failed: result.failed,
              signals_created: totalSignals,
              duration_ms: result.durationMs,
              event_id: EVENT_ID,
            },
          })
          .eq("id", job.id);

        console.log(`\n✓ Orgs done: ${result.succeeded}/${result.total} enriched, ${result.failed} failed`);
        console.log(`  Signals created: ${totalSignals}`);
        console.log(`  People found: ${totalPeopleFound}, created: ${totalPeopleCreated}`);
        console.log(`  Duration: ${(result.durationMs / 1000).toFixed(0)}s`);
      } catch (err) {
        await supabase
          .from("job_log")
          .update({
            status: "failed",
            error: err instanceof Error ? err.message : String(err),
          })
          .eq("id", job.id);
        throw err;
      }
    }
  }

  // ========== PERSONS ==========
  if (mode === "persons" || mode === "both") {
    console.log("\n=== Resolving new persons (source=consensus_import) ===");
    const { data: newPersons, error: personErr } = await supabase
      .from("persons")
      .select("id")
      .eq("source", "consensus_import");
    if (personErr) throw personErr;
    const personIds = (newPersons ?? []).map((p) => p.id);
    console.log(`Found ${personIds.length} new persons to enrich`);

    if (personIds.length > 0) {
      const { data: job, error: jobErr } = await supabase
        .from("job_log")
        .insert({
          job_type: "enrichment_batch_persons",
          target_table: "persons",
          status: "processing",
          metadata: {
            person_count: personIds.length,
            person_ids: personIds.length <= 500 ? personIds : null,
            target_label: "consensus: new persons",
            event_id: EVENT_ID,
          },
        })
        .select("id")
        .single();
      if (jobErr || !job) throw new Error(`Failed to create person job: ${jobErr?.message}`);
      console.log(`Parent job: ${job.id}`);

      const start = Date.now();
      try {
        const result = await runBatchPersonEnrichment(supabase, personIds, {
          parentJobId: job.id,
          onProgress: (completed, total, personName) => {
            if (completed % 10 === 0 || completed === total) {
              const elapsed = ((Date.now() - start) / 1000).toFixed(0);
              console.log(`  [persons ${completed}/${total}] ${elapsed}s — last: ${personName}`);
            }
          },
        });

        const enriched = result.results.filter((r) => r.success).length;
        const failed = result.results.filter((r) => !r.success).length;
        const orgsCreated = result.results.filter((r) => r.orgCreated).length;

        await supabase
          .from("job_log")
          .update({
            status: "completed",
            metadata: {
              person_count: personIds.length,
              persons_enriched: enriched,
              persons_failed: failed,
              orgs_created: orgsCreated,
              duration_ms: result.durationMs,
              event_id: EVENT_ID,
            },
          })
          .eq("id", job.id);

        console.log(`\n✓ Persons done: ${enriched}/${personIds.length} enriched, ${failed} failed, ${orgsCreated} orgs created via reverse linkage`);
        console.log(`  Duration: ${(result.durationMs / 1000).toFixed(0)}s`);
      } catch (err) {
        await supabase
          .from("job_log")
          .update({
            status: "failed",
            error: err instanceof Error ? err.message : String(err),
          })
          .eq("id", job.id);
        throw err;
      }
    }
  }

  console.log("\n=== All done ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
