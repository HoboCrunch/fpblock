"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Mail,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Link2,
  Eye,
  EyeOff,
  X,
  Search,
  Loader2,
} from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { InboxSyncState } from "@/lib/types/database";
import type { InboundEmailWithRelations } from "./page";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface InboxClientProps {
  initialSyncStates: InboxSyncState[];
  initialEmails: InboundEmailWithRelations[];
  knownPersonEmails: string[];
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

type CorrelationFilter = "all" | "correlated" | "uncorrelated";
type AccountFilter = "both" | "jb" | "wes";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InboxClient({
  initialSyncStates,
  initialEmails,
  knownPersonEmails,
}: InboxClientProps) {
  const knownEmailSet = new Set(knownPersonEmails.map((e) => e.toLowerCase()));
  const router = useRouter();
  const [syncStates, setSyncStates] = useState(initialSyncStates);
  const [emails, setEmails] = useState(initialEmails);

  // Sync local state when server component re-renders (e.g. after router.refresh())
  useEffect(() => {
    setSyncStates(initialSyncStates);
  }, [initialSyncStates]);
  useEffect(() => {
    setEmails(initialEmails);
  }, [initialEmails]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [correlationFilter, setCorrelationFilter] =
    useState<CorrelationFilter>("all");
  const [accountFilter, setAccountFilter] = useState<AccountFilter>("both");
  const [syncing, setSyncing] = useState(false);
  const [linkModal, setLinkModal] = useState<string | null>(null);
  const [personSearch, setPersonSearch] = useState("");
  const [personResults, setPersonResults] = useState<
    { id: string; full_name: string; email: string | null }[]
  >([]);
  const [linking, setLinking] = useState(false);

  const selectedEmail = emails.find((e) => e.id === selectedId) || null;

  // -------------------------------------------------------------------------
  // Filtered emails
  // -------------------------------------------------------------------------

  const filtered = emails.filter((e) => {
    if (correlationFilter === "correlated" && !e.person_id) return false;
    if (correlationFilter === "uncorrelated" && e.person_id) return false;
    if (accountFilter === "jb" && !e.account_email.startsWith("jb")) return false;
    if (accountFilter === "wes" && !e.account_email.startsWith("wes"))
      return false;
    return true;
  });

  // -------------------------------------------------------------------------
  // Sync handler
  // -------------------------------------------------------------------------

  const accounts = ["jb@gofpblock.com", "wes@gofpblock.com"];

  const handleSyncAll = useCallback(async () => {
    setSyncing(true);
    try {
      await Promise.all(
        accounts.map((acct) =>
          fetch("/api/inbox/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accountEmail: acct }),
          })
        )
      );
      router.refresh();
    } catch (err) {
      console.error("Sync failed:", err);
    } finally {
      setSyncing(false);
    }
  }, [router]);

  // -------------------------------------------------------------------------
  // Mark as read
  // -------------------------------------------------------------------------

  const handleMarkRead = useCallback(
    async (emailId: string) => {
      setEmails((prev) =>
        prev.map((e) => (e.id === emailId ? { ...e, is_read: true } : e))
      );
      // Optimistic — fire and forget
      fetch("/api/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailId, action: "mark_read" }),
      }).catch(() => {});
    },
    []
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
    } catch {
      // ignore
    }
  }, []);

  const handleLinkPerson = useCallback(
    async (emailId: string, personId: string) => {
      setLinking(true);
      try {
        const res = await fetch("/api/inbox", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emailId, personId }),
        });
        if (res.ok) {
          const data = await res.json();
          setEmails((prev) =>
            prev.map((e) =>
              e.id === emailId
                ? {
                    ...e,
                    person_id: personId,
                    correlation_type: "manual" as const,
                    person: data.person
                      ? {
                          id: data.person.id,
                          full_name: data.person.full_name,
                          email: null,
                        }
                      : e.person,
                  }
                : e
            )
          );
          setLinkModal(null);
          setPersonSearch("");
          setPersonResults([]);
        }
      } catch {
        // ignore
      } finally {
        setLinking(false);
      }
    },
    []
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div />
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
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-4 flex-wrap">
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
                (
                {id === "all"
                  ? emails.length
                  : id === "correlated"
                  ? emails.filter((e) => e.person_id).length
                  : emails.filter((e) => !e.person_id).length}
                )
              </span>
            </button>
          ))}
        </div>

        <div className="flex gap-1 border-b border-gray-800 ml-auto">
          {(
            [
              ["both", "Both"],
              ["jb", "JB"],
              ["wes", "Wes"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setAccountFilter(id)}
              className={cn(
                "px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px",
                accountFilter === id
                  ? "border-[#6e86ff] text-white"
                  : "border-transparent text-gray-400 hover:text-white"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Two-column: email list + detail */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-4 min-h-[60vh]">
        {/* Email List */}
        <div className="space-y-1 overflow-y-auto max-h-[75vh] pr-1">
          {filtered.length === 0 && (
            <GlassCard className="text-center py-12">
              <Mail className="h-8 w-8 text-white/20 mx-auto mb-3" />
              <p className="text-white/40 text-sm">No emails to show</p>
              <p className="text-white/25 text-xs mt-1">
                Try syncing your accounts or adjusting filters
              </p>
            </GlassCard>
          )}

          {filtered.map((email) => {
            const isKnown = knownEmailSet.has(email.from_address.toLowerCase());
            const isUnread = !email.is_read;

            return (
              <button
                key={email.id}
                onClick={() => {
                  setSelectedId(email.id);
                  if (isUnread) handleMarkRead(email.id);
                }}
                className={cn(
                  "w-full text-left rounded-xl transition-all duration-200",
                  "border backdrop-blur-xl p-3",
                  // Background: orange tint for known persons, default glass otherwise
                  isKnown
                    ? "bg-[#f58327]/[0.04] border-[#f58327]/10"
                    : "bg-white/[0.02] border-white/[0.06]",
                  // Hover
                  "hover:bg-white/[0.06] hover:border-white/10",
                  // Selected
                  selectedId === email.id &&
                    "bg-white/[0.06] border-[#f58327]/30 shadow-[0_0_12px_rgba(245,131,39,0.08)]",
                  // Left accent for unread: orange if known, gray if not
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
                        {email.from_name || email.from_address}
                      </span>
                      {email.person_id && email.person && (
                        <Badge variant="replied" className="text-[10px] shrink-0">
                          {email.person.full_name}
                          {email.organization?.icp_score
                            ? ` (${email.organization.icp_score})`
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
                      {email.subject || "(no subject)"}
                    </p>
                    <p className="text-xs text-white/30 truncate mt-0.5">
                      {email.body_preview?.slice(0, 80) || ""}
                    </p>
                  </div>
                  <div className="shrink-0 flex flex-col items-end justify-between self-stretch">
                    <span className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[#f58327]/15 text-[#f58327]">
                      {email.account_email.startsWith("jb") ? "JB" : "Wes"}
                    </span>
                    <span className="text-[10px] text-white/30 mt-auto">
                      {formatRelativeTime(email.received_at)}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Email Detail */}
        <div className="min-h-[400px]">
          {!selectedEmail ? (
            <GlassCard className="h-full flex items-center justify-center">
              <div className="text-center">
                <Mail className="h-10 w-10 text-white/10 mx-auto mb-3" />
                <p className="text-white/30 text-sm">
                  Select an email to view
                </p>
              </div>
            </GlassCard>
          ) : (
            <GlassCard className="h-full overflow-y-auto max-h-[75vh]">
              {/* Correlated contact card */}
              {selectedEmail.person_id && selectedEmail.person && (
                <div className="mb-4 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/15">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-emerald-400" />
                      <span className="text-sm font-medium text-emerald-300">
                        {selectedEmail.person.full_name}
                      </span>
                      {selectedEmail.organization && (
                        <span className="text-xs text-white/40">
                          at {selectedEmail.organization.name}
                        </span>
                      )}
                      {selectedEmail.organization?.icp_score && (
                        <Badge variant="approved" className="text-[10px]">
                          ICP: {selectedEmail.organization.icp_score}
                        </Badge>
                      )}
                    </div>
                    <a
                      href={`/admin/persons/${selectedEmail.person_id}`}
                      className="text-xs text-[#6e86ff] hover:underline"
                    >
                      View Person
                    </a>
                  </div>
                  {selectedEmail.correlation_type && (
                    <p className="text-[10px] text-white/30 mt-1">
                      Matched via {selectedEmail.correlation_type.replace("_", " ")}
                    </p>
                  )}
                </div>
              )}

              {/* Email header */}
              <div className="mb-4 space-y-1">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-white font-[family-name:var(--font-heading)]">
                    {selectedEmail.subject || "(no subject)"}
                  </h2>
                </div>
                <div className="flex items-center gap-2 text-xs text-white/40">
                  <span>
                    From: {selectedEmail.from_name || selectedEmail.from_address}
                    {selectedEmail.from_name && (
                      <span className="ml-1 text-white/25">
                        &lt;{selectedEmail.from_address}&gt;
                      </span>
                    )}
                  </span>
                  <span>|</span>
                  <span>To: {selectedEmail.account_email}</span>
                  <span>|</span>
                  <span>
                    {new Date(selectedEmail.received_at).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 mb-4 pb-4 border-b border-white/5">
                <button
                  onClick={() => handleMarkRead(selectedEmail.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg",
                    "bg-white/5 border border-white/10 text-white/70",
                    "hover:bg-white/10 hover:text-white transition-all duration-200"
                  )}
                >
                  {selectedEmail.is_read ? (
                    <EyeOff className="h-3 w-3" />
                  ) : (
                    <Eye className="h-3 w-3" />
                  )}
                  {selectedEmail.is_read ? "Mark Unread" : "Mark Read"}
                </button>
                {!selectedEmail.person_id && (
                  <button
                    onClick={() => setLinkModal(selectedEmail.id)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg",
                      "bg-[#6e86ff]/10 border border-[#6e86ff]/20 text-[#6e86ff]",
                      "hover:bg-[#6e86ff]/20 transition-all duration-200"
                    )}
                  >
                    <Link2 className="h-3 w-3" />
                    Link to Person
                  </button>
                )}
                <button
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg",
                    "bg-white/5 border border-white/10 text-white/40",
                    "hover:bg-white/10 hover:text-white/60 transition-all duration-200"
                  )}
                >
                  <X className="h-3 w-3" />
                  Ignore
                </button>
              </div>

              {/* Email body */}
              {selectedEmail.body_html ? (
                <div
                  className="prose prose-invert prose-sm max-w-none text-white/70 [&_a]:text-[#6e86ff]"
                  dangerouslySetInnerHTML={{
                    __html: selectedEmail.body_html,
                  }}
                />
              ) : (
                <p className="text-sm text-white/50 whitespace-pre-wrap">
                  {selectedEmail.body_preview || "(no content)"}
                </p>
              )}
            </GlassCard>
          )}
        </div>
      </div>

      {/* Link to Person Modal */}
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
