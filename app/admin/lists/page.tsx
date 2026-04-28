"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { cn } from "@/lib/utils";
import {
  Plus, Trash2, Users, Loader2, X, ChevronRight,
} from "lucide-react";
import { getLists, createList, deleteList } from "./actions";

interface PersonList {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  filter_rules: unknown | null;
  person_list_items: { count: number }[];
}

function NewListModal({
  onClose, onCreate,
}: { onClose: () => void; onCreate: (id: string) => void }) {
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative glass rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">New List</h2>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1.5">
              Name <span className="text-red-400">*</span>
            </label>
            <GlassInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") onClose(); }}
              placeholder="e.g. EthCC Tier 1 Speakers"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
              placeholder="Optional description..."
              rows={3}
              className={cn(
                "w-full rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)]",
                "backdrop-blur-xl text-white placeholder:text-[var(--text-muted)]",
                "px-3 py-2 text-sm transition-all duration-200 resize-none",
                "focus:outline-none focus:ring-2 focus:ring-[var(--accent-orange)]/40",
              )}
            />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm text-[var(--text-muted)] hover:text-white">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || isCreating}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[var(--accent-orange)] text-white hover:bg-[var(--accent-orange)]/90 disabled:opacity-50"
          >
            {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create List
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ListsPage() {
  const router = useRouter();
  const [lists, setLists] = useState<PersonList[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);

  const loadLists = useCallback(async () => {
    const result = await getLists();
    setLists(result.data as PersonList[]);
    setIsLoading(false);
  }, []);

  useEffect(() => { loadLists(); }, [loadLists]);

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete list "${name}"? This will also remove all members from the list.`)) return;
    await deleteList(id);
    await loadLists();
  }

  function handleNewCreated(id: string) {
    setShowNewModal(false);
    router.push(`/admin/lists/${id}`);
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-end">
          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border border-[var(--accent-orange)]/20 hover:bg-[var(--accent-orange)]/25"
          >
            <Plus className="h-4 w-4" />
            New List
          </button>
        </div>

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
              <button onClick={() => setShowNewModal(true)} className="mt-3 text-sm text-[var(--accent-indigo)] hover:underline">
                Create your first list
              </button>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {lists.map((list) => {
                const count = list.person_list_items?.[0]?.count ?? 0;
                const hasFilter = list.filter_rules !== null;
                return (
                  <div
                    key={list.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => router.push(`/admin/lists/${list.id}`)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") router.push(`/admin/lists/${list.id}`); }}
                    className="w-full flex items-center gap-4 px-5 py-4 hover:bg-white/[0.04] transition-all duration-200 text-left group cursor-pointer"
                  >
                    <div className="h-9 w-9 rounded-lg bg-[var(--accent-orange)]/10 flex items-center justify-center shrink-0">
                      <Users className="h-4 w-4 text-[var(--accent-orange)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium text-sm block truncate">{list.name}</span>
                        {hasFilter && (
                          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-[var(--accent-indigo)]/10 text-[var(--accent-indigo)] border border-[var(--accent-indigo)]/20">
                            saved filter
                          </span>
                        )}
                      </div>
                      {list.description && (
                        <span className="text-[var(--text-muted)] text-xs truncate block">{list.description}</span>
                      )}
                    </div>
                    <span className="text-xs text-[var(--text-muted)] tabular-nums shrink-0">
                      {count} {count === 1 ? "person" : "persons"}
                    </span>
                    <span className="text-xs text-[var(--text-muted)] shrink-0">
                      {new Date(list.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(list.id, list.name); }}
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

      {showNewModal && (
        <NewListModal onClose={() => setShowNewModal(false)} onCreate={handleNewCreated} />
      )}
    </>
  );
}
