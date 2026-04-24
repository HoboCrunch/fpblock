/**
 * scripts/verify-event-affiliations.ts
 *
 * Exercises the bidirectional triggers on person_event_affiliations by creating
 * isolated fixtures in the dev DB, performing each lifecycle event, and
 * asserting affiliation-row counts. Prints PASS/FAIL per scenario.
 *
 * Run:   npx tsx scripts/verify-event-affiliations.ts
 * Needs: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env
 */
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
  process.exit(1);
}
const supabase = createClient(url, key);

let failures = 0;
function assert(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    console.log(`  PASS  ${name}`);
  } else {
    console.log(`  FAIL  ${name}`, extra ?? "");
    failures++;
  }
}

async function countAffiliations(eventId: string, personId?: string, viaOrgId?: string) {
  let q = supabase.from("person_event_affiliations").select("id", { count: "exact", head: true })
    .eq("event_id", eventId);
  if (personId) q = q.eq("person_id", personId);
  if (viaOrgId) q = q.eq("via_organization_id", viaOrgId);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

async function setupFixture() {
  const { data: event } = await supabase.from("events").insert({
    name: `verify-event-${Date.now()}`,
    slug: `verify-event-${Date.now()}`,
  }).select("id").single();

  const { data: orgA } = await supabase.from("organizations").insert({
    name: `verify-org-a-${Date.now()}`,
  }).select("id").single();
  const { data: orgB } = await supabase.from("organizations").insert({
    name: `verify-org-b-${Date.now()}`,
  }).select("id").single();

  const { data: person } = await supabase.from("persons").insert({
    full_name: `verify-person-${Date.now()}`,
  }).select("id").single();

  return {
    eventId: event!.id as string,
    orgAId: orgA!.id as string,
    orgBId: orgB!.id as string,
    personId: person!.id as string,
  };
}

async function teardown(ids: { eventId: string; orgAId: string; orgBId: string; personId: string }) {
  await supabase.from("events").delete().eq("id", ids.eventId);
  await supabase.from("organizations").delete().in("id", [ids.orgAId, ids.orgBId]);
  await supabase.from("persons").delete().eq("id", ids.personId);
}

async function run() {
  const ids = await setupFixture();
  const { eventId, orgAId, orgBId, personId } = ids;

  try {
    console.log("Scenario 1: insert event_participations(org) then person_organization");
    await supabase.from("event_participations").insert({
      event_id: eventId, organization_id: orgAId, role: "sponsor",
    });
    await supabase.from("person_organization").insert({
      person_id: personId, organization_id: orgAId, is_current: true,
    });
    assert("affiliation exists after both writes",
      (await countAffiliations(eventId, personId, orgAId)) === 1);

    console.log("Scenario 2: is_current true -> false does NOT remove");
    await supabase.from("person_organization")
      .update({ is_current: false })
      .eq("person_id", personId).eq("organization_id", orgAId);
    assert("affiliation persists after is_current flip",
      (await countAffiliations(eventId, personId, orgAId)) === 1);

    console.log("Scenario 3: is_current false -> true idempotent");
    await supabase.from("person_organization")
      .update({ is_current: true })
      .eq("person_id", personId).eq("organization_id", orgAId);
    assert("still exactly one affiliation",
      (await countAffiliations(eventId, personId, orgAId)) === 1);

    console.log("Scenario 4: second participating org adds a second affiliation");
    await supabase.from("event_participations").insert({
      event_id: eventId, organization_id: orgBId, role: "partner",
    });
    await supabase.from("person_organization").insert({
      person_id: personId, organization_id: orgBId, is_current: true,
    });
    assert("two affiliations for same (event, person)",
      (await countAffiliations(eventId, personId)) === 2);

    console.log("Scenario 5: delete person_organization(orgA) removes only that path");
    await supabase.from("person_organization")
      .delete().eq("person_id", personId).eq("organization_id", orgAId);
    assert("orgA path removed",
      (await countAffiliations(eventId, personId, orgAId)) === 0);
    assert("orgB path remains",
      (await countAffiliations(eventId, personId, orgBId)) === 1);

    console.log("Scenario 6: delete event_participations(orgB) removes affiliation");
    await supabase.from("event_participations")
      .delete().eq("event_id", eventId).eq("organization_id", orgBId);
    assert("all affiliations for event gone",
      (await countAffiliations(eventId, personId)) === 0);

    console.log("Scenario 7: backfill idempotency (direct duplicate insert)");
    await supabase.from("event_participations").insert({
      event_id: eventId, organization_id: orgAId, role: "sponsor",
    });
    await supabase.from("person_organization").insert({
      person_id: personId, organization_id: orgAId, is_current: true,
    });
    const { error: reInsertErr } = await supabase.from("person_event_affiliations").insert({
      event_id: eventId, person_id: personId, via_organization_id: orgAId,
    });
    assert("direct re-insert collides",
      reInsertErr !== null && /duplicate|unique/i.test(reInsertErr!.message));
    assert("still exactly one row",
      (await countAffiliations(eventId, personId, orgAId)) === 1);
  } finally {
    await teardown(ids);
  }

  console.log(failures === 0 ? "\nALL SCENARIOS PASSED" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
