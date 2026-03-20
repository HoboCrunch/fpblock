// lib/inbox-correlator.ts — Match inbound emails to pipeline contacts

import type { SupabaseClient } from "@supabase/supabase-js";
import type { InboundEmail } from "@/lib/types/database";
import {
  sendTelegramNotification,
  formatReplyNotification,
} from "@/lib/telegram";

export interface CorrelationResult {
  contact_id: string | null;
  correlation_type: "exact_email" | "domain_match" | "none";
  matched_message_id: string | null;
  contact?: { id: string; full_name: string };
  company?: { id: string; name: string; icp_score: number | null } | null;
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
 * Correlate an inbound email to a pipeline contact.
 *
 * Logic:
 * 1. Exact match: from_address against contacts.email
 * 2. Domain match: extract domain, match against companies.website
 * 3. If matched: update most recent outbound message status to 'replied'
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
    .from("contacts")
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

  // 2. Domain match — extract domain from sender, match against companies
  const senderDomain = extractDomain(fromAddress);
  if (senderDomain) {
    const { data: companies } = await supabase
      .from("companies")
      .select("id, name, website, icp_score")
      .not("website", "is", null);

    if (companies?.length) {
      const matchedCompany = companies.find((c) => {
        if (!c.website) return false;
        return normalizeDomain(c.website) === senderDomain;
      });

      if (matchedCompany) {
        // Find a contact at this company
        const { data: contactCompany } = await supabase
          .from("contact_companies")
          .select("contact_id")
          .eq("company_id", matchedCompany.id)
          .limit(1)
          .single();

        if (contactCompany) {
          const { data: contact } = await supabase
            .from("contacts")
            .select("id, full_name")
            .eq("id", contactCompany.contact_id)
            .single();

          if (contact) {
            const result = await processCorrelation(
              supabase,
              inboundEmail,
              contact,
              "domain_match",
              matchedCompany
            );
            return result;
          }
        }

        // Company matched but no contact linked — return domain match with no contact
        await logCorrelation(supabase, inboundEmail.id, null, "domain_match", null, {
          company_id: matchedCompany.id,
          company_name: matchedCompany.name,
        });

        return {
          contact_id: null,
          correlation_type: "domain_match",
          matched_message_id: null,
          company: matchedCompany,
        };
      }
    }
  }

  // 3. No match
  await logCorrelation(supabase, inboundEmail.id, null, "none", null);

  return {
    contact_id: null,
    correlation_type: "none",
    matched_message_id: null,
  };
}

async function processCorrelation(
  supabase: SupabaseClient,
  inboundEmail: Pick<
    InboundEmail,
    "id" | "from_address" | "from_name" | "subject" | "body_preview" | "received_at"
  >,
  contact: { id: string; full_name: string },
  correlationType: "exact_email" | "domain_match",
  company?: { id: string; name: string; icp_score: number | null } | null
): Promise<CorrelationResult> {
  // Find the most recent outbound message to this contact
  const { data: recentMessage } = await supabase
    .from("messages")
    .select("id, company_id")
    .eq("contact_id", contact.id)
    .eq("channel", "email")
    .in("status", ["sent", "delivered", "opened"])
    .order("sent_at", { ascending: false })
    .limit(1)
    .single();

  let matchedMessageId: string | null = null;

  if (recentMessage) {
    // Update message status to 'replied'
    await supabase
      .from("messages")
      .update({
        status: "replied",
        replied_at: inboundEmail.received_at,
      })
      .eq("id", recentMessage.id);

    matchedMessageId = recentMessage.id;
  }

  // Update the inbound email record with correlation
  await supabase
    .from("inbound_emails")
    .update({
      contact_id: contact.id,
      correlated_message_id: matchedMessageId,
      correlation_type: correlationType,
    })
    .eq("id", inboundEmail.id);

  // If we don't have company info yet, try to fetch it from the matched message
  if (!company && recentMessage?.company_id) {
    const { data: companyData } = await supabase
      .from("companies")
      .select("id, name, icp_score")
      .eq("id", recentMessage.company_id)
      .single();
    company = companyData;
  }

  // Also try fetching from contact_companies if still no company
  if (!company) {
    const { data: cc } = await supabase
      .from("contact_companies")
      .select("company:companies(id, name, icp_score)")
      .eq("contact_id", contact.id)
      .eq("is_primary", true)
      .limit(1)
      .single();
    if (cc?.company) {
      company = cc.company as unknown as {
        id: string;
        name: string;
        icp_score: number | null;
      };
    }
  }

  await logCorrelation(
    supabase,
    inboundEmail.id,
    contact.id,
    correlationType,
    matchedMessageId
  );

  return {
    contact_id: contact.id,
    correlation_type: correlationType,
    matched_message_id: matchedMessageId,
    contact,
    company: company || null,
  };
}

async function logCorrelation(
  supabase: SupabaseClient,
  emailId: string,
  contactId: string | null,
  correlationType: string,
  messageId: string | null,
  extra?: Record<string, unknown>
) {
  await supabase.from("job_log").insert({
    job_type: "inbox_correlation",
    target_table: "inbound_emails",
    target_id: emailId,
    status: correlationType === "none" ? "no_match" : "matched",
    metadata: {
      contact_id: contactId,
      correlation_type: correlationType,
      matched_message_id: messageId,
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

  if (result.contact_id && result.contact) {
    const message = formatReplyNotification(
      result.contact,
      result.company || null,
      {
        subject: inboundEmail.subject || null,
        body_preview: inboundEmail.body_preview || null,
      }
    );
    await sendTelegramNotification(message);
  }

  return result;
}
