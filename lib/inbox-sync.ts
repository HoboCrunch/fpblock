// lib/inbox-sync.ts — shared Fastmail inbox sync logic
//
// Each managed identity (jb@gofpblock.com, wes@gofpblock.com) lives in its own
// Fastmail JMAP account and authenticates with its own API token. We sync each
// account independently and write one row per inbox email under that identity.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { InboundEmail } from "@/lib/types/database";
import { fetchEmails, fetchSentEmails } from "@/lib/fastmail";
import { correlateAndNotify } from "@/lib/inbox-correlator";
import { findPersonByEmail } from "@/lib/inbox/find-person-by-email";

export interface InboxIdentity {
  identity: string;
  apiKey: string;
}

/**
 * Read the configured Fastmail identities from env.
 * Add a new identity by setting FASTMAIL_API_KEY_<HANDLE> alongside an entry here.
 */
export function getInboxIdentities(): InboxIdentity[] {
  const configured: { identity: string; envVar: string }[] = [
    { identity: "jb@gofpblock.com", envVar: "FASTMAIL_API_KEY_JB" },
    { identity: "wes@gofpblock.com", envVar: "FASTMAIL_API_KEY_WES" },
  ];
  return configured
    .map(({ identity, envVar }) => ({ identity, apiKey: process.env[envVar] || "" }))
    .filter((c) => !!c.apiKey);
}

export interface IdentitySyncResult {
  identity: string;
  new_emails: number;
  new_inbound: number;
  new_outbound: number;
  correlated: number;
  error?: string;
}

export interface SyncSummary {
  new_emails: number;
  correlated: number;
  per_identity: IdentitySyncResult[];
}

/**
 * Run a Fastmail inbox sync for every configured identity.
 *
 * Each identity points at its own JMAP account, so we sync them independently
 * and don't share cursors across accounts.
 */
