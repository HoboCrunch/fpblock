"use client";

import React, { useState, useMemo, useCallback, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BookmarkCheck,
  Loader2,
  Pencil,
  Save,
  X,
} from "lucide-react";
import { TwoPanelLayout } from "@/components/admin/two-panel-layout";
import { GlassCard } from "@/components/ui/glass-card";
import { ActiveFilters } from "@/components/admin/active-filters";
import { PersonFilterSidebar } from "@/components/admin/person-filter-sidebar";
import {
  applyPersonFilters,
  defaultPersonFilterRules,
  isEmptyRules,
  normalizeRules,
  personFilterRulesToActiveFilters,
  removeFilterKey,
  clearAllFilters,
  type PersonFilterRules,
  type FilterKey,
} from "@/lib/filters/person-filters";
import { useEventPersonIds, useEventRelationMap } from "@/lib/queries/use-event-affiliations";
import { toggleToRelation } from "@/components/admin/event-relation-toggle";
import type { PersonRow, CorrelationResult } from "@/app/admin/persons/person-table-row";
import { ListMembersTable } from "./list-members-table";
import { ListMatchesTable } from "./list-matches-table";
import {
  addToList,
  removeFromList,
  saveListFilter,
  updateList,
  getListItems,
} from "../actions";
import { cn } from "@/lib/utils";

const SPEAKER_ROLES = ["speaker", "panelist", "mc"];

function computeCorrelation(row: PersonRow): CorrelationResult {
  const personSpeakerEvents = row.personEvents.filter((e) => SPEAKER_ROLES.includes(e.role));
  for (const pe of personSpeakerEvents) {
    const orgMatch = row.orgEvents.find((oe) => oe.event_id === pe.event_id);
    if (orgMatch && orgMatch.tier) {
      return {
        type: "speaker_sponsor",
        segments: [
          { text: "Speaker" },
          { text: orgMatch.org_name, href: `/admin/organizations/${orgMatch.org_id}` },
          { text: `${orgMatch.tier} Sponsor`, badge: orgMatch.tier.toLowerCase() },
        ],
      };
    }
  }
  for (const pe of row.personEvents) {
    const orgMatch = row.orgEvents.find((oe) => oe.event_id === pe.event_id);
    if (orgMatch && orgMatch.tier) {
      return {
        type: "sponsor_contact",
        segments: [
          { text: pe.role },
          { text: orgMatch.org_name, href: `/admin/organizations/${orgMatch.org_id}` },
          { text: `${orgMatch.tier} Sponsor`, badge: orgMatch.tier.toLowerCase() },
        ],
      };
    }
  }
  if (personSpeakerEvents.length > 0) {
    const pe = personSpeakerEvents[0];
    return { type: "speaker_only", segments: [{ text: "Speaker" }, { text: pe.event_name }] };
  }
  if (row.orgEvents.length > 0) {
    const oe = row.orgEvents.find((o) => o.tier) || row.orgEvents[0];
    if (oe.tier) {
      return {
        type: "org_sponsor",
        segments: [
          { text: oe.org_name, href: `/admin/organizations/${oe.org_id}` },
          { text: `${oe.tier} Sponsor`, badge: oe.tier.toLowerCase() },
        ],
      };
    }
  }
  return { type: "none", segments: [] };
}

export type ListDetailClientProps = {
  list: { id: string; name: string; description: string | null; filter_rules: PersonFilterRules | null };
  initialMemberIds: string[];
  rows: PersonRow[];
  eventOptions: { id: string; name: string }[];
  sourceOptions: string[];
  seniorityOptions: string[];
  departmentOptions: string[];
};

