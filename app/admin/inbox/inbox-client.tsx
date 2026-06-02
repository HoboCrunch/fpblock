"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Mail,
  RefreshCw,
  Link2,
  Eye,
  EyeOff,
  X,
  Search,
  Loader2,
  CornerDownRight,
  ChevronDown,
  ChevronRight,
  Reply,
  Send,
  Plus,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { InboxSyncState } from "@/lib/types/database";
import type { InboundEmailWithRelations, Thread } from "./page";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface InboxClientProps {
  initialSyncStates: InboxSyncState[];
  initialThreads: Thread[];
  knownPersonEmails: string[];
}

type CorrelationFilter = "all" | "correlated" | "uncorrelated";

export function InboxClient({
  initialSyncStates,
  initialThreads,
  knownPersonEmails,
}: InboxClientProps) {
  const knownEmailSet = useMemo(
    () => new Set(knownPersonEmails.map((e) => e.toLowerCase())),
    [knownPersonEmails]
  );
  const router = useRouter();
  const [syncStates, setSyncStates] = useState(initialSyncStates);
  const [threads, setThreads] = useState(initialThreads);

  useEffect(() => setSyncStates(initialSyncStates), [initialSyncStates]);
  useEffect(() => setThreads(initialThreads), [initialThreads]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [correlationFilter, setCorrelationFilter] =
    useState<CorrelationFilter>("all");
  const [view, setView] = useState<"inbox" | "sent">("inbox");
  const [sentThreads, setSentThreads] = useState<Thread[]>([]);
  const [sentCursor, setSentCursor] = useState<string | null>(null);
  const [sentLoading, setSentLoading] = useState(false);
  const [sentError, setSentError] = useState<string | null>(null);
  const [sentLoaded, setSentLoaded] = useState(false);

  const loadSent = useCallback(
    async (cursor: string | null) => {
      setSentLoading(true);
      setSentError(null);
      try {
        const qs = new URLSearchParams({ limit: "50" });
        if (cursor) qs.set("cursor", cursor);
        const res = await fetch(`/api/inbox/sent?${qs.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: { threads: Thread[]; nextCursor: string | null } =
          await res.json();
        setSentThreads((prev) => {
          if (!cursor) return data.threads;
          const seen = new Set(prev.map((t) => t.id));
          return [...prev, ...data.threads.filter((t) => !seen.has(t.id))];
        });
        setSentCursor(data.nextCursor);
        setSentLoaded(true);
      } catch (err) {
        setSentError(err instanceof Error ? err.message : "Failed to load sent");
      } finally {
        setSentLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (view === "sent" && !sentLoaded && !sentLoading) {
      loadSent(null);
    }
  }, [view, sentLoaded, sentLoading, loadSent]);
  const [syncing, setSyncing] = useState(false);
  const [linkModal, setLinkModal] = useState<string | null>(null);
  const [personSearch, setPersonSearch] = useState("");
  const [personResults, setPersonResults] = useState<
    { id: string; full_name: string; email: string | null }[]
  >([]);
  const [linking, setLinking] = useState(false);

  // -------------------------------------------------------------------------
  // Filters
  // -------------------------------------------------------------------------

  const activeThreads = useMemo(
    () => (view === "sent" ? sentThreads : threads),
    [view, sentThreads, threads]
  );

  const filtered = activeThreads.filter((t) => {
    if (correlationFilter === "correlated" && !t.person_id) return false;
    if (correlationFilter === "uncorrelated" && t.person_id) return false;
    return true;
  });

  const selectedThread = filtered.find((t) => t.id === selectedId) || null;

  // -------------------------------------------------------------------------
  // Sync
  // -------------------------------------------------------------------------

  const handleSyncAll = useCallback(async () => {
    setSyncing(true);
    try {
      await fetch("/api/inbox/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      router.refresh();
    } catch (err) {
      console.error("Sync failed:", err);
    } finally {
      setSyncing(false);
    }
  }, [router]);

  // -------------------------------------------------------------------------
  // Mark thread / message as read
  // -------------------------------------------------------------------------

  const markMessageRead = useCallback(async (emailId: string) => {
    setThreads((prev) =>
      prev.map((t) => {
        const messages = t.messages.map((m) =>
          m.id === emailId ? { ...m, is_read: true } : m
        );
        const isUnread = messages.some(
          (m) => m.direction === "inbound" && !m.is_read
        );
        return { ...t, messages, is_unread: isUnread };
      })
    );
    fetch("/api/inbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emailId, action: "mark_read" }),
    }).catch(() => {});
  }, []);

  const markThreadRead = useCallback(
    (thread: Thread) => {
      for (const m of thread.messages) {
        if (m.direction === "inbound" && !m.is_read) markMessageRead(m.id);
      }
    },
    [markMessageRead]
  );

  // -------------------------------------------------------------------------
  // Link to Person modal
  // -------------------------------------------------------------------------

  const searchPersons = useCallback(async (query: string) => {
    setPersonSearch(query);
    if (query.length < 2) {
      setPersonResults([]);
      return;
    }
    try {
      const res = await fetch(
        `/api/inbox?search=${encodeURIComponent(query)}&type=persons`
      );
      if (res.ok) {
        const data = await res.json();
        setPersonResults(data.persons || []);
      }
    } catch {}
  }, []);

  const handleLinkPerson = useCallback(
    async (messageId: string, personId: string) => {
      setLinking(true);
      try {
        const res = await fetch("/api/inbox", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emailId: messageId, personId }),
        });
        if (res.ok) {
          router.refresh();
          setLinkModal(null);
          setPersonSearch("");
          setPersonResults([]);
        }
      } finally {
        setLinking(false);
      }
    },
    [router]
  );

  // -------------------------------------------------------------------------
  // Counts for tabs
  // -------------------------------------------------------------------------

  const totals = useMemo(
    () => ({
      all: activeThreads.length,
      correlated: activeThreads.filter((t) => t.person_id).length,
      uncorrelated: activeThreads.filter((t) => !t.person_id).length,
    }),
    [activeThreads]
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-4">
      {/* Sync row + status */}
      {/* Sync button — replaces the per-account pills */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleSyncAll}
          disabled={syncing}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg",
            "bg-white/5 border border-white/10 text-white/70",
            "hover:bg-white/10 hover:text-white transition-all duration-200",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          <RefreshCw className={cn("h-3 w-3", syncing && "animate-spin")} />
          Sync
        </button>
        {syncStates.some((s) => s.status === "error") && (
          <span className="text-[11px] text-red-400">
            {syncStates
              .filter((s) => s.status === "error")
              .map((s) => `${s.account_email.split("@")[0]} sync error`)
              .join(" · ")}
          </span>
        )}
      </div>

      {/* Inbox / Sent view toggle */}
      <div className="flex gap-1 border-b border-gray-800">
        {(
          [
            ["inbox", "Inbox"],
            ["sent", "Sent"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => {
              setSelectedId(null);
              setView(id);
            }}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
              view === id
                ? "border-[#f58327] text-white"
                : "border-transparent text-gray-400 hover:text-white"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_minmax(0,1fr)] gap-4 min-h-[60vh]">
        {/* Left column: filter tabs + thread list */}
        <div className="flex flex-col gap-2 min-w-0">
          <div className="flex gap-1 border-b border-gray-800">
            {(
              [
                ["all", "All"],
                ["correlated", "Correlated"],
                ["uncorrelated", "Uncorrelated"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setCorrelationFilter(id)}
                className={cn(
                  "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
                  correlationFilter === id
                    ? "border-[#f58327] text-white"
                    : "border-transparent text-gray-400 hover:text-white"
                )}
              >
                {label}
                <span className="ml-1 text-xs text-white/40">
                  ({totals[id]})
                </span>
              </button>
            ))}
          </div>
          <div className="space-y-1 overflow-y-auto max-h-[75vh] pr-1 min-w-0">
          {view === "sent" && sentError && (
            <GlassCard className="text-center py-6">
              <p className="text-red-400 text-sm">Failed to load sent: {sentError}</p>
              <button
                onClick={() => loadSent(null)}
                className="mt-2 px-3 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 text-white/70 hover:bg-white/10"
              >
                Retry
              </button>
            </GlassCard>
          )}

          {view === "sent" && sentLoading && sentThreads.length === 0 && (
            <div className="flex items-center justify-center py-12 text-white/40">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}

          {filtered.length === 0 && !(view === "sent" && (sentLoading || sentError)) && (
            <GlassCard className="text-center py-12">
              <Mail className="h-8 w-8 text-white/20 mx-auto mb-3" />
              <p className="text-white/40 text-sm">
                {view === "sent" ? "No sent emails" : "No conversations to show"}
              </p>
              <p className="text-white/25 text-xs mt-1">
                {view === "sent" ? "Sends will appear here" : "Try syncing or adjusting filters"}
              </p>
            </GlassCard>
          )}

          {filtered.map((thread) => (
            <ThreadRow
              key={thread.id}
              thread={thread}
              selected={selectedId === thread.id}
              knownEmailSet={knownEmailSet}
              onSelect={() => {
                setSelectedId(thread.id);
                if (thread.is_unread) markThreadRead(thread);
              }}
            />
          ))}

          {view === "sent" && sentCursor && (
            <button
              onClick={() => loadSent(sentCursor)}
              disabled={sentLoading}
              className="w-full mt-2 px-3 py-2 text-xs font-medium rounded-lg bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 disabled:opacity-50"
            >
              {sentLoading ? "Loading…" : "Load more"}
            </button>
          )}
          </div>
        </div>

        {/* Conversation detail */}
        <div className="min-h-[400px] min-w-0">
          {!selectedThread ? (
            <GlassCard className="h-full flex items-center justify-center">
              <div className="text-center">
                <Mail className="h-10 w-10 text-white/10 mx-auto mb-3" />
                <p className="text-white/30 text-sm">
                  Select a conversation to view
                </p>
              </div>
            </GlassCard>
          ) : (
            <ThreadDetail
              thread={selectedThread}
              onMarkRead={markMessageRead}
              onLink={(messageId) => setLinkModal(messageId)}
              onReplySent={() => router.refresh()}
            />
          )}
        </div>
      </div>

      {/* Link to Person modal */}
      {linkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <GlassCard className="w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white font-[family-name:var(--font-heading)]">
                Link to Person
              </h3>
              <button
                onClick={() => {
                  setLinkModal(null);
                  setPersonSearch("");
                  setPersonResults([]);
                }}
                className="text-white/40 hover:text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30" />
              <input
                type="text"
                value={personSearch}
                onChange={(e) => searchPersons(e.target.value)}
                placeholder="Search persons by name or email..."
                className={cn(
                  "w-full pl-9 pr-3 py-2 text-sm rounded-lg",
                  "bg-white/5 border border-white/10 text-white placeholder:text-white/30",
                  "focus:outline-none focus:border-[#6e86ff]/40 transition-colors"
                )}
                autoFocus
              />
            </div>

            <div className="space-y-1 max-h-[240px] overflow-y-auto">
              {personResults.length === 0 && personSearch.length >= 2 && (
                <p className="text-xs text-white/30 text-center py-4">
                  No persons found
                </p>
              )}
              {personResults.map((person) => (
                <button
                  key={person.id}
                  disabled={linking}
                  onClick={() => handleLinkPerson(linkModal, person.id)}
                  className={cn(
                    "w-full text-left p-2.5 rounded-lg",
                    "bg-white/[0.02] border border-white/[0.06]",
                    "hover:bg-white/[0.06] transition-all duration-200",
                    "disabled:opacity-50"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm text-white">
                        {person.full_name}
                      </span>
                      {person.email && (
                        <span className="text-xs text-white/30 ml-2">
                          {person.email}
                        </span>
                      )}
                    </div>
                    {linking && (
                      <Loader2 className="h-3 w-3 text-white/40 animate-spin" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Thread row
// ---------------------------------------------------------------------------

function ThreadRow({
  thread,
  selected,
  knownEmailSet,
  onSelect,
}: {
  thread: Thread;
  selected: boolean;
  knownEmailSet: Set<string>;
  onSelect: () => void;
}) {
  const primaryOther =
    thread.participants.find(
      (p) => !p.address.toLowerCase().endsWith("@gofpblock.com")
    ) || thread.participants[0];
  const senderLabel =
    primaryOther?.name || primaryOther?.address || "(unknown)";
  const isKnown = primaryOther
    ? knownEmailSet.has(primaryOther.address.toLowerCase())
    : false;
  const isUnread = thread.is_unread;

  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full text-left rounded-xl transition-all duration-200",
        "border backdrop-blur-xl p-3",
        isKnown
          ? "bg-[#f58327]/[0.04] border-[#f58327]/10"
          : "bg-white/[0.02] border-white/[0.06]",
        "hover:bg-white/[0.06] hover:border-white/10",
        selected &&
          "bg-white/[0.06] border-[#f58327]/30 shadow-[0_0_12px_rgba(245,131,39,0.08)]",
        isUnread && isKnown && "border-l-2 border-l-[#f58327]",
        isUnread && !isKnown && "border-l-2 border-l-white/70"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "text-sm truncate",
                isUnread
                  ? "font-semibold text-white"
                  : "font-medium text-white/70"
              )}
            >
              {senderLabel}
            </span>
            {thread.message_count > 1 && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-white/8 text-white/60 shrink-0">
                {thread.message_count}
              </span>
            )}
            {thread.person_id && thread.person && (
              <Badge variant="replied" className="text-[10px] shrink-0">
                {thread.person.full_name}
                {thread.organization?.icp_score
                  ? ` (${thread.organization.icp_score})`
                  : ""}
              </Badge>
            )}
          </div>
          <p
            className={cn(
              "text-xs truncate mt-0.5",
              isUnread ? "text-white/80" : "text-white/50"
            )}
          >
            {thread.subject || thread.latest.subject || "(no subject)"}
          </p>
          <p className="text-xs text-white/30 truncate mt-0.5">
            {thread.latest.direction === "outbound" && (
              <CornerDownRight className="inline h-2.5 w-2.5 mr-1 text-white/40" />
            )}
            {thread.latest.body_preview?.slice(0, 80) || ""}
          </p>
        </div>
        <div className="shrink-0 flex flex-col items-end justify-between self-stretch">
          <div className="flex gap-1">
            {thread.account_emails.map((acct) => (
              <span
                key={acct}
                className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[#f58327]/15 text-[#f58327]"
              >
                {acct.startsWith("jb") ? "JB" : "Wes"}
              </span>
            ))}
          </div>
          <span className="text-[10px] text-white/30 mt-auto">
            {formatRelativeTime(thread.latest_at)}
          </span>
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Thread detail (conversation chain)
// ---------------------------------------------------------------------------

function ThreadDetail({
  thread,
  onMarkRead,
  onLink,
  onReplySent,
}: {
  thread: Thread;
  onMarkRead: (id: string) => void;
  onLink: (id: string) => void;
  onReplySent: () => void;
}) {
  const [replyOpen, setReplyOpen] = useState(false);

  // Identity to send as: prefer the one already in this thread's account_emails,
  // defaulting to the most recent message's account_email.
  const sendingIdentity = thread.latest.account_email;

  // The "other party" — used to pre-fill To when replying.
  const otherParty = thread.participants.find(
    (p) => !p.address.toLowerCase().endsWith("@gofpblock.com")
  );
  const otherDisplay = otherParty?.name || otherParty?.address || "(unknown)";

  // Reset reply panel when switching threads
  useEffect(() => {
    setReplyOpen(false);
  }, [thread.id]);

  return (
    <div className="flex flex-col gap-2 h-full">
      {/* Person header — mirrors the email-list tab row structure (same border-b,
          same px-4 py-2 text-sm so baselines line up exactly). */}
      <div className="flex items-center justify-between gap-3 border-b border-gray-800 min-w-0">
        <div className="flex items-center gap-3 min-w-0 flex-1 px-4 py-2">
          {thread.person_id && thread.person ? (
            <>
              <a
                href={`/admin/persons/${thread.person_id}`}
                className="text-sm font-semibold text-white font-[family-name:var(--font-heading)] hover:underline truncate"
              >
                {thread.person.full_name}
              </a>
              {thread.organization && (
                <span className="text-sm text-white/50 truncate">
                  · {thread.organization.name}
                </span>
              )}
              {thread.organization?.icp_score != null && (
                <Badge variant="approved" className="text-[10px] shrink-0">
                  ICP {thread.organization.icp_score}
                </Badge>
              )}
              {otherParty && (
                <span className="text-xs text-white/30 truncate hidden md:inline">
                  {otherParty.address}
                </span>
              )}
            </>
          ) : (
            <>
              <span className="text-sm font-semibold text-white font-[family-name:var(--font-heading)] truncate">
                {otherDisplay}
              </span>
              {otherParty && otherParty.name && (
                <span className="text-xs text-white/30 truncate hidden md:inline">
                  {otherParty.address}
                </span>
              )}
              <button
                onClick={() => onLink(thread.latest.id)}
                className="text-[11px] px-2 py-0.5 rounded-md bg-[#6e86ff]/10 border border-[#6e86ff]/20 text-[#6e86ff] hover:bg-[#6e86ff]/20 shrink-0"
              >
                Link to Person
              </button>
            </>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0 py-1.5 pr-1">
          <button
            onClick={() => setReplyOpen((v) => !v)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg transition-all",
              replyOpen
                ? "bg-[#f58327]/15 border border-[#f58327]/30 text-[#f58327]"
                : "bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white"
            )}
          >
            <Reply className="h-3 w-3" />
            Reply
          </button>
        </div>
      </div>

      <GlassCard className="flex-1 overflow-y-auto max-h-[75vh] min-w-0">
        {/* Subject + meta */}
        <div className="mb-4 space-y-1 pb-3 border-b border-white/5">
          <h2 className="text-lg font-semibold text-white font-[family-name:var(--font-heading)] break-words">
            {thread.subject || thread.latest.subject || "(no subject)"}
          </h2>
          <div className="flex items-center gap-2 text-xs text-white/40 flex-wrap">
            <span>
              {thread.message_count}{" "}
              {thread.message_count === 1 ? "message" : "messages"}
            </span>
            {thread.outbound_count > 0 && thread.inbound_count > 0 && (
              <>
                <span>·</span>
                <span>
                  {thread.inbound_count} in / {thread.outbound_count} out
                </span>
              </>
            )}
            <span>·</span>
            <span className="truncate">
              {thread.participants
                .slice(0, 3)
                .map((p) => p.name || p.address)
                .join(", ")}
            </span>
          </div>
        </div>

        {/* Messages */}
        <div className="space-y-3">
          {thread.messages.map((m, idx) => (
            <MessageBlock
              key={m.id}
              message={m}
              initiallyExpanded={idx === thread.messages.length - 1}
              onMarkRead={onMarkRead}
              onLink={onLink}
            />
          ))}
        </div>

        {/* Inline reply composer */}
        {replyOpen && (
          <div className="mt-4 pt-4 border-t border-white/5">
            <ReplyComposer
              thread={thread}
              sendingIdentity={sendingIdentity}
              onCancel={() => setReplyOpen(false)}
              onSent={() => {
                setReplyOpen(false);
                onReplySent();
              }}
            />
          </div>
        )}
      </GlassCard>
    </div>
  );
}

function MessageBlock({
  message,
  initiallyExpanded,
  onMarkRead,
  onLink,
}: {
  message: InboundEmailWithRelations;
  initiallyExpanded: boolean;
  onMarkRead: (id: string) => void;
  onLink: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const isOutbound = message.direction === "outbound";
  const senderLabel = isOutbound
    ? message.from_name || message.account_email
    : message.from_name || message.from_address;
  const recipientLabel = isOutbound
    ? message.to_address || "(unknown)"
    : message.account_email;

  return (
    <div
      className={cn(
        "rounded-lg border transition-colors overflow-hidden",
        isOutbound
          ? "bg-[#6e86ff]/[0.04] border-[#6e86ff]/15"
          : "bg-white/[0.02] border-white/[0.06]",
        !message.is_read && !isOutbound && "ring-1 ring-[#f58327]/20"
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          "w-full flex items-start gap-2 p-3 text-left transition-colors",
          "hover:bg-white/[0.03]",
          !expanded && "cursor-pointer"
        )}
        aria-expanded={expanded}
      >
        <span className="shrink-0 mt-0.5 text-white/40">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            {isOutbound && (
              <span className="text-[10px] font-medium uppercase tracking-wide text-[#6e86ff]/70 shrink-0">
                {message.source === "sendgrid" ? "SendGrid" : "Sent"}
              </span>
            )}
            {message.delivery_status &&
              message.delivery_status !== "sent" && (
                <span className="text-[10px] font-medium uppercase tracking-wide text-emerald-400/70 shrink-0">
                  {message.delivery_status}
                </span>
              )}
            <span
              className={cn(
                "text-sm truncate",
                isOutbound ? "text-white/80" : "text-white"
              )}
            >
              {senderLabel}
            </span>
            {message.from_name && !isOutbound && (
              <span className="text-xs text-white/30 truncate min-w-0">
                &lt;{message.from_address}&gt;
              </span>
            )}
          </div>
          <div className="text-[11px] text-white/30 mt-0.5 truncate">
            To: {recipientLabel}
            {" · "}
            {new Date(message.received_at).toLocaleString()}
          </div>
          {!expanded && (
            <p className="text-xs text-white/50 truncate mt-1">
              {message.body_preview?.slice(0, 140) || ""}
            </p>
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3">
          {!isOutbound && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => onMarkRead(message.id)}
                className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white transition-all"
              >
                {message.is_read ? (
                  <EyeOff className="h-3 w-3" />
                ) : (
                  <Eye className="h-3 w-3" />
                )}
                {message.is_read ? "Mark Unread" : "Mark Read"}
              </button>
              {!message.person_id && (
                <button
                  onClick={() => onLink(message.id)}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md bg-[#6e86ff]/10 border border-[#6e86ff]/20 text-[#6e86ff] hover:bg-[#6e86ff]/20 transition-all"
                >
                  <Link2 className="h-3 w-3" />
                  Link to Person
                </button>
              )}
            </div>
          )}

          {message.body_html ? (
            <HtmlEmailFrame html={message.body_html} />
          ) : (
            <p className="text-sm text-white/60 whitespace-pre-wrap break-words">
              {message.body_preview || "(no content)"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);

  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ---------------------------------------------------------------------------
// Reply composer
// ---------------------------------------------------------------------------

function ReplyComposer({
  thread,
  sendingIdentity,
  onCancel,
  onSent,
}: {
  thread: Thread;
  sendingIdentity: string;
  onCancel: () => void;
  onSent: () => void;
}) {
  // The most-recent inbound message in this thread is what we're replying to.
  const targetMsg =
    [...thread.messages].reverse().find((m) => m.direction === "inbound") ||
    thread.latest;

  const defaultTo =
    targetMsg.direction === "inbound"
      ? joinAddress(targetMsg.from_name, targetMsg.from_address)
      : targetMsg.to_address || "";

  const defaultSubject = (() => {
    const subj = thread.subject || thread.latest.subject || "";
    return subj.startsWith("Re:") ? subj : `Re: ${subj}`;
  })();

  const [from, setFrom] = useState(sendingIdentity);
  const [to, setTo] = useState(defaultTo);
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [subject, setSubject] = useState(defaultSubject);
  const [bodyText, setBodyText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const identityOptions = useMemo(
    () =>
      [...new Set(["jb@gofpblock.com", "wes@gofpblock.com", sendingIdentity])].filter(
        Boolean
      ),
    [sendingIdentity]
  );

  const handleSend = async () => {
    setError(null);
    const toAddrs = parseAddressList(to);
    if (!toAddrs.length) {
      setError("Add at least one recipient.");
      return;
    }
    if (!bodyText.trim()) {
      setError("Message body is empty.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/inbox/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identity: from,
          to: toAddrs,
          cc: showCc ? parseAddressList(cc) : [],
          bcc: showBcc ? parseAddressList(bcc) : [],
          subject,
          bodyText,
          replyToJmapId: targetMsg.message_id,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.details || j.error || `Send failed (${res.status})`);
      }
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-lg border border-[#f58327]/20 bg-[#f58327]/[0.03] p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-[#f58327]/70">
          Reply
        </span>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-white/40">From:</span>
          <select
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-white/80 text-[11px] focus:outline-none focus:border-[#6e86ff]/40"
          >
            {identityOptions.map((id) => (
              <option key={id} value={id} className="bg-zinc-900">
                {id}
              </option>
            ))}
          </select>
        </div>
      </div>

      <RecipientField
        label="To"
        value={to}
        onChange={setTo}
        placeholder="name@example.com, …"
      />
      {showCc ? (
        <RecipientField label="Cc" value={cc} onChange={setCc} />
      ) : null}
      {showBcc ? (
        <RecipientField label="Bcc" value={bcc} onChange={setBcc} />
      ) : null}

      <div className="flex items-center gap-2 text-[11px]">
        {!showCc && (
          <button
            type="button"
            onClick={() => setShowCc(true)}
            className="text-white/40 hover:text-white/80 flex items-center gap-0.5"
          >
            <Plus className="h-2.5 w-2.5" /> Cc
          </button>
        )}
        {!showBcc && (
          <button
            type="button"
            onClick={() => setShowBcc(true)}
            className="text-white/40 hover:text-white/80 flex items-center gap-0.5"
          >
            <Plus className="h-2.5 w-2.5" /> Bcc
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[11px] text-white/40 w-10 shrink-0">Subj</span>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#6e86ff]/40"
        />
      </div>

      <textarea
        value={bodyText}
        onChange={(e) => setBodyText(e.target.value)}
        rows={8}
        placeholder="Write your reply…"
        className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#6e86ff]/40 resize-y"
      />

      {error && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-1">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={sending}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSend}
          disabled={sending}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#f58327]/15 border border-[#f58327]/30 text-[#f58327] hover:bg-[#f58327]/25 disabled:opacity-50"
        >
          {sending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Send className="h-3 w-3" />
          )}
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}

function RecipientField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-white/40 w-10 shrink-0">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#6e86ff]/40"
      />
    </div>
  );
}

// Comma-separated "Name <email>, email, …" → [{ email, name? }, …]
function parseAddressList(raw: string): Array<{ email: string; name?: string }> {
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const m = entry.match(/^\s*(?:"?([^"<]+?)"?\s*)?<([^>]+)>\s*$/);
      if (m) return { email: m[2].trim(), name: m[1]?.trim() || undefined };
      return { email: entry };
    })
    .filter((a) => /.+@.+\..+/.test(a.email));
}

function joinAddress(name: string | null, email: string): string {
  return name ? `"${name}" <${email}>` : email;
}

// ---------------------------------------------------------------------------
// Sandboxed HTML email rendering
// ---------------------------------------------------------------------------

function HtmlEmailFrame({ html }: { html: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(180);

  const srcDoc = useMemo(() => {
    // Strip <script> and on* event-handler attributes defensively (the sandbox
    // attribute also blocks scripts, but belt-and-suspenders).
    const cleaned = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/\son\w+="[^"]*"/gi, "")
      .replace(/\son\w+='[^']*'/gi, "");
    return `<!doctype html><html><head>
      <base target="_blank">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <style>
        html,body { margin:0; padding:0; background:#fff; color:#1a1a1a;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif;
          font-size: 14px; line-height: 1.55; word-break: break-word; overflow-wrap: anywhere; }
        body { padding: 12px 14px; }
        img, table, video { max-width: 100% !important; height: auto !important; }
        table { border-collapse: collapse; }
        a { color: #1565d8; }
        pre, code { white-space: pre-wrap; word-break: break-word; }
      </style>
    </head><body>${cleaned}</body></html>`;
  }, [html]);

  // Resize the iframe to fit content height.
  const fit = () => {
    const f = iframeRef.current;
    if (!f) return;
    try {
      const doc = f.contentDocument;
      if (!doc) return;
      const h = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight);
      if (h && h !== height) setHeight(Math.min(h + 4, 4000));
    } catch {
      // cross-origin or doc not ready — ignore
    }
  };

  useEffect(() => {
    const f = iframeRef.current;
    if (!f) return;
    const onLoad = () => fit();
    f.addEventListener("load", onLoad);
    // Try a second fit shortly after to catch image load reflow.
    const t1 = setTimeout(fit, 250);
    const t2 = setTimeout(fit, 1200);
    return () => {
      f.removeEventListener("load", onLoad);
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcDoc]);

  return (
    <iframe
      ref={iframeRef}
      title="email body"
      sandbox="allow-same-origin allow-popups"
      srcDoc={srcDoc}
      style={{
        width: "100%",
        height: `${height}px`,
        border: 0,
        borderRadius: 6,
        background: "#fff",
      }}
    />
  );
}
