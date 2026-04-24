"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  GitBranch,
  Plus,
  X,
  Search,
  UserPlus,
  Trash2,
  Loader2,
  Calendar,
} from "lucide-react";
import Link from "next/link";
import type { SequenceEnrollment, Person } from "@/lib/types/database";
import {
  enrollPersons,
  unenrollPerson,
  searchPersons,
  enrollFromEvent,
} from "../actions";
import { EventRelationToggle, toggleToRelation } from "@/components/admin/event-relation-toggle";
import { useEvents } from "@/lib/queries/use-events";

interface EnrollmentWithPerson extends SequenceEnrollment {
  persons: Pick<Person, "id" | "full_name" | "email"> | null;
}

interface SearchResult {
  id: string;
  full_name: string;
  email: string | null;
}

const statusVariant: Record<string, string> = {
  active: "sent",
  paused: "draft",
  completed: "replied",
  bounced: "bounced",
};

export function EnrollmentPanel({
  sequenceId,
  enrollments,
  totalSteps,
}: {
  sequenceId: string;
  enrollments: EnrollmentWithPerson[];
  totalSteps: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSearching, setIsSearching] = useState(false);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [showEventModal, setShowEventModal] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [speakerOn, setSpeakerOn] = useState(true);
  const [orgAffiliatedOn, setOrgAffiliatedOn] = useState(true);
  const [isEnrollingFromEvent, setIsEnrollingFromEvent] = useState(false);
  const { data: events } = useEvents();
  const eventRelation = toggleToRelation(speakerOn, orgAffiliatedOn);

  const enrolledPersonIds = new Set(
    enrollments.map((e) => e.person_id)
  );

  async function handleSearch(query: string) {
    setSearchQuery(query);
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    const results = await searchPersons(query);
    setSearchResults(results as SearchResult[]);
    setIsSearching(false);
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleEnroll() {
    if (selectedIds.size === 0) return;
    setIsEnrolling(true);
    const result = await enrollPersons(
      sequenceId,
      Array.from(selectedIds)
    );
    if (result.success) {
      setShowSearchModal(false);
      setSearchQuery("");
      setSearchResults([]);
      setSelectedIds(new Set());
      startTransition(() => router.refresh());
    }
    setIsEnrolling(false);
  }

  async function handleEnrollFromEvent() {
    if (!selectedEventId || !eventRelation) return;
    setIsEnrollingFromEvent(true);
    const result = await enrollFromEvent(sequenceId, selectedEventId, eventRelation);
    setIsEnrollingFromEvent(false);
    if (result.success) {
      setShowEventModal(false);
      setSelectedEventId("");
      startTransition(() => router.refresh());
    }
  }

  async function handleRemove(enrollmentId: string) {
    const result = await unenrollPerson(enrollmentId);
    if (result.success) {
      startTransition(() => router.refresh());
    }
  }

  return (
    <>
      <GlassCard>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold font-[family-name:var(--font-heading)] text-white">
            Enrolled Persons
            <span className="text-sm font-normal text-[var(--text-muted)] ml-2">
              ({enrollments.length})
            </span>
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowEventModal(true)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200",
                "bg-[var(--accent-indigo)]/10 text-[var(--accent-indigo)] border border-[var(--accent-indigo)]/20",
                "hover:bg-[var(--accent-indigo)]/20"
              )}
            >
              <Calendar className="h-3.5 w-3.5" />
              Enroll from Event
            </button>
            <button
              onClick={() => setShowSearchModal(true)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200",
                "bg-[var(--accent-indigo)]/10 text-[var(--accent-indigo)] border border-[var(--accent-indigo)]/20",
                "hover:bg-[var(--accent-indigo)]/20"
              )}
            >
              <UserPlus className="h-3.5 w-3.5" />
              Add Persons
            </button>
          </div>
        </div>

        {enrollments.length === 0 ? (
          <div className="text-center py-8">
            <GitBranch className="h-8 w-8 text-[var(--text-muted)] mx-auto mb-2" />
            <p className="text-sm text-[var(--text-muted)]">
              No persons enrolled yet
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {enrollments.map((enrollment) => (
              <div
                key={enrollment.id}
                className="flex items-center justify-between p-3 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] hover:bg-[var(--glass-bg-hover)] transition-all duration-200 group"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/admin/persons/${enrollment.person_id}`}
                    className="text-sm text-white hover:text-[var(--accent-indigo)] transition-colors truncate block"
                  >
                    {enrollment.persons?.full_name ?? "Unknown"}
                  </Link>
                  {enrollment.persons?.email && (
                    <p className="text-xs text-[var(--text-muted)] truncate">
                      {enrollment.persons.email}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-3 shrink-0">
                  <span className="text-xs text-[var(--text-muted)]">
                    Step {enrollment.current_step}/{totalSteps}
                  </span>
                  <Badge
                    variant={statusVariant[enrollment.status] ?? "default"}
                  >
                    {enrollment.status}
                  </Badge>
                  <button
                    onClick={() => handleRemove(enrollment.id)}
                    disabled={isPending}
                    className="p-1 rounded text-[var(--text-muted)] opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
                    title="Remove from sequence"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      {/* Search & Enroll Modal */}
      {showSearchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowSearchModal(false)}
          />
          <div className="relative glass rounded-xl p-6 w-full max-w-lg mx-4 shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold font-[family-name:var(--font-heading)] text-white">
                Add Persons to Sequence
              </h2>
              <button
                onClick={() => setShowSearchModal(false)}
                className="text-[var(--text-muted)] hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-4">
              <GlassInput
                icon={Search}
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search persons by name or email..."
                autoFocus
              />
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 space-y-1.5 mb-4">
              {isSearching && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 text-[var(--text-muted)] animate-spin" />
                </div>
              )}

              {!isSearching && searchResults.length === 0 && searchQuery.trim().length >= 2 && (
                <p className="text-sm text-[var(--text-muted)] text-center py-8">
                  No persons found
                </p>
              )}

              {!isSearching && searchQuery.trim().length < 2 && (
                <p className="text-sm text-[var(--text-muted)] text-center py-8">
                  Type at least 2 characters to search
                </p>
              )}

              {searchResults.map((contact) => {
                const alreadyEnrolled = enrolledPersonIds.has(contact.id);
                const isSelected = selectedIds.has(contact.id);

                return (
                  <button
                    key={contact.id}
                    onClick={() => !alreadyEnrolled && toggleSelected(contact.id)}
                    disabled={alreadyEnrolled}
                    className={cn(
                      "w-full flex items-center justify-between p-3 rounded-lg text-left transition-all duration-200",
                      "border",
                      alreadyEnrolled
                        ? "opacity-50 cursor-not-allowed bg-[var(--glass-bg)] border-[var(--glass-border)]"
                        : isSelected
                        ? "bg-[var(--accent-indigo)]/10 border-[var(--accent-indigo)]/30"
                        : "bg-[var(--glass-bg)] border-[var(--glass-border)] hover:bg-[var(--glass-bg-hover)]"
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white truncate">
                        {contact.full_name}
                      </p>
                      {contact.email && (
                        <p className="text-xs text-[var(--text-muted)] truncate">
                          {contact.email}
                        </p>
                      )}
                    </div>
                    <div className="ml-3 shrink-0">
                      {alreadyEnrolled ? (
                        <Badge variant="default">enrolled</Badge>
                      ) : isSelected ? (
                        <div className="h-5 w-5 rounded bg-[var(--accent-indigo)] flex items-center justify-center">
                          <svg
                            className="h-3 w-3 text-white"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={3}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        </div>
                      ) : (
                        <div className="h-5 w-5 rounded border border-[var(--glass-border)]" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-[var(--glass-border)]">
              <span className="text-sm text-[var(--text-muted)]">
                {selectedIds.size} selected
              </span>
              <button
                onClick={handleEnroll}
                disabled={selectedIds.size === 0 || isEnrolling}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                  "bg-[var(--accent-orange)] text-white hover:bg-[var(--accent-orange)]/90",
                  "shadow-lg shadow-[var(--accent-orange)]/20",
                  "disabled:opacity-50 disabled:cursor-not-allowed"
                )}
              >
                {isEnrolling ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Enroll Selected
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Enroll from Event Modal */}
      {showEventModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowEventModal(false)}
          />
          <div className="relative glass rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold font-[family-name:var(--font-heading)] text-white">
                Enroll from Event
              </h2>
              <button
                onClick={() => setShowEventModal(false)}
                className="text-[var(--text-muted)] hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 mb-5">
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1.5">Event</label>
                <select
                  value={selectedEventId}
                  onChange={(e) => setSelectedEventId(e.target.value)}
                  className="w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-lg px-3 py-2 text-sm text-white"
                >
                  <option value="">Choose an event…</option>
                  {(events ?? []).map((ev) => (
                    <option key={ev.id} value={ev.id}>{ev.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1.5">Relation</label>
                <EventRelationToggle
                  speaker={speakerOn}
                  orgAffiliated={orgAffiliatedOn}
                  onChange={({ speaker, orgAffiliated }) => {
                    setSpeakerOn(speaker);
                    setOrgAffiliatedOn(orgAffiliated);
                  }}
                />
                <p className="text-[11px] text-[var(--text-muted)] mt-1">
                  Enrolls persons who are direct participants, affiliated via a participating org, or both.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-[var(--glass-border)]">
              <button
                onClick={() => setShowEventModal(false)}
                className="px-4 py-2 rounded-lg text-sm text-[var(--text-muted)] hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleEnrollFromEvent}
                disabled={!selectedEventId || !eventRelation || isEnrollingFromEvent}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium",
                  "bg-[var(--accent-orange)] text-white hover:bg-[var(--accent-orange)]/90",
                  "shadow-lg shadow-[var(--accent-orange)]/20",
                  "disabled:opacity-50 disabled:cursor-not-allowed"
                )}
              >
                {isEnrollingFromEvent ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Enroll All Matching
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
