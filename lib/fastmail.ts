// lib/fastmail.ts — Fastmail JMAP client for inbox sync

import type { InboundEmail } from "@/lib/types/database";

const SESSION_URL = "https://api.fastmail.com/jmap/session";

interface JMAPSession {
  apiUrl: string;
  primaryAccounts: Record<string, string>;
}

interface JMAPMailbox {
  id: string;
  name: string;
  role: string | null;
}

interface JMAPEmailAddress {
  name?: string;
  email: string;
}

interface JMAPEmailHeader {
  name: string;
  value: string;
}

interface JMAPEmail {
  id: string;
  threadId: string | null;
  from: JMAPEmailAddress[] | null;
  to: JMAPEmailAddress[] | null;
  cc: JMAPEmailAddress[] | null;
  bcc: JMAPEmailAddress[] | null;
  subject: string | null;
  preview: string;
  htmlBody: { value: string }[] | null;
  receivedAt: string;
  sentAt?: string | null;
  keywords: Record<string, boolean>;
  header: JMAPEmailHeader[] | null;
  headers?: JMAPEmailHeader[];
  mailboxIds: Record<string, boolean>;
}

async function getSession(apiKey: string): Promise<JMAPSession> {
  const res = await fetch(SESSION_URL, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    throw new Error(`JMAP session discovery failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

const CORE_USING = ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"];

async function jmapRequest(
  apiUrl: string,
  apiKey: string,
  methodCalls: unknown[],
  extraUsing: string[] = []
): Promise<{ methodResponses: unknown[][] }> {
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      using: [...CORE_USING, ...extraUsing],
      methodCalls,
    }),
  });
  if (!res.ok) {
    throw new Error(`JMAP request failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/**
 * Resolve a mailbox by role (e.g., "inbox", "sent").
 */
async function getMailboxIdByRole(
  apiUrl: string,
  apiKey: string,
  accountId: string,
  role: "inbox" | "sent" | "drafts"
): Promise<string> {
  const response = await jmapRequest(apiUrl, apiKey, [
    ["Mailbox/query", { accountId, filter: { role } }, "findMailbox"],
  ]);

  const [, result] = response.methodResponses[0] as [string, { ids: string[] }];
  if (!result.ids?.length) {
    throw new Error(`Could not find ${role.toUpperCase()} mailbox`);
  }
  return result.ids[0];
}

/**
 * Fetch recent inbox emails from the Fastmail JMAP account and route each one
 * to one of the caller's managed identities based on recipients.
 *
 * Both `wes@gofpblock.com` and `jb@gofpblock.com` are identities on the same
 * Fastmail JMAP account and share a single inbox, so we fetch once and assign
 * each message to whichever managed identity appears in to/cc/bcc.
 *
 * @param apiKey - Fastmail API token (Bearer)
 * @param managedIdentities - Identity emails we care about; the first one is
 *   the fallback when none of them appear in the recipient list.
 * @param sinceEmailId - If provided, only fetch emails newer than this JMAP email ID
 * @param limit - Max number of emails to fetch (default 50)
 */
export async function fetchEmails(
  apiKey: string,
  managedIdentities: string[],
  sinceEmailId?: string,
  limit: number = 50
): Promise<Omit<InboundEmail, "id" | "created_at">[]> {
  if (!managedIdentities.length) {
    throw new Error("fetchEmails requires at least one managed identity");
  }
  const normalizedIdentities = managedIdentities.map((id) => id.toLowerCase());
  const session = await getSession(apiKey);
  const accountId = Object.values(session.primaryAccounts)[0];
  if (!accountId) {
    throw new Error("No account found in JMAP session");
  }

  const apiUrl = session.apiUrl;
  const inboxId = await getMailboxIdByRole(apiUrl, apiKey, accountId, "inbox");

  // Build filter: emails in INBOX
  const filter: Record<string, unknown> = {
    inMailbox: inboxId,
  };

  // If we have a sinceEmailId, we use an anchor to fetch only newer emails.
  // JMAP Email/query supports "sinceEmailState" but for simplicity we'll
  // fetch recent and filter client-side if sinceEmailId is provided.

  const queryArgs: Record<string, unknown> = {
    accountId,
    filter,
    sort: [{ property: "receivedAt", isAscending: false }],
    limit,
  };

  // If we have a sinceEmailId, use it as anchor to get only newer emails
  if (sinceEmailId) {
    queryArgs.anchor = sinceEmailId;
    queryArgs.anchorOffset = -limit;
    queryArgs.limit = limit;
  }

  const emailGetCall = [
    "Email/get",
    {
      accountId,
      "#ids": {
        resultOf: "emailQuery",
        name: "Email/query",
        path: "/ids",
      },
      properties: [
        "id",
        "threadId",
        "from",
        "to",
        "cc",
        "bcc",
        "subject",
        "preview",
        "htmlBody",
        "receivedAt",
        "sentAt",
        "keywords",
        "mailboxIds",
        "headers",
      ],
    },
    "emailGet",
  ];

  let response = await jmapRequest(apiUrl, apiKey, [
    ["Email/query", queryArgs, "emailQuery"],
    emailGetCall,
  ]);

  // If the anchor points at an email that no longer exists (e.g., previous
  // cursor was from a different JMAP account, or the email was deleted), the
  // first method response comes back as ["error", { type: "anchorNotFound" }].
  // Retry without the anchor so the next sync isn't permanently stuck.
  const firstResult = response.methodResponses[0];
  if (
    firstResult?.[0] === "error" &&
    (firstResult[1] as { type?: string })?.type === "anchorNotFound"
  ) {
    delete queryArgs.anchor;
    delete queryArgs.anchorOffset;
    response = await jmapRequest(apiUrl, apiKey, [
      ["Email/query", queryArgs, "emailQuery"],
      emailGetCall,
    ]);
  }

  // Any other method-level error should surface, not be silently swallowed.
  const firstAfter = response.methodResponses[0];
  if (firstAfter?.[0] === "error") {
    const err = firstAfter[1] as { type?: string; description?: string };
    throw new Error(
      `JMAP Email/query error: ${err.type || "unknown"}${err.description ? ` — ${err.description}` : ""}`
    );
  }

  // Extract results
  const [, queryResult] = response.methodResponses[0] as [
    string,
    { ids: string[] }
  ];
  const [, getResult] = response.methodResponses[1] as [
    string,
    { list: JMAPEmail[] }
  ];

  if (!getResult?.list) {
    return [];
  }

  // If sinceEmailId was used, filter out the anchor email itself and anything older
  let emails = getResult.list;
  if (sinceEmailId) {
    const anchorIdx = emails.findIndex((e) => e.id === sinceEmailId);
    if (anchorIdx >= 0) {
      emails = emails.slice(0, anchorIdx);
    }
  }

  return emails.map((email) => {
    const from = email.from?.[0];
    const htmlBody = email.htmlBody?.[0]?.value || null;

    const recipients = [...(email.to || []), ...(email.cc || []), ...(email.bcc || [])]
      .map((r) => r.email?.toLowerCase())
      .filter((e): e is string => !!e);
    const matchedIdentity = normalizedIdentities.find((id) =>
      recipients.includes(id)
    );
    const accountEmail = matchedIdentity || normalizedIdentities[0];

    // Extract In-Reply-To and References from headers array
    const raw: Record<string, unknown> = {};
    const headers = email.headers || email.header || [];
    for (const h of headers) {
      if (h.name?.toLowerCase() === "in-reply-to") raw["In-Reply-To"] = h.value;
      if (h.name?.toLowerCase() === "references") raw["References"] = h.value;
    }

    return {
      account_email: accountEmail,
      message_id: email.id,
      thread_id: email.threadId || null,
      direction: "inbound" as const,
      from_address: from?.email || "unknown@unknown.com",
      from_name: from?.name || null,
      to_address: accountEmail,
      subject: email.subject || null,
      body_preview: email.preview?.slice(0, 500) || null,
      body_html: htmlBody,
      received_at: email.receivedAt,
      is_read: !email.keywords?.["$seen"] ? false : true,
      person_id: null,
      correlated_interaction_id: null,
      correlation_type: null,
      raw_headers: Object.keys(raw).length > 0 ? raw : null,
    };
  });
}

/**
 * Fetch sent emails from the Fastmail JMAP account's Sent mailbox.
 *
 * Returns inbound_emails-shaped records with direction='outbound', where
 * `account_email` is the identity that sent the message, `from_address` is
 * the same identity, and `to_address` is the primary recipient.
 */
export async function fetchSentEmails(
  apiKey: string,
  identity: string,
  sinceEmailId?: string,
  limit: number = 50
): Promise<Omit<InboundEmail, "id" | "created_at">[]> {
  const session = await getSession(apiKey);
  const accountId = Object.values(session.primaryAccounts)[0];
  if (!accountId) {
    throw new Error("No account found in JMAP session");
  }
  const apiUrl = session.apiUrl;
  const sentId = await getMailboxIdByRole(apiUrl, apiKey, accountId, "sent");

  const queryArgs: Record<string, unknown> = {
    accountId,
    filter: { inMailbox: sentId },
    sort: [{ property: "receivedAt", isAscending: false }],
    limit,
  };
  if (sinceEmailId) {
    queryArgs.anchor = sinceEmailId;
    queryArgs.anchorOffset = -limit;
  }

  const emailGetCall = [
    "Email/get",
    {
      accountId,
      "#ids": {
        resultOf: "emailQuery",
        name: "Email/query",
        path: "/ids",
      },
      properties: [
        "id",
        "threadId",
        "from",
        "to",
        "cc",
        "bcc",
        "subject",
        "preview",
        "htmlBody",
        "receivedAt",
        "sentAt",
        "keywords",
        "headers",
      ],
    },
    "emailGet",
  ];

  let response = await jmapRequest(apiUrl, apiKey, [
    ["Email/query", queryArgs, "emailQuery"],
    emailGetCall,
  ]);

  const firstResult = response.methodResponses[0];
  if (
    firstResult?.[0] === "error" &&
    (firstResult[1] as { type?: string })?.type === "anchorNotFound"
  ) {
    delete queryArgs.anchor;
    delete queryArgs.anchorOffset;
    response = await jmapRequest(apiUrl, apiKey, [
      ["Email/query", queryArgs, "emailQuery"],
      emailGetCall,
    ]);
  }

  const firstAfter = response.methodResponses[0];
  if (firstAfter?.[0] === "error") {
    const err = firstAfter[1] as { type?: string; description?: string };
    throw new Error(
      `JMAP Email/query (sent) error: ${err.type || "unknown"}${err.description ? ` — ${err.description}` : ""}`
    );
  }

  const [, getResult] = response.methodResponses[1] as [
    string,
    { list: JMAPEmail[] }
  ];

  if (!getResult?.list) return [];

  let emails = getResult.list;
  if (sinceEmailId) {
    const anchorIdx = emails.findIndex((e) => e.id === sinceEmailId);
    if (anchorIdx >= 0) emails = emails.slice(0, anchorIdx);
  }

  const lowerIdentity = identity.toLowerCase();

  return emails.map((email) => {
    const primaryTo = email.to?.[0];
    const htmlBody = email.htmlBody?.[0]?.value || null;

    const raw: Record<string, unknown> = {};
    const headers = email.headers || email.header || [];
    for (const h of headers) {
      if (h.name?.toLowerCase() === "in-reply-to") raw["In-Reply-To"] = h.value;
      if (h.name?.toLowerCase() === "references") raw["References"] = h.value;
    }
    const ccList = (email.cc || []).map((r) => r.email).filter(Boolean);
    if (ccList.length) raw["Cc"] = ccList;

    return {
      account_email: lowerIdentity,
      message_id: email.id,
      thread_id: email.threadId || null,
      direction: "outbound" as const,
      from_address: lowerIdentity,
      from_name: email.from?.[0]?.name || null,
      to_address: primaryTo?.email?.toLowerCase() || null,
      subject: email.subject || null,
      body_preview: email.preview?.slice(0, 500) || null,
      body_html: htmlBody,
      received_at: email.sentAt || email.receivedAt,
      is_read: true,
      person_id: null,
      correlated_interaction_id: null,
      correlation_type: null,
      raw_headers: Object.keys(raw).length > 0 ? raw : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Sending: JMAP submitEmail
// ---------------------------------------------------------------------------

export interface SendAddress {
  email: string;
  name?: string | null;
}

export interface SubmitEmailInput {
  fromIdentity: string;
  fromName?: string | null;
  to: SendAddress[];
  cc?: SendAddress[];
  bcc?: SendAddress[];
  subject: string;
  bodyText: string;
  bodyHtml?: string | null;
  /** rfc822 Message-Id of the email being replied to (with or without angle brackets). */
  inReplyToMessageId?: string | null;
  /** Existing References header value to chain on. */
  referencesHeader?: string | null;
}

export interface SubmitEmailResult {
  emailId: string;
  submissionId: string;
}

interface JMAPIdentity {
  id: string;
  email: string;
  name: string | null;
}

async function getIdentityIdForEmail(
  apiUrl: string,
  apiKey: string,
  accountId: string,
  email: string
): Promise<{ identityId: string; defaultName: string | null }> {
  const r = await jmapRequest(
    apiUrl,
    apiKey,
    [["Identity/get", { accountId }, "i"]],
    ["urn:ietf:params:jmap:submission"]
  );
  const list = (r.methodResponses[0]?.[1] as { list?: JMAPIdentity[] } | undefined)
    ?.list;
  if (!list?.length) throw new Error("No JMAP identities returned");
  const lower = email.toLowerCase();
  const exact = list.find((i) => i.email.toLowerCase() === lower);
  const match = exact ?? list[0];
  return { identityId: match.id, defaultName: match.name };
}

/**
 * Fetch a stored email's rfc822 Message-Id header. Used to build proper
 * In-Reply-To / References when replying.
 */
export async function getMessageIdHeader(
  apiKey: string,
  jmapEmailId: string
): Promise<{ messageId: string | null; references: string | null }> {
  const session = await getSession(apiKey);
  const accountId = Object.values(session.primaryAccounts)[0];
  if (!accountId) throw new Error("No account in JMAP session");
  const apiUrl = session.apiUrl;
  const r = await jmapRequest(apiUrl, apiKey, [
    [
      "Email/get",
      {
        accountId,
        ids: [jmapEmailId],
        properties: ["id", "headers"],
      },
      "g",
    ],
  ]);
  const list =
    (r.methodResponses[0]?.[1] as { list?: JMAPEmail[] } | undefined)?.list ?? [];
  const email = list[0];
  if (!email) return { messageId: null, references: null };
  const headers = email.headers || email.header || [];
  let messageId: string | null = null;
  let references: string | null = null;
  for (const h of headers) {
    const name = h.name?.toLowerCase();
    if (name === "message-id") messageId = h.value?.trim() || null;
    else if (name === "references") references = h.value?.trim() || null;
  }
  return { messageId, references };
}

/**
 * Submit an email via JMAP. Creates a draft, submits via EmailSubmission/set,
 * and moves the draft into Sent on success. Returns the new email's JMAP id.
 */
export async function submitEmail(
  apiKey: string,
  input: SubmitEmailInput
): Promise<SubmitEmailResult> {
  const session = await getSession(apiKey);
  const accountId = Object.values(session.primaryAccounts)[0];
  if (!accountId) throw new Error("No account in JMAP session");
  const apiUrl = session.apiUrl;

  const [draftsId, sentId] = await Promise.all([
    getMailboxIdByRole(apiUrl, apiKey, accountId, "drafts"),
    getMailboxIdByRole(apiUrl, apiKey, accountId, "sent"),
  ]);

  const { identityId, defaultName } = await getIdentityIdForEmail(
    apiUrl,
    apiKey,
    accountId,
    input.fromIdentity
  );
  const fromName = input.fromName ?? defaultName ?? null;

  const bodyValues: Record<string, { value: string; isTruncated?: boolean }> = {
    text: { value: input.bodyText },
  };
  if (input.bodyHtml) bodyValues.html = { value: input.bodyHtml };

  // Build the email object piece-by-piece so we never emit `undefined` values
  // (JMAP rejects them via invalidProperties).
  const cleanAddr = (a: SendAddress) => {
    const out: { email: string; name?: string } = { email: a.email };
    if (a.name) out.name = a.name;
    return out;
  };
  const fromAddr: { email: string; name?: string } = { email: input.fromIdentity };
  if (fromName) fromAddr.name = fromName;

  const emailObject: Record<string, unknown> = {
    mailboxIds: { [draftsId]: true },
    keywords: { $draft: true, $seen: true },
    from: [fromAddr],
    to: input.to.map(cleanAddr),
    subject: input.subject,
    bodyValues,
    textBody: [{ partId: "text", type: "text/plain" }],
  };
  if (input.bodyHtml) {
    emailObject.htmlBody = [{ partId: "html", type: "text/html" }];
  }
  if (input.cc?.length) emailObject.cc = input.cc.map(cleanAddr);
  if (input.bcc?.length) emailObject.bcc = input.bcc.map(cleanAddr);

  // JMAP exposes In-Reply-To and References as first-class Email properties
  // (`inReplyTo` and `references`), each a String[]|null of bare Message-Ids
  // (no angle brackets). Setting them via the `header:` accessor is rejected
  // by Fastmail with invalidProperties — these are the right slots.
  if (input.inReplyToMessageId) {
    const bare = stripAngleBrackets(input.inReplyToMessageId);
    emailObject.inReplyTo = [bare];
    const prior = parseMessageIds(input.referencesHeader || "");
    emailObject.references = [...prior, bare];
  }

  const envelopeRcpts = [
    ...input.to,
    ...(input.cc ?? []),
    ...(input.bcc ?? []),
  ].map((a) => ({ email: a.email }));

  const draftCreateId = "draft1";
  const submissionCreateId = "sub1";

  const response = await jmapRequest(
    apiUrl,
    apiKey,
    [
      [
        "Email/set",
        { accountId, create: { [draftCreateId]: emailObject } },
        "createDraft",
      ],
      [
        "EmailSubmission/set",
        {
          accountId,
          create: {
            [submissionCreateId]: {
              identityId,
              emailId: `#${draftCreateId}`,
              envelope: {
                mailFrom: { email: input.fromIdentity },
                rcptTo: envelopeRcpts,
              },
            },
          },
          onSuccessUpdateEmail: {
            [`#${submissionCreateId}`]: {
              [`mailboxIds/${draftsId}`]: null,
              [`mailboxIds/${sentId}`]: true,
              "keywords/$draft": null,
            },
          },
        },
        "submit",
      ],
    ],
    ["urn:ietf:params:jmap:submission"]
  );

  const setResp = response.methodResponses[0];
  if (setResp?.[0] === "error") {
    const err = setResp[1] as { type?: string; description?: string };
    throw new Error(`Draft create error: ${err.type || "unknown"}${err.description ? " — " + err.description : ""}`);
  }
  const setBody = setResp?.[1] as
    | {
        created?: Record<string, { id: string } | null>;
        notCreated?: Record<string, { type?: string; description?: string }>;
      }
    | undefined;
  if (setBody?.notCreated && Object.keys(setBody.notCreated).length) {
    const key = Object.keys(setBody.notCreated)[0];
    const err = setBody.notCreated[key] as {
      type?: string;
      description?: string;
      properties?: string[];
    };
    const propList = err.properties?.length ? ` (properties: ${err.properties.join(", ")})` : "";
    throw new Error(
      `Draft not created: ${err.type || "unknown"}${err.description ? " — " + err.description : ""}${propList}`
    );
  }
  const emailId = setBody?.created?.[draftCreateId]?.id;
  if (!emailId) throw new Error("Draft creation returned no id");

  const submitResp = response.methodResponses[1];
  if (submitResp?.[0] === "error") {
    const err = submitResp[1] as { type?: string; description?: string };
    throw new Error(`Submission error: ${err.type || "unknown"}${err.description ? " — " + err.description : ""}`);
  }
  const subBody = submitResp?.[1] as
    | {
        created?: Record<string, { id: string } | null>;
        notCreated?: Record<string, { type?: string; description?: string }>;
      }
    | undefined;
  if (subBody?.notCreated && Object.keys(subBody.notCreated).length) {
    const key = Object.keys(subBody.notCreated)[0];
    const err = subBody.notCreated[key];
    throw new Error(`Submission rejected: ${err.type || "unknown"}${err.description ? " — " + err.description : ""}`);
  }
  const submissionId = subBody?.created?.[submissionCreateId]?.id;
  if (!submissionId) throw new Error("Submission returned no id");

  return { emailId, submissionId };
}

function stripAngleBrackets(s: string): string {
  return s.trim().replace(/^<|>$/g, "");
}

function parseMessageIds(refsHeader: string): string[] {
  // RFC 5322 References is a whitespace-separated list of `<id@host>` tokens.
  return refsHeader
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map(stripAngleBrackets)
    .filter(Boolean);
}
