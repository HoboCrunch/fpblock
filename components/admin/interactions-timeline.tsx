"use client";

import { useState } from "react";
import type {
  Interaction,
  InteractionType,
  InteractionChannel,
  InteractionDirection,
} from "@/lib/types/database";
import { Badge } from "@/components/ui/badge";
import { FilterBar, type FilterConfig } from "@/components/admin/filter-bar";
import Link from "next/link";
import {
  Mail,
  Linkedin,
  MessageSquare,
  Users,
  Search,
  FileText,
  Phone,
  Twitter,
  Send,
  ChevronRight,
  ChevronDown,
} from "lucide-react";

const TYPE_ICONS: Record<string, React.ElementType> = {
  cold_email: Mail,
  cold_linkedin: Linkedin,
  cold_twitter: Twitter,
  warm_intro: Users,
  meeting: MessageSquare,
  call: Phone,
  event_encounter: Users,
  note: FileText,
  research: Search,
};

const DIRECTION_ARROWS: Record<string, string> = {
  outbound: "\u2197",
  inbound: "\u2199",
  internal: "\u2194",
};

const INTERACTION_TYPE_OPTIONS = [
  { value: "cold_email", label: "Cold Email" },
  { value: "cold_linkedin", label: "Cold LinkedIn" },
  { value: "cold_twitter", label: "Cold Twitter" },
  { value: "warm_intro", label: "Warm Intro" },
  { value: "meeting", label: "Meeting" },
  { value: "call", label: "Call" },
  { value: "event_encounter", label: "Event Encounter" },
  { value: "note", label: "Note" },
  { value: "research", label: "Research" },
];

const CHANNEL_OPTIONS = [
  { value: "email", label: "Email" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "twitter", label: "Twitter" },
  { value: "telegram", label: "Telegram" },
  { value: "in_person", label: "In Person" },
  { value: "phone", label: "Phone" },
];

const DIRECTION_OPTIONS = [
  { value: "outbound", label: "Outbound" },
  { value: "inbound", label: "Inbound" },
  { value: "internal", label: "Internal" },
];

type InteractionRow = Interaction & {
  person?: { id: string; full_name: string } | null;
  organization?: { id: string; name: string } | null;
};

interface InteractionsTimelineProps {
  interactions: InteractionRow[];
  showFilters?: boolean;
  showPersonLink?: boolean;
  showOrgLink?: boolean;
}

