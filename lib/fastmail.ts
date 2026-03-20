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
  from: JMAPEmailAddress[] | null;
  subject: string | null;
  preview: string;
  htmlBody: { value: string }[] | null;
  receivedAt: string;
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

async function jmapRequest(
  apiUrl: string,
  apiKey: string,
  methodCalls: unknown[]
): Promise<{ methodResponses: unknown[][] }> {
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
      methodCalls,
    }),
  });
  if (!res.ok) {
    throw new Error(`JMAP request failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

/**
 * Fetch the INBOX mailbox ID for the account.
 */
async function getInboxMailboxId(
  apiUrl: string,
  apiKey: string,
  accountId: string
): Promise<string> {
  const response = await jmapRequest(apiUrl, apiKey, [
    [
      "Mailbox/query",
      {
        accountId,
        filter: { role: "inbox" },
      },
      "findInbox",
    ],
  ]);

  const [, result] = response.methodResponses[0] as [string, { ids: string[] }];
  if (!result.ids?.length) {
    throw new Error("Could not find INBOX mailbox");
  }
  return result.ids[0];
}

/**
 * Fetch recent emails from a Fastmail account via JMAP.
 *
 * @param apiKey - Fastmail API token (Bearer)
 * @param accountEmail - The mailbox identity email (e.g., jb@gofpblock.com)
 * @param sinceEmailId - If provided, only fetch emails newer than this JMAP email ID
 * @param limit - Max number of emails to fetch (default 50)
 */
export async function fetchEmails(
  apiKey: string,
  accountEmail: string,
  sinceEmailId?: string,
  limit: number = 50
): Promise<Omit<InboundEmail, "id" | "created_at">[]> {
  const session = await getSession(apiKey);
  const accountId = Object.values(session.primaryAccounts)[0];
  if (!accountId) {
    throw new Error("No account found in JMAP session");
  }

  const apiUrl = session.apiUrl;
  const inboxId = await getInboxMailboxId(apiUrl, apiKey, accountId);

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

  const response = await jmapRequest(apiUrl, apiKey, [
    ["Email/query", queryArgs, "emailQuery"],
    [
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
          "from",
          "subject",
          "preview",
          "htmlBody",
          "receivedAt",
          "keywords",
          "mailboxIds",
          "header:In-Reply-To:asText",
          "header:References:asText",
        ],
      },
      "emailGet",
    ],
  ]);

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

    // JMAP returns requested headers as "header:Name:asText" properties
    const raw: Record<string, unknown> = {};
    const inReplyTo = (email as unknown as Record<string, unknown>)["header:In-Reply-To:asText"];
    const references = (email as unknown as Record<string, unknown>)["header:References:asText"];
    if (inReplyTo) raw["In-Reply-To"] = inReplyTo;
    if (references) raw["References"] = references;

    return {
      account_email: accountEmail,
      message_id: email.id,
      from_address: from?.email || "unknown@unknown.com",
      from_name: from?.name || null,
      subject: email.subject || null,
      body_preview: email.preview?.slice(0, 500) || null,
      body_html: htmlBody,
      received_at: email.receivedAt,
      is_read: !email.keywords?.["$seen"] ? false : true,
      contact_id: null,
      correlated_message_id: null,
      correlation_type: null,
      raw_headers: Object.keys(raw).length > 0 ? raw : null,
    };
  });
}