export function ListDetailClient(props: ListDetailClientProps) {
  const router = useRouter();
  const { list, rows, eventOptions, sourceOptions, seniorityOptions, departmentOptions } = props;

  const [memberIds, setMemberIds] = useState<Set<string>>(() => new Set(props.initialMemberIds));
  const [tab, setTab] = useState<"members" | "matches">("members");
  const [rules, setRules] = useState<PersonFilterRules>(() => list.filter_rules ?? defaultPersonFilterRules());
  const [savedRules, setSavedRules] = useState<PersonFilterRules | null>(list.filter_rules);
  const [isSavingFilter, setIsSavingFilter] = useState(false);
  const [, startTransition] = useTransition();

  // Inline edit
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(list.name);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descValue, setDescValue] = useState(list.description ?? "");

  // Event scope (mirrors /persons)
  const eventRelation = rules.eventScope
    ? toggleToRelation(rules.eventScope.speaker, rules.eventScope.orgAffiliated)
    : null;
  const { data: eventPersonIds } = useEventPersonIds(rules.eventScope?.eventId ?? null, eventRelation);
  const { data: eventRelationMap } = useEventRelationMap(rules.eventScope?.eventId ?? null);

  // Correlations precomputed once
  const correlations = useMemo(() => {
    const map: Record<string, CorrelationResult> = {};
    for (const row of rows) map[row.id] = computeCorrelation(row);
    return map;
  }, [rows]);

  const memberRows = useMemo(() => rows.filter((r) => memberIds.has(r.id)), [rows, memberIds]);

  const filteredMembers = useMemo(() =>
    applyPersonFilters(memberRows, rules, {
      correlations,
      eventPersonIds: rules.eventScope ? (eventPersonIds ? new Set(eventPersonIds) : null) : undefined,
    }),
    [memberRows, rules, correlations, eventPersonIds],
  );

  const filteredMatches = useMemo(() =>
    applyPersonFilters(rows, rules, {
      correlations,
      eventPersonIds: rules.eventScope ? (eventPersonIds ? new Set(eventPersonIds) : null) : undefined,
    }),
    [rows, rules, correlations, eventPersonIds],
  );

  const newMatchesCount = useMemo(
    () => filteredMatches.reduce((n, r) => (memberIds.has(r.id) ? n : n + 1), 0),
    [filteredMatches, memberIds],
  );

  const activeFilters = useMemo(
    () => personFilterRulesToActiveFilters(rules, { eventOptions }),
    [rules, eventOptions],
  );

  const handleRemoveFilter = useCallback(
    (key: string) => setRules((r) => removeFilterKey(r, key as FilterKey)),
    [],
  );
  const handleClearAll = useCallback(() => setRules(clearAllFilters()), []);

  const rulesEqualSaved = useMemo(() => {
    return JSON.stringify(normalizeRules(rules)) === JSON.stringify(savedRules ?? {});
  }, [rules, savedRules]);

  const hasSavedFilter = savedRules !== null && !isEmptyRules(savedRules);

  async function handleSaveFilter() {
    setIsSavingFilter(true);
    const normalized = normalizeRules(rules);
    const toSave = isEmptyRules(normalized) ? null : normalized;
    const { success } = await saveListFilter(list.id, toSave);
    if (success) setSavedRules(toSave);
    setIsSavingFilter(false);
  }

  async function handleClearSavedFilter() {
    setIsSavingFilter(true);
    const { success } = await saveListFilter(list.id, null);
    if (success) setSavedRules(null);
    setIsSavingFilter(false);
  }

  async function refreshMembers() {
    const { data } = await getListItems(list.id);
    setMemberIds(new Set((data as { person_id: string }[]).map((r) => r.person_id)));
  }
  async function handleAddMatches(ids: string[]) {
    const toAdd = ids.filter((id) => !memberIds.has(id));
    if (toAdd.length === 0) return;
    await addToList(list.id, toAdd);
    await refreshMembers();
  }
  async function handleRemoveMembers(ids: string[]) {
    if (ids.length === 0) return;
    await removeFromList(list.id, ids);
    await refreshMembers();
  }

  async function saveName() {
    if (!nameValue.trim() || nameValue.trim() === list.name) {
      setEditingName(false);
      setNameValue(list.name);
      return;
    }
    await updateList(list.id, { name: nameValue.trim() });
    setEditingName(false);
    startTransition(() => router.refresh());
  }
  async function saveDesc() {
    if (descValue.trim() === (list.description ?? "")) {
      setEditingDesc(false);
      return;
    }
    await updateList(list.id, { description: descValue.trim() || undefined });
    setEditingDesc(false);
    startTransition(() => router.refresh());
  }

  const sidebar = (
    <div className="space-y-3">
      <GlassCard padding={false} className="overflow-hidden">
        <PersonFilterSidebar
          rules={rules}
          onChange={setRules}
          eventOptions={eventOptions}
          sourceOptions={sourceOptions}
          seniorityOptions={seniorityOptions}
          departmentOptions={departmentOptions}
        />
      </GlassCard>
      <ActiveFilters filters={activeFilters} onRemove={handleRemoveFilter} onClearAll={handleClearAll} />
    </div>
  );

  return (
    <TwoPanelLayout sidebar={sidebar}>
      <div className="space-y-4">
        <div>
          <Link
            href="/admin/lists"
            className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-white transition-colors mb-3"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Lists
          </Link>

          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              {editingName ? (
                <input
                  autoFocus
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  onBlur={saveName}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveName();
                    if (e.key === "Escape") { setNameValue(list.name); setEditingName(false); }
                  }}
                  className="text-2xl font-semibold font-[family-name:var(--font-heading)] bg-transparent border-b border-[var(--accent-orange)]/50 text-white w-full focus:outline-none pb-0.5"
                />
              ) : (
                <button onClick={() => setEditingName(true)} className="group flex items-center gap-2">
                  <h1 className="text-2xl font-semibold font-[family-name:var(--font-heading)] text-white">
                    {list.name}
                  </h1>
                  <Pencil className="h-4 w-4 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </button>
              )}

              <div className="mt-1">
                {editingDesc ? (
                  <input
                    autoFocus
                    value={descValue}
                    onChange={(e) => setDescValue(e.target.value)}
                    onBlur={saveDesc}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveDesc();
                      if (e.key === "Escape") { setDescValue(list.description ?? ""); setEditingDesc(false); }
                    }}
                    placeholder="Add a description..."
                    className="text-sm bg-transparent border-b border-[var(--accent-orange)]/30 text-[var(--text-secondary)] w-full focus:outline-none pb-0.5 placeholder:text-[var(--text-muted)]"
                  />
                ) : (
                  <button onClick={() => setEditingDesc(true)} className="group flex items-center gap-1.5">
                    <span className="text-sm text-[var(--text-muted)]">
                      {list.description || "Add a description..."}
                    </span>
                    <Pencil className="h-3 w-3 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {hasSavedFilter && (
                <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--accent-indigo)]/10 border border-[var(--accent-indigo)]/20 text-[var(--accent-indigo)] text-xs">
                  <BookmarkCheck className="h-3.5 w-3.5" />
                  <span>Saved filter</span>
                  <button
                    onClick={handleClearSavedFilter}
                    disabled={isSavingFilter}
                    title="Clear saved filter"
                    className="ml-1 hover:text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
              <button
                onClick={handleSaveFilter}
                disabled={isSavingFilter || isEmptyRules(rules) || rulesEqualSaved}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200",
                  "bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border border-[var(--accent-orange)]/20 hover:bg-[var(--accent-orange)]/25",
                  "disabled:opacity-40 disabled:cursor-not-allowed",
                )}
              >
                {isSavingFilter ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                {hasSavedFilter ? "Update saved filter" : "Save filter"}
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 border-b border-[var(--glass-border)]">
          <button
            onClick={() => setTab("members")}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
              tab === "members"
                ? "border-[var(--accent-orange)] text-white"
                : "border-transparent text-[var(--text-muted)] hover:text-white",
            )}
          >
            Members <span className="ml-1 tabular-nums text-xs">{memberIds.size}</span>
          </button>
          <button
            onClick={() => setTab("matches")}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
              tab === "matches"
                ? "border-[var(--accent-orange)] text-white"
                : "border-transparent text-[var(--text-muted)] hover:text-white",
            )}
          >
            Matches
            {!isEmptyRules(rules) && (
              <span className="ml-1 tabular-nums text-xs text-[var(--accent-indigo)]">
                {filteredMatches.length}
                {newMatchesCount > 0 && ` (+${newMatchesCount})`}
              </span>
            )}
          </button>
        </div>

        {tab === "members" ? (
          <ListMembersTable
            rows={filteredMembers}
            correlations={correlations}
            eventRelationMap={rules.eventScope?.eventId ? eventRelationMap : undefined}
            onRemove={handleRemoveMembers}
            isFiltered={!isEmptyRules(rules)}
            totalMembers={memberIds.size}
          />
        ) : (
          <ListMatchesTable
            rows={filteredMatches}
            correlations={correlations}
            eventRelationMap={rules.eventScope?.eventId ? eventRelationMap : undefined}
            memberIds={memberIds}
            onAdd={handleAddMatches}
            isFiltered={!isEmptyRules(rules)}
          />
        )}
      </div>
    </TwoPanelLayout>
  );
}