export function InteractionsTimeline({
  interactions,
  showFilters = true,
  showPersonLink = false,
  showOrgLink = false,
}: InteractionsTimelineProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({
    interaction_type: "",
    channel: "",
    direction: "",
  });

  const filterConfigs: FilterConfig[] = [
    {
      key: "interaction_type",
      placeholder: "All Types",
      options: INTERACTION_TYPE_OPTIONS,
    },
    {
      key: "channel",
      placeholder: "All Channels",
      options: CHANNEL_OPTIONS,
    },
    {
      key: "direction",
      placeholder: "All Directions",
      options: DIRECTION_OPTIONS,
    },
  ];

  function handleFilterChange(key: string, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  const filtered = interactions.filter((ix) => {
    if (filters.interaction_type && ix.interaction_type !== filters.interaction_type) return false;
    if (filters.channel && ix.channel !== filters.channel) return false;
    if (filters.direction && ix.direction !== filters.direction) return false;
    return true;
  });

  // Sort chronologically, newest first
  const sorted = [...filtered].sort((a, b) => {
    const aDate = a.occurred_at || a.created_at;
    const bDate = b.occurred_at || b.created_at;
    return bDate.localeCompare(aDate);
  });

  return (
    <div className="space-y-4">
      {showFilters && (
        <FilterBar
          filters={filterConfigs}
          values={filters}
          onChange={handleFilterChange}
        />
      )}

      <div className="space-y-1">
        {sorted.length === 0 && (
          <div className="px-5 py-12 text-center">
            <MessageSquare className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-3" />
            <p className="text-[var(--text-muted)]">No interactions found.</p>
          </div>
        )}

        {sorted.map((ix) => {
          const isExpanded = expandedId === ix.id;
          const Icon = TYPE_ICONS[ix.interaction_type] || FileText;
          const dirArrow = ix.direction ? DIRECTION_ARROWS[ix.direction] || "" : "";
          const timestamp = ix.occurred_at || ix.scheduled_at || ix.created_at;

          return (
            <div key={ix.id}>
              {/* Main row */}
              <div
                className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-white/[0.03] transition-all duration-200 cursor-pointer"
                onClick={() => setExpandedId(isExpanded ? null : ix.id)}
              >
                {/* Expand indicator */}
                <div className="text-[var(--text-muted)]">
                  {isExpanded ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" />
                  )}
                </div>

                {/* Type icon */}
                <div className="flex-shrink-0">
                  <Icon className="w-4 h-4 text-[var(--text-muted)]" />
                </div>

                {/* Direction arrow */}
                {dirArrow && (
                  <span className="text-xs text-[var(--text-muted)] w-4 text-center flex-shrink-0">
                    {dirArrow}
                  </span>
                )}

                {/* Subject / preview */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {ix.subject && (
                      <span className="text-white text-sm font-medium truncate">
                        {ix.subject}
                      </span>
                    )}
                    {!ix.subject && ix.body && (
                      <span className="text-[var(--text-secondary)] text-sm truncate">
                        {ix.body.slice(0, 80)}{ix.body.length > 80 ? "..." : ""}
                      </span>
                    )}
                    {!ix.subject && !ix.body && (
                      <span className="text-[var(--text-muted)] text-sm italic">
                        {ix.interaction_type.replace(/_/g, " ")}
                      </span>
                    )}
                  </div>

                  {/* Person / org links */}
                  <div className="flex items-center gap-2 mt-0.5">
                    {showPersonLink && ix.person && (
                      <Link
                        href={`/admin/persons/${ix.person.id}`}
                        className="text-xs text-[var(--accent-indigo)] hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {ix.person.full_name}
                      </Link>
                    )}
                    {showOrgLink && ix.organization && (
                      <Link
                        href={`/admin/organizations/${ix.organization.id}`}
                        className="text-xs text-[var(--text-secondary)] hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {ix.organization.name}
                      </Link>
                    )}
                  </div>
                </div>

                {/* Badges */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {ix.channel && <Badge>{ix.channel}</Badge>}
                  <Badge variant={ix.status}>{ix.status}</Badge>
                </div>

                {/* Timestamp */}
                <span className="text-xs text-[var(--text-muted)] flex-shrink-0 w-24 text-right">
                  {new Date(timestamp).toLocaleDateString()}
                </span>
              </div>

              {/* Expanded content */}
              {isExpanded && (
                <div className="ml-11 mr-4 mb-3 px-4 py-4 rounded-lg bg-white/[0.02] border border-[var(--glass-border)]">
                  {ix.subject && (
                    <p className="text-white font-medium text-sm mb-2">{ix.subject}</p>
                  )}
                  {ix.body && (
                    <p className="text-[var(--text-secondary)] text-sm whitespace-pre-wrap leading-relaxed mb-3">
                      {ix.body}
                    </p>
                  )}

                  {/* Metadata row */}
                  <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--text-muted)] mb-3">
                    <span>Type: {ix.interaction_type.replace(/_/g, " ")}</span>
                    {ix.direction && <span>Direction: {dirArrow} {ix.direction}</span>}
                    {ix.handled_by && <span>Handled by: {ix.handled_by}</span>}
                    {ix.sequence_step != null && <span>Seq step: {ix.sequence_step}</span>}
                    {ix.occurred_at && <span>Occurred: {new Date(ix.occurred_at).toLocaleString()}</span>}
                    {ix.scheduled_at && <span>Scheduled: {new Date(ix.scheduled_at).toLocaleString()}</span>}
                  </div>

                  {/* Detail JSONB key-value pairs */}
                  {ix.detail && Object.keys(ix.detail).length > 0 && (
                    <div className="border-t border-[var(--glass-border)] pt-3">
                      <p className="text-xs text-[var(--text-muted)] font-medium mb-2">Details</p>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                        {Object.entries(ix.detail).map(([key, value]) => (
                          <div key={key} className="flex items-baseline gap-2">
                            <span className="text-xs text-[var(--text-muted)]">{key}:</span>
                            <span className="text-xs text-[var(--text-secondary)]">
                              {typeof value === "object" ? JSON.stringify(value) : String(value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer count */}
      <div className="px-4 pt-2 border-t border-[var(--glass-border)]">
        <p className="text-xs text-[var(--text-muted)]">
          {sorted.length} interaction{sorted.length !== 1 ? "s" : ""}
          {sorted.length !== interactions.length && ` (filtered from ${interactions.length})`}
        </p>
      </div>
    </div>
  );
}
