// lib/inbox-correlator.ts — Match inbound emails to pipeline persons

import type { SupabaseClient } from "@supabase/supabase-js";
import type { InboundEmail } from "@/lib/types/database";
import {
  sendTelegramNotification,
  formatReplyNotification,
} from "@/lib/telegram";

export interface CorrelationResult {
  person_id: string | null;
  correlation_type: "exact_email" | "domain_match" | "none";
  correlated_interaction_id: string | null;
  person?: { id: string; full_name: string };
  organization?: { id: string; name: string; icp_score: number | null } | null;
}

/**
 * Extract domain from an email address.
 */
function extractDomain(email: string): string | null {
  const parts = email.split("@");
  if (parts.length !== 2) return null;
  return parts[1].toLowerCase();
}

/**
 * Normalize a website URL to just its domain for comparison.
 */
function normalizeDomain(url: string): string {
  try {
    const hostname = new URL(
      url.startsWith("http") ? url : `https://${url}`
    ).hostname;
    return hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.replace(/^(https?:\/\/)?(www\.)?/, "").split("/")[0].toLowerCase();
  }
}

/**
 * Correlate an inbound email to a pipeline person.
 *
 * Logic:
 * 1. Exact match: from_address against persons.email
 * 2. Domain match: extract domain, match against organizations.website
 * 3. If matched: update most recent outbound interaction status to 'replied'
 * 4. Log correlation to job_log
 */
export async function correlateEmail(
  supabase: SupabaseClient,
  inboundEmail: Pick<
    InboundEmail,
    "id" | "from_address" | "from_name" | "subject" | "body_preview" | "received_at"
  >
): Promise<CorrelationResult> {
  const fromAddress = inboundEmail.from_address.toLowerCase();

  // 1. Exact email match
  const { data: exactMatch } = await supabase
    .from("persons")
    .select("id, full_name")
    .ilike("email", fromAddress)
    .limit(1)
    .single();

  if (exactMatch) {
    const result = await processCorrelation(
      supabase,
      inboundEmail,
      exactMatch,
      "exact_email"
    );
    return result;
  }

  // 2. Domain match — extract domain from sender, match against organizations
  const senderDomain = extractDomain(fromAddress);
  if (senderDomain) {
    const { data: organizations } = await supabase
      .from("organizations")
      .select("id, name, website, icp_score")
      .not("website", "is", null);

    if (organizations?.length) {
      const matchedOrg = organizations.find((o) => {
        if (!o.website) return false;
        return normalizeDomain(o.website) === senderDomain;
      });

      if (matchedOrg) {
        // Find a person at this organization
        const { data: personOrg } = await supabase
          .from("person_organizations")
          .select("person_id")
          .eq("organization_id", matchedOrg.id)
          .limit(1)
          .single();

        if (personOrg) {
          const { data: person } = await supabase
            .from("persons")
            .select("id, full_name")
            .eq("id", personOrg.person_id)
            .single();

          if (person) {
            const result = await processCorrelation(
              supabase,
              inboundEmail,
              person,
              "domain_match",
              matchedOrg
            );
            return result;
          }
        }

        // Organization matched but no person linked — return domain match with no person
        await logCorrelation(supabase, inboundEmail.id, null, "domain_match", null, {
          organization_id: matchedOrg.id,
          organization_name: matchedOrg.name,
        });

        return {
          person_id: null,
          correlation_type: "domain_match",
          correlated_interaction_id: null,
          organization: matchedOrg,
        };
      }
    }
  }

  // 3. No match
  await logCorrelation(supabase, inboundEmail.id, null, "none", null);

  return {
    person_id: null,
    correlation_type: "none",
    correlated_interaction_id: null,
  };
}

async function processCorrelation(
  supabase: SupabaseClient,
  inboundEmail: Pick<
    InboundEmail,
    "id" | "from_address" | "from_name" | "subject" | "body_preview" | "received_at"
  >,
  person: { id: string; full_name: string },
  correlationType: "exact_email" | "domain_match",
  organization?: { id: string; name: string; icp_score: number | null } | null
): Promise<CorrelationResult> {
  // Find the most recent outbound interaction to this person
  const { data: recentInteraction } = await supabase
    .from("interactions")
    .select("id, organization_id")
    .eq("person_id", person.id)
    .eq("channel", "email")
    .eq("direction", "outbound")
    .in("status", ["sent", "delivered", "opened"])
    .order("occurred_at", { ascending: false })
    .limit(1)
    .single();

  let correlatedInteractionId: string | null = null;

  if (recentInteraction) {
    // Update interaction status to 'replied'
    await supabase
      .from("interactions")
      .update({
        status: "replied",
      })
      .eq("id", recentInteraction.id);

    correlatedInteractionId = recentInteraction.id;
  }

  // Update the inbound email record with correlation
  await supabase
    .from("inbound_emails")
    .update({
      person_id: person.id,
      correlated_interaction_id: correlatedInteractionId,
      correlation_type: correlationType,
    })
    .eq("id", inboundEmail.id);

  // If we don't have organization info yet, try to fetch it from the matched interaction
  if (!organization && recentInteraction?.organization_id) {
    const { data: orgData } = await supabase
      .from("organizations")
      .select("id, name, icp_score")
      .eq("id", recentInteraction.organization_id)
      .single();
    organization = orgData;
  }

  // Also try fetching from person_organizations if still no organization
  if (!organization) {
    const { data: po } = await supabase
      .from("person_organizations")
      .select("org:organizations(id, name, icp_score)")
      .eq("person_id", person.id)
      .eq("is_primary", true)
      .limit(1)
      .single();
    if (po?.org) {
      organization = po.org as unknown as {
        id: string;
        name: string;
        icp_score: number | null;
      };
    }
  }

  await logCorrelation(
    supabase,
    inboundEmail.id,
    person.id,
    correlationType,
    correlatedInteractionId
  );

  return {
    person_id: person.id,
    correlation_type: correlationType,
    correlated_interaction_id: correlatedInteractionId,
    person,
    organization: organization || null,
  };
}

async function logCorrelation(
  supabase: SupabaseClient,
  emailId: string,
  personId: string | null,
  correlationType: string,
  interactionId: string | null,
  extra?: Record<string, unknown>
) {
  await supabase.from("job_log").insert({
    job_type: "inbox_correlation",
    target_table: "inbound_emails",
    target_id: emailId,
    status: correlationType === "none" ? "no_match" : "matched",
    metadata: {
      person_id: personId,
      correlation_type: correlationType,
      correlated_interaction_id: interactionId,
      ...extra,
    },
  });
}

/**
 * Correlate an email and send a Telegram notification if successfully correlated.
 */
export async function correlateAndNotify(
  supabase: SupabaseClient,
  inboundEmail: Pick<
    InboundEmail,
    "id" | "from_address" | "from_name" | "subject" | "body_preview" | "received_at"
  >
): Promise<CorrelationResult> {
  const result = await correlateEmail(supabase, inboundEmail);

  if (result.person_id && result.person) {
    const message = formatReplyNotification(
      result.person,
      result.organization || null,
      {
        subject: inboundEmail.subject || null,
        body_preview: inboundEmail.body_preview || null,
      }
    );
    await sendTelegramNotification(message);
  }

  return result;
}
