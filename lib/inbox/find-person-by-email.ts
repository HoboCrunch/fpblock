// lib/inbox/find-person-by-email.ts
import type { SupabaseClient } from "@supabase/supabase-js";

export interface PersonMatch {
  person_id: string | null;
  match_type: "exact_email" | "domain_match" | "none";
  person: { id: string; full_name: string } | null;
  organization: { id: string; name: string; icp_score: number | null } | null;
}

function extractDomain(email: string): string | null {
  const parts = email.split("@");
  if (parts.length !== 2) return null;
  return parts[1].toLowerCase();
}

function normalizeDomain(url: string): string {
  try {
    const hostname = new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
    return hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.replace(/^(https?:\/\/)?(www\.)?/, "").split("/")[0].toLowerCase();
  }
}

export async function findPersonByEmail(
  supabase: SupabaseClient,
  address: string
): Promise<PersonMatch> {
  const lower = address.toLowerCase();

  const { data: exact } = await supabase
    .from("persons")
    .select("id, full_name")
    .ilike("email", lower)
    .limit(1)
    .maybeSingle();
  if (exact) {
    return {
      person_id: exact.id,
      match_type: "exact_email",
      person: { id: exact.id, full_name: exact.full_name },
      organization: null,
    };
  }

  const domain = extractDomain(lower);
  if (!domain) {
    return { person_id: null, match_type: "none", person: null, organization: null };
  }

  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, name, website, icp_score")
    .not("website", "is", null);
  const matched = (orgs ?? []).find(
    (o: { website: string | null }) => o.website && normalizeDomain(o.website) === domain
  );
  if (!matched) {
    return { person_id: null, match_type: "none", person: null, organization: null };
  }

  const { data: po } = await supabase
    .from("person_organizations")
    .select("person_id")
    .eq("organization_id", matched.id)
    .limit(1)
    .maybeSingle();
  if (!po) {
    return {
      person_id: null,
      match_type: "domain_match",
      person: null,
      organization: { id: matched.id, name: matched.name, icp_score: matched.icp_score },
    };
  }

  const { data: person } = await supabase
    .from("persons")
    .select("id, full_name")
    .eq("id", po.person_id)
    .maybeSingle();
  if (!person) {
    return {
      person_id: null,
      match_type: "domain_match",
      person: null,
      organization: { id: matched.id, name: matched.name, icp_score: matched.icp_score },
    };
  }

  return {
    person_id: person.id,
    match_type: "domain_match",
    person: { id: person.id, full_name: person.full_name },
    organization: { id: matched.id, name: matched.name, icp_score: matched.icp_score },
  };
}
