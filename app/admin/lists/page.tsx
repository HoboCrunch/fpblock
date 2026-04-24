"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useTransition,
} from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import Link from "next/link";
import {
  Plus,
  Trash2,
  ArrowLeft,
  Search,
  Users,
  Loader2,
  UserPlus,
  X,
  ChevronRight,
  Check,
  Pencil,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  getLists,
  createList,
  updateList,
  deleteList,
  getListItems,
  addToList,
  removeFromList,
} from "./actions";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PersonList {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  person_list_items: { count: number }[];
}

interface ListItem {
  id: string;
  list_id: string;
  person_id: string;
  added_at: string;
  person: {
    id: string;
    full_name: string;
    email: string | null;
    linkedin_url: string | null;
    twitter_handle: string | null;
    phone: string | null;
    title: string | null;
    source: string | null;
  } | null;
}

interface PersonSearchResult {
  id: string;
  full_name: string | null;
  email: string | null;
  primary_org_name: string | null;
  icp_score: number | null;
}

// ─── Supabase browser client ──────────────────────────────────────────────────

function useSupabase() {
  return createClient();
}

// ─── Glass Checkbox ──────────────────────────────────────────────────────────

function GlassCheckbox({ checked, onChange, onClick }: { checked: boolean; onChange?: () => void; onClick?: (e: React.MouseEvent) => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { if (onClick) onClick(e); else if (onChange) onChange(); }}
      className={cn(
        "w-4 h-4 rounded border flex items-center justify-center transition-all duration-150 flex-shrink-0",
        checked
          ? "bg-[var(--accent-orange)]/20 border-[var(--accent-orange)]/60 text-[var(--accent-orange)]"
          : "border-white/20 bg-white/[0.04] hover:border-white/40"
      )}
    >
      {checked && <Check className="w-3 h-3" />}
    </button>
  );
}

// ─── ICP Badge ────────────────────────────────────────────────────────────────

function icpVariant(score: number | null): string {
  if (score === null) return "default";
  if (score >= 90) return "replied";
  if (score >= 75) return "scheduled";
  return "default";
}

// ─── New List Modal ───────────────────────────────────────────────────────────

function NewListModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!name.trim()) return;
    setIsCreating(true);
    setError(null);
    const result = await createList(name.trim(), description.trim() || undefined);
    if (result.error || !result.data) {
      setError(result.error ?? "Failed to create list");
      setIsCreating(false);
      return;
    }
    onCreate(result.data.id);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleCreate();
    if (e.key === "Escape") onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative glass rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold font-[family-name:var(--font-heading)] text-white">
            New List
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1.5 font-[family-name:var(--font-body)]">
              Name <span className="text-red-400">*</span>
            </label>
            <GlassInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. EthCC Tier 1 Speakers"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1.5 font-[family-name:var(--font-body)]">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
              placeholder="Optional description..."
              rows={3}
              className={cn(
                "w-full rounded-lg font-[family-name:var(--font-body)]",
                "bg-[var(--glass-bg)] border border-[var(--glass-border)]",
                "backdrop-blur-xl text-white placeholder:text-[var(--text-muted)]",
                "px-3 py-2 text-sm transition-all duration-200 resize-none",
                "focus:outline-none focus:ring-2 focus:ring-[var(--accent-orange)]/40 focus:border-[var(--accent-orange)]/50",
                "hover:bg-[var(--glass-bg-hover)] hover:border-[var(--glass-border-hover)]"
              )}
            />
          </div>

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-[var(--text-muted)] hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || isCreating}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
              "bg-[var(--accent-orange)] text-white hover:bg-[var(--accent-orange)]/90",
              "shadow-lg shadow-[var(--accent-orange)]/20",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {isCreating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Create List
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Members Panel ────────────────────────────────────────────────────────

function AddMembersPanel({
  listId,
  existingPersonIds,
  onClose,
  onAdded,
}: {
  listId: string;
  existingPersonIds: Set<string>;
  onClose: () => void;
  onAdded: () => void;
}) {
  const supabase = useSupabase();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PersonSearchResult[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSearching, setIsSearching] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [searched, setSearched] = useState(false);

  const runSearch = useCallback(
    async (q: string) => {
      if (q.trim().length < 2) {
        setResults([]);
        setSearched(false);
        return;
      }
      setIsSearching(true);
      setSearched(true);
      const { data } = await supabase
        .from("persons_with_icp")
        .select("id, full_name, email, primary_org_name, icp_score")
        .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
        .order("icp_score", { ascending: false })
        .limit(30);
      setResults((data as PersonSearchResult[]) ?? []);
      setIsSearching(false);
    },
    [supabase]
  );

  useEffect(() => {
    const timer = setTimeout(() => runSearch(query), 300);
    return () => clearTimeout(timer);
  }, [query, runSearch]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleAdd() {
    if (selectedIds.size === 0) return;
    setIsAdding(true);
    const result = await addToList(listId, Array.from(selectedIds));
    if (result.success) {
      onAdded();
    }
    setIsAdding(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative glass rounded-xl p-6 w-full max-w-lg mx-4 shadow-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-5 shrink-0">
          <h2 className="text-lg font-semibold font-[family-name:var(--font-heading)] text-white">
            Add Members
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search */}
        <div className="mb-4 shrink-0">
          <GlassInput
            icon={Search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or email..."
            autoFocus
          />
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto min-h-0 space-y-1.5 mb-4">
          {isSearching && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 text-[var(--text-muted)] animate-spin" />
            </div>
          )}

          {!isSearching && query.trim().length < 2 && (
            <p className="text-sm text-[var(--text-muted)] text-center py-8">
              Type at least 2 characters to search
            </p>
          )}

          {!isSearching && searched && results.length === 0 && (
            <p className="text-sm text-[var(--text-muted)] text-center py-8">
              No persons found
            </p>
          )}

          {!isSearching &&
            results.map((person) => {
              const alreadyIn = existingPersonIds.has(person.id);
              const isSelected = selectedIds.has(person.id);

              return (
                <button
                  key={person.id}
                  onClick={() => !alreadyIn && toggleSelect(person.id)}
                  disabled={alreadyIn}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all duration-200 border",
                    alreadyIn
                      ? "opacity-50 cursor-not-allowed bg-[var(--glass-bg)] border-[var(--glass-border)]"
                      : isSelected
                      ? "bg-[var(--accent-indigo)]/10 border-[var(--accent-indigo)]/30"
                      : "bg-[var(--glass-bg)] border-[var(--glass-border)] hover:bg-[var(--glass-bg-hover)]"
                  )}
                >
                  {/* Checkbox */}
                  <div className="shrink-0">
                    {alreadyIn ? (
                      <div className="h-5 w-5 rounded border border-[var(--glass-border)] bg-[var(--glass-bg)] flex items-center justify-center">
                        <Check className="h-3 w-3 text-[var(--text-muted)]" />
                      </div>
                    ) : isSelected ? (
                      <div className="h-5 w-5 rounded bg-[var(--accent-indigo)] flex items-center justify-center">
                        <Check className="h-3 w-3 text-white" />
                      </div>
                    ) : (
                      <div className="h-5 w-5 rounded border border-[var(--glass-border)]" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">
                      {person.full_name ?? "Unknown"}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] truncate">
                      {[person.email, person.primary_org_name]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>

                  {/* ICP + status */}
                  <div className="shrink-0 flex items-center gap-2">
                    {person.icp_score !== null && (
                      <Badge variant={icpVariant(person.icp_score)}>
                        {person.icp_score}
                      </Badge>
                    )}
                    {alreadyIn && (
                      <span className="text-xs text-[var(--text-muted)]">
                        in list
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-[var(--glass-border)] shrink-0">
          <span className="text-sm text-[var(--text-muted)]">
            {selectedIds.size} selected
          </span>
          <button
            onClick={handleAdd}
            disabled={selectedIds.size === 0 || isAdding}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
              "bg-[var(--accent-orange)] text-white hover:bg-[var(--accent-orange)]/90",
              "shadow-lg shadow-[var(--accent-orange)]/20",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {isAdding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="h-4 w-4" />
            )}
            Add Selected
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Lists Index ──────────────────────────────────────────────────────────────

function ListsIndex({
  lists,
  isLoading,
  onSelect,
  onNew,
  onDelete,
}: {
  lists: PersonList[];
  isLoading: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string, name: string) => void;
}) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-end">
        <button
          onClick={onNew}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
            "bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border border-[var(--accent-orange)]/20",
            "hover:bg-[var(--accent-orange)]/25"
          )}
        >
          <Plus className="h-4 w-4" />
          New List
        </button>
      </div>

      {/* Body */}
      <GlassCard padding={false}>
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 text-[var(--text-muted)] animate-spin" />
          </div>
        ) : lists.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-12 w-12 rounded-xl bg-[var(--accent-orange)]/10 flex items-center justify-center mb-4">
              <Users className="h-6 w-6 text-[var(--accent-orange)]" />
            </div>
            <p className="text-[var(--text-muted)] text-sm">No lists yet.</p>
            <button
              onClick={onNew}
              className="mt-3 text-sm text-[var(--accent-indigo)] hover:underline"
            >
              Create your first list
            </button>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {lists.map((list) => {
              const count = list.person_list_items?.[0]?.count ?? 0;
              return (
                <div
                  key={list.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect(list.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect(list.id); }}
                  className="w-full flex items-center gap-4 px-5 py-4 hover:bg-white/[0.04] transition-all duration-200 text-left group cursor-pointer"
                >
                  <div className="h-9 w-9 rounded-lg bg-[var(--accent-orange)]/10 flex items-center justify-center shrink-0">
                    <Users className="h-4 w-4 text-[var(--accent-orange)]" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <span className="text-white font-medium text-sm block truncate">
                      {list.name}
                    </span>
                    {list.description && (
                      <span className="text-[var(--text-muted)] text-xs truncate block">
                        {list.description}
                      </span>
                    )}
                  </div>

                  <span className="text-xs text-[var(--text-muted)] tabular-nums shrink-0">
                    {count} {count === 1 ? "person" : "persons"}
                  </span>

                  <span className="text-xs text-[var(--text-muted)] shrink-0">
                    {new Date(list.updated_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(list.id, list.name);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-all"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>

                  <ChevronRight className="h-4 w-4 text-[var(--text-muted)] shrink-0 opacity-40 group-hover:opacity-100 transition-opacity" />
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>

      {lists.length > 0 && (
        <p className="text-xs text-[var(--text-muted)] px-1">
          {lists.length} {lists.length === 1 ? "list" : "lists"}
        </p>
      )}
    </div>
  );
}

// ─── List Detail ──────────────────────────────────────────────────────────────

function ListDetail({
  listId,
  allLists,
  onBack,
  onListUpdated,
}: {
  listId: string;
  allLists: PersonList[];
  onBack: () => void;
  onListUpdated: () => void;
}) {
  const list = allLists.find((l) => l.id === listId);

  const [items, setItems] = useState<ListItem[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  // Inline edit state
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(list?.name ?? "");
  const [editingDesc, setEditingDesc] = useState(false);
  const [descValue, setDescValue] = useState(list?.description ?? "");

  const [, startTransition] = useTransition();

  const loadItems = useCallback(async () => {
    setIsLoadingItems(true);
    const result = await getListItems(listId);
    setItems(result.data as ListItem[]);
    setIsLoadingItems(false);
  }, [listId]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  // Sync name/desc when list prop changes
  useEffect(() => {
    if (list) {
      setNameValue(list.name);
      setDescValue(list.description ?? "");
    }
  }, [list]);

  const existingPersonIds = new Set(items.map((item) => item.person_id));

  async function saveName() {
    if (!nameValue.trim() || nameValue.trim() === list?.name) {
      setEditingName(false);
      return;
    }
    await updateList(listId, { name: nameValue.trim() });
    setEditingName(false);
    startTransition(() => onListUpdated());
  }

  async function saveDesc() {
    if (descValue.trim() === (list?.description ?? "")) {
      setEditingDesc(false);
      return;
    }
    await updateList(listId, { description: descValue.trim() || undefined });
    setEditingDesc(false);
    startTransition(() => onListUpdated());
  }

  function toggleMember(personId: string) {
    setSelectedMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(personId)) next.delete(personId);
      else next.add(personId);
      return next;
    });
  }

  function toggleAllMembers() {
    if (selectedMemberIds.size === items.length) {
      setSelectedMemberIds(new Set());
    } else {
      setSelectedMemberIds(new Set(items.map((i) => i.person_id)));
    }
  }

  async function handleBulkRemove() {
    if (selectedMemberIds.size === 0) return;
    const confirmed = window.confirm(
      `Remove ${selectedMemberIds.size} ${selectedMemberIds.size === 1 ? "person" : "persons"} from this list?`
    );
    if (!confirmed) return;
    setIsRemoving(true);
    await removeFromList(listId, Array.from(selectedMemberIds));
    setSelectedMemberIds(new Set());
    await loadItems();
    setIsRemoving(false);
    onListUpdated();
  }

  async function handleRemoveOne(personId: string) {
    const confirmed = window.confirm("Remove this person from the list?");
    if (!confirmed) return;
    await removeFromList(listId, [personId]);
    await loadItems();
    onListUpdated();
  }

  if (!list) {
    return (
      <div className="space-y-6">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Lists
        </button>
        <p className="text-[var(--text-muted)]">List not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div>
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-white transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Lists
        </button>

        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {/* Inline editable name */}
            {editingName ? (
              <input
                autoFocus
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onBlur={saveName}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveName();
                  if (e.key === "Escape") {
                    setNameValue(list.name);
                    setEditingName(false);
                  }
                }}
                className={cn(
                  "text-2xl font-semibold font-[family-name:var(--font-heading)] bg-transparent",
                  "border-b border-[var(--accent-orange)]/50 text-white w-full",
                  "focus:outline-none pb-0.5"
                )}
              />
            ) : (
              <button
                onClick={() => setEditingName(true)}
                className="group flex items-center gap-2"
              >
                <h1 className="text-2xl font-semibold font-[family-name:var(--font-heading)] text-white">
                  {list.name}
                </h1>
                <Pencil className="h-4 w-4 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </button>
            )}

            {/* Inline editable description */}
            <div className="mt-1">
              {editingDesc ? (
                <input
                  autoFocus
                  value={descValue}
                  onChange={(e) => setDescValue(e.target.value)}
                  onBlur={saveDesc}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveDesc();
                    if (e.key === "Escape") {
                      setDescValue(list.description ?? "");
                      setEditingDesc(false);
                    }
                  }}
                  placeholder="Add a description..."
                  className={cn(
                    "text-sm bg-transparent border-b border-[var(--accent-orange)]/30",
                    "text-[var(--text-secondary)] w-full focus:outline-none pb-0.5",
                    "placeholder:text-[var(--text-muted)]"
                  )}
                />
              ) : (
                <button
                  onClick={() => setEditingDesc(true)}
                  className="group flex items-center gap-1.5"
                >
                  <span className="text-sm text-[var(--text-muted)]">
                    {list.description || "Add a description..."}
                  </span>
                  <Pencil className="h-3 w-3 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </button>
              )}
            </div>
          </div>

          {/* Add members button */}
          <button
            onClick={() => setShowAddPanel(true)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 shrink-0",
              "bg-[var(--accent-indigo)]/10 text-[var(--accent-indigo)] border border-[var(--accent-indigo)]/20",
              "hover:bg-[var(--accent-indigo)]/20"
            )}
          >
            <UserPlus className="h-4 w-4" />
            Add Members
          </button>
        </div>
      </div>

      {/* Members Table */}
      <GlassCard padding={false}>
        {/* Table header row */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--glass-border)]">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-medium text-[var(--text-muted)] font-[family-name:var(--font-body)]">
              Members
              <span className="ml-1.5 tabular-nums">{items.length}</span>
            </h2>
            {selectedMemberIds.size > 0 && (
              <button
                onClick={handleBulkRemove}
                disabled={isRemoving}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all duration-200",
                  "bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20",
                  "disabled:opacity-50 disabled:cursor-not-allowed"
                )}
              >
                {isRemoving ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Trash2 className="h-3 w-3" />
                )}
                Remove {selectedMemberIds.size} selected
              </button>
            )}
          </div>
        </div>

        {isLoadingItems ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 text-[var(--text-muted)] animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="h-8 w-8 text-[var(--text-muted)] mb-3" />
            <p className="text-sm text-[var(--text-muted)]">No members yet.</p>
            <button
              onClick={() => setShowAddPanel(true)}
              className="mt-2 text-sm text-[var(--accent-indigo)] hover:underline"
            >
              Add members
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--text-muted)] border-b border-[var(--glass-border)]">
                  <th className="px-2 py-3 w-10">
                    <GlassCheckbox
                      checked={items.length > 0 && selectedMemberIds.size === items.length}
                      onChange={toggleAllMembers}
                    />
                  </th>
                  <th className="px-2 py-3 font-medium">Name</th>
                  <th className="px-2 py-3 font-medium">Email</th>
                  <th className="px-2 py-3 font-medium">Title</th>
                  <th className="px-2 py-3 font-medium">Source</th>
                  <th className="px-2 py-3 font-medium">Added</th>
                  <th className="px-2 py-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {items.map((item) => {
                  const person = item.person;
                  const isSelected = selectedMemberIds.has(item.person_id);
                  return (
                    <tr
                      key={item.id}
                      className={cn(
                        "transition-all duration-200 group",
                        isSelected
                          ? "bg-[var(--accent-orange)]/5"
                          : "hover:bg-white/[0.03]"
                      )}
                    >
                      <td className="px-2 py-3">
                        <GlassCheckbox
                          checked={isSelected}
                          onChange={() => toggleMember(item.person_id)}
                        />
                      </td>
                      <td className="px-2 py-3">
                        <Link
                          href={`/admin/persons/${item.person_id}`}
                          className="text-[var(--accent-indigo)] hover:underline font-medium"
                        >
                          {person?.full_name ?? "Unknown"}
                        </Link>
                      </td>
                      <td className="px-2 py-3 text-[var(--text-muted)]">
                        {person?.email ?? <span>&mdash;</span>}
                      </td>
                      <td className="px-2 py-3 text-[var(--text-muted)]">
                        {person?.title ?? <span>&mdash;</span>}
                      </td>
                      <td className="px-2 py-3">
                        {person?.source ? (
                          <Badge variant="default">{person.source}</Badge>
                        ) : (
                          <span className="text-[var(--text-muted)]">&mdash;</span>
                        )}
                      </td>
                      <td className="px-2 py-3 text-[var(--text-muted)] tabular-nums text-xs">
                        {new Date(item.added_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </td>
                      <td className="px-2 py-3">
                        <button
                          onClick={() => handleRemoveOne(item.person_id)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 transition-all"
                          title="Remove from list"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      {/* Add Members Modal */}
      {showAddPanel && (
        <AddMembersPanel
          listId={listId}
          existingPersonIds={existingPersonIds}
          onClose={() => setShowAddPanel(false)}
          onAdded={async () => {
            setShowAddPanel(false);
            await loadItems();
            onListUpdated();
          }}
        />
      )}
    </div>
  );
}

// ─── Page Root ────────────────────────────────────────────────────────────────

export default function ListsPage() {
  const [lists, setLists] = useState<PersonList[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);

  const loadLists = useCallback(async () => {
    const result = await getLists();
    setLists(result.data as PersonList[]);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadLists();
  }, [loadLists]);

  async function handleDelete(id: string, name: string) {
    const confirmed = window.confirm(
      `Delete list "${name}"? This will also remove all members from the list.`
    );
    if (!confirmed) return;
    await deleteList(id);
    // If we were viewing the deleted list, go back to index
    if (selectedListId === id) setSelectedListId(null);
    await loadLists();
  }

  function handleNewCreated(id: string) {
    setShowNewModal(false);
    loadLists().then(() => setSelectedListId(id));
  }

  // Detail view
  if (selectedListId !== null) {
    return (
      <>
        <ListDetail
          listId={selectedListId}
          allLists={lists}
          onBack={() => setSelectedListId(null)}
          onListUpdated={loadLists}
        />
        {showNewModal && (
          <NewListModal
            onClose={() => setShowNewModal(false)}
            onCreate={handleNewCreated}
          />
        )}
      </>
    );
  }

  // Index view
  return (
    <>
      <ListsIndex
        lists={lists}
        isLoading={isLoading}
        onSelect={setSelectedListId}
        onNew={() => setShowNewModal(true)}
        onDelete={handleDelete}
      />
      {showNewModal && (
        <NewListModal
          onClose={() => setShowNewModal(false)}
          onCreate={handleNewCreated}
        />
      )}
    </>
  );
}
