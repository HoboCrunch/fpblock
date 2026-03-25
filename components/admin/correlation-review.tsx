"use client";

import { useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { GitMerge, X, Loader2, ArrowRight } from "lucide-react";
import type { CorrelationCandidate, Person, Organization } from "@/lib/types/database";

// ---- Types ----

export type CandidateWithEntities = CorrelationCandidate & {
  source_person?: Person | null;
  target_person?: Person | null;
  source_organization?: Organization | null;
  target_organization?: Organization | null;
};

// ---- Helpers ----

function confidenceColor(c: number) {
  if (c >= 0.9) return "bg-green-500";
  if (c >= 0.7) return "bg-yellow-500";
  return "bg-orange-500";
}

function confidenceLabel(c: number) {
  if (c >= 0.9) return "replied";   // green badge
  if (c >= 0.7) return "scheduled"; // blue badge
  return "sending";                  // orange badge
}

function PersonCard({ person, label }: { person: Person; label: string }) {
  return (
    <GlassCard className="flex-1 min-w-0">
      <div className="text-xs text-[var(--text-muted)] mb-2 uppercase tracking-wider">
        {label}
      </div>
      <div className="text-white font-semibold mb-1">{person.full_name}</div>
      <dl className="space-y-1 text-sm">
        {person.email && (
          <div className="flex gap-2">
            <dt className="text-[var(--text-muted)] shrink-0">Email</dt>
            <dd className="text-[var(--text-secondary)] truncate">{person.email}</dd>
          </div>
        )}
        {person.title && (
          <div className="flex gap-2">
            <dt className="text-[var(--text-muted)] shrink-0">Title</dt>
            <dd className="text-[var(--text-secondary)] truncate">{person.title}</dd>
          </div>
        )}
        {person.linkedin_url && (
          <div className="flex gap-2">
            <dt className="text-[var(--text-muted)] shrink-0">LinkedIn</dt>
            <dd className="text-[var(--text-secondary)] truncate">{person.linkedin_url}</dd>
          </div>
        )}
        {person.twitter_handle && (
          <div className="flex gap-2">
            <dt className="text-[var(--text-muted)] shrink-0">Twitter</dt>
            <dd className="text-[var(--text-secondary)] truncate">@{person.twitter_handle}</dd>
          </div>
        )}
        {person.phone && (
          <div className="flex gap-2">
            <dt className="text-[var(--text-muted)] shrink-0">Phone</dt>
            <dd className="text-[var(--text-secondary)] truncate">{person.phone}</dd>
          </div>
        )}
        {person.bio && (
          <div className="flex gap-2">
            <dt className="text-[var(--text-muted)] shrink-0">Bio</dt>
            <dd className="text-[var(--text-secondary)] line-clamp-2">{person.bio}</dd>
          </div>
        )}
        {person.source && (
          <div className="flex gap-2">
            <dt className="text-[var(--text-muted)] shrink-0">Source</dt>
            <dd className="text-[var(--text-secondary)]">{person.source}</dd>
          </div>
        )}
      </dl>
    </GlassCard>
  );
}

function OrgCard({ org, label }: { org: Organization; label: string }) {
  return (
    <GlassCard className="flex-1 min-w-0">
      <div className="text-xs text-[var(--text-muted)] mb-2 uppercase tracking-wider">
        {label}
      </div>
      <div className="text-white font-semibold mb-1">{org.name}</div>
      <dl className="space-y-1 text-sm">
        {org.website && (
          <div className="flex gap-2">
            <dt className="text-[var(--text-muted)] shrink-0">Website</dt>
            <dd className="text-[var(--text-secondary)] truncate">{org.website}</dd>
          </div>
        )}
        {org.linkedin_url && (
          <div className="flex gap-2">
            <dt className="text-[var(--text-muted)] shrink-0">LinkedIn</dt>
            <dd className="text-[var(--text-secondary)] truncate">{org.linkedin_url}</dd>
          </div>
        )}
        {org.category && (
          <div className="flex gap-2">
            <dt className="text-[var(--text-muted)] shrink-0">Category</dt>
            <dd className="text-[var(--text-secondary)]">{org.category}</dd>
          </div>
        )}
        {org.description && (
          <div className="flex gap-2">
            <dt className="text-[var(--text-muted)] shrink-0">Description</dt>
            <dd className="text-[var(--text-secondary)] line-clamp-2">{org.description}</dd>
          </div>
        )}
        {org.icp_score != null && (
          <div className="flex gap-2">
            <dt className="text-[var(--text-muted)] shrink-0">ICP Score</dt>
            <dd>
              <Badge variant={org.icp_score >= 90 ? "replied" : org.icp_score >= 75 ? "scheduled" : "default"}>
                {org.icp_score}
              </Badge>
            </dd>
          </div>
        )}
        {org.usp && (
          <div className="flex gap-2">
            <dt className="text-[var(--text-muted)] shrink-0">USP</dt>
            <dd className="text-[var(--text-secondary)] line-clamp-2">{org.usp}</dd>
          </div>
        )}
      </dl>
    </GlassCard>
  );
}

// ---- Main Component ----

export function CorrelationReview({
  candidates: initialCandidates,
}: {
  candidates: CandidateWithEntities[];
}) {
  const [candidates, setCandidates] = useState(initialCandidates);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function handleMerge(candidate: CandidateWithEntities) {
    setLoadingId(candidate.id);
    try {
      const res = await fetch("/api/correlations/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidate_id: candidate.id,
          winner_id: candidate.source_id,
          loser_id: candidate.target_id,
          entity_type: candidate.entity_type,
        }),
      });

      if (res.ok) {
        // Optimistic removal
        setCandidates((prev) => prev.filter((c) => c.id !== candidate.id));
      }
    } finally {
      setLoadingId(null);
    }
  }

  async function handleDismiss(candidate: CandidateWithEntities) {
    setLoadingId(candidate.id);
    try {
      const res = await fetch("/api/correlations/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidate_id: candidate.id,
          action: "dismiss",
        }),
      });

      if (res.ok) {
        setCandidates((prev) => prev.filter((c) => c.id !== candidate.id));
      }
    } finally {
      setLoadingId(null);
    }
  }

  if (candidates.length === 0) {
    return (
      <GlassCard className="text-center py-12">
        <GitMerge className="h-8 w-8 text-[var(--text-muted)] mx-auto mb-2" />
        <p className="text-[var(--text-muted)]">
          No pending correlation candidates
        </p>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-6">
      {candidates.map((candidate) => {
        const isLoading = loadingId === candidate.id;
        const isPerson = candidate.entity_type === "person";
        const reasons = (candidate.match_reasons ?? []) as string[];

        return (
          <GlassCard key={candidate.id} className="space-y-4">
            {/* Header: confidence + reasons */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <Badge variant={confidenceLabel(candidate.confidence)}>
                  {(candidate.confidence * 100).toFixed(0)}% match
                </Badge>
                <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider">
                  {isPerson ? "Person" : "Organization"}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {reasons.map((reason) => (
                  <Badge key={String(reason)} variant="glass">
                    {String(reason)}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Confidence bar */}
            <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  confidenceColor(candidate.confidence)
                )}
                style={{ width: `${candidate.confidence * 100}%` }}
              />
            </div>

            {/* Side-by-side cards */}
            <div className="flex flex-col md:flex-row gap-4 items-stretch">
              {isPerson && candidate.source_person ? (
                <PersonCard person={candidate.source_person} label="Source" />
              ) : !isPerson && candidate.source_organization ? (
                <OrgCard org={candidate.source_organization} label="Source" />
              ) : null}

              <div className="flex items-center justify-center shrink-0">
                <ArrowRight className="h-5 w-5 text-[var(--text-muted)] rotate-0 md:rotate-0 max-md:rotate-90" />
              </div>

              {isPerson && candidate.target_person ? (
                <PersonCard person={candidate.target_person} label="Target" />
              ) : !isPerson && candidate.target_organization ? (
                <OrgCard org={candidate.target_organization} label="Target" />
              ) : null}
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => handleMerge(candidate)}
                disabled={isLoading}
                className={cn(
                  "flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                  "bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border border-[var(--accent-orange)]/20",
                  "hover:bg-[var(--accent-orange)]/25",
                  isLoading && "opacity-50 cursor-not-allowed"
                )}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <GitMerge className="h-4 w-4" />
                )}
                Merge (keep source)
              </button>
              <button
                onClick={() => handleDismiss(candidate)}
                disabled={isLoading}
                className={cn(
                  "flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                  "bg-white/[0.04] text-[var(--text-muted)] border border-[var(--glass-border)]",
                  "hover:bg-white/[0.08] hover:text-white",
                  isLoading && "opacity-50 cursor-not-allowed"
                )}
              >
                <X className="h-4 w-4" />
                Dismiss
              </button>
            </div>
          </GlassCard>
        );
      })}
    </div>
  );
}