export async function runInboxSync(
  supabase: SupabaseClient,
  identities: InboxIdentity[] = getInboxIdentities()
): Promise<SyncSummary> {
  if (!identities.length) {
    throw new Error("No Fastmail identities configured");
  }

  const results: IdentitySyncResult[] = [];

  for (const { identity, apiKey } of identities) {
    try {
      const result = await syncIdentity(supabase, identity, apiKey);
      results.push(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[inbox-sync] ${identity} failed:`, message);
      await markIdentityError(supabase, identity, message);
      results.push({
        identity,
        new_emails: 0,
        new_inbound: 0,
        new_outbound: 0,
        correlated: 0,
        error: message,
      });
    }
  }

  return {
    new_emails: results.reduce((s, r) => s + r.new_emails, 0),
    correlated: results.reduce((s, r) => s + r.correlated, 0),
    per_identity: results,
  };
}

async function syncIdentity(
  supabase: SupabaseClient,
  identity: string,
  apiKey: string
): Promise<IdentitySyncResult> {
  const { data: state } = await supabase
    .from("inbox_sync_state")
    .select("last_email_id, last_sent_email_id")
    .eq("account_email", identity)
    .maybeSingle();

  const inboxSinceId: string | undefined = state?.last_email_id || undefined;
  const sentSinceId: string | undefined = state?.last_sent_email_id || undefined;

  // Initial fill (no cursor) pulls a much bigger batch so the full mailbox
  // comes over in one shot. Incremental syncs stay small.
  const inboxLimit = inboxSinceId ? 50 : 500;
  const sentLimit = sentSinceId ? 50 : 500;

  const [inbound, outbound] = await Promise.all([
    fetchEmails(apiKey, [identity], inboxSinceId, inboxLimit),
    fetchSentEmails(apiKey, identity, sentSinceId, sentLimit),
  ]);

  const inboundResult = await insertBatch(supabase, identity, inbound, {
    runCorrelation: true,
  });
  const outboundResult = await insertBatch(supabase, identity, outbound, {
    runCorrelation: false,
    reconcileOutbound: true,
    accountEmail: identity,
  });

  const newInboxCursor = inbound[0]?.message_id || inboxSinceId || null;
  const newSentCursor = outbound[0]?.message_id || sentSinceId || null;
  const now = new Date().toISOString();

  const { count } = await supabase
    .from("inbound_emails")
    .select("id", { count: "exact", head: true })
    .eq("account_email", identity)
    .eq("direction", "inbound")
    .eq("is_read", false);

  await supabase.from("inbox_sync_state").upsert(
    {
      account_email: identity,
      last_email_id: newInboxCursor,
      last_sent_email_id: newSentCursor,
      last_sync_at: now,
      unread_count: count ?? 0,
      status: "connected" as const,
      error_message: null,
      updated_at: now,
    },
    { onConflict: "account_email" }
  );

  return {
    identity,
    new_emails: inboundResult.inserted + outboundResult.inserted,
    new_inbound: inboundResult.inserted,
    new_outbound: outboundResult.inserted,
    correlated: inboundResult.correlated,
  };
}

async function insertBatch(
  supabase: SupabaseClient,
  identity: string,
  emails: Omit<InboundEmail, "id" | "created_at">[],
  opts: { runCorrelation: boolean; reconcileOutbound?: boolean; accountEmail?: string }
): Promise<{ inserted: number; correlated: number }> {
  let inserted = 0;
  let correlated = 0;

  for (const email of emails) {
    const { data: existing } = await supabase
      .from("inbound_emails")
      .select("id")
      .eq("message_id", email.message_id)
      .limit(1)
      .maybeSingle();

    if (existing) continue;

    const { data: row, error: insertErr } = await supabase
      .from("inbound_emails")
      .insert(email)
      .select()
      .single();

    if (insertErr) {
      console.error(
        `[inbox-sync] ${identity} (${email.direction}) insert error for ${email.subject}:`,
        insertErr.message
      );
      continue;
    }

    if (row) {
      inserted++;
      if (opts.runCorrelation) {
        const result = await correlateAndNotify(supabase, row);
        if (result.person_id) correlated++;
      }
      if (opts.reconcileOutbound && opts.accountEmail) {
        await reconcileOutboundToInteraction(supabase, {
          id: row.id,
          to_address: row.to_address ?? null,
          subject: row.subject ?? null,
          received_at: row.received_at,
          account_email: opts.accountEmail,
        });
      }
    }
  }

  return { inserted, correlated };
}

async function markIdentityError(
  supabase: SupabaseClient,
  identity: string,
  message: string
): Promise<void> {
  await supabase.from("inbox_sync_state").upsert(
    {
      account_email: identity,
      status: "error" as const,
      error_message: message,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "account_email" }
  );
}

// ─── Sent-mailbox reconciler helpers ───────────────────────────────────────

const SUBJECT_PREFIX_RE = /^(re:|fwd:|fw:)\s*/i;

function stripPrefixes(subj: string | null): string {
  if (!subj) return "";
  let s = subj;
  // Strip recursively (`Re: Re: Fwd: …`).
  while (SUBJECT_PREFIX_RE.test(s)) s = s.replace(SUBJECT_PREFIX_RE, "");
  return s.trim();
}

/**
 * For each outbound row newly ingested from the Sent folder, find the
 * recipient person and (if not already covered by a recent interactions row)
 * insert a new one. Dedup window: ±2 minutes on occurred_at + same normalized
 * subject. Catches manual sends from Fastmail/Gmail.
 */
async function reconcileOutboundToInteraction(
  supabase: SupabaseClient,
  outbound: {
    id: string;
    to_address: string | null;
    subject: string | null;
    received_at: string;
    account_email: string;
  }
): Promise<void> {
  if (!outbound.to_address) return;
  const match = await findPersonByEmail(supabase, outbound.to_address);
  if (!match.person_id) return;

  const occurredAt = new Date(outbound.received_at);
  const windowMs = 2 * 60 * 1000;
  const start = new Date(occurredAt.getTime() - windowMs).toISOString();
  const end = new Date(occurredAt.getTime() + windowMs).toISOString();
  const normSubj = stripPrefixes(outbound.subject);

  const { data: existing } = await supabase
    .from("interactions")
    .select("id, subject")
    .eq("person_id", match.person_id)
    .eq("direction", "outbound")
    .eq("channel", "email")
    .gte("occurred_at", start)
    .lte("occurred_at", end);

  const dedup = (existing ?? []).some(
    (r) => stripPrefixes(r.subject) === normSubj
  );
  if (dedup) return;

  const { data: senderProfile } = await supabase
    .from("sender_profiles")
    .select("id")
    .ilike("email", outbound.account_email)
    .maybeSingle();

  await supabase.from("interactions").insert({
    person_id: match.person_id,
    interaction_type: "cold_email",
    channel: "email",
    direction: "outbound",
    status: "sent",
    occurred_at: outbound.received_at,
    subject: outbound.subject,
    body: null,
    sender_profile_id: senderProfile?.id ?? null,
    detail: {
      source: "sent_folder_reconciler",
      inbound_emails_id: outbound.id,
    },
  });
}
