"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Check, Plus, Loader2, ListPlus, ChevronDown } from "lucide-react";
import { GlassInput } from "@/components/ui/glass-input";
import { getLists, createList, addToList } from "@/app/admin/lists/actions";

interface AddToListDropdownProps {
  personIds: string[];
  onSuccess?: () => void;
}

type ListItem = {
  id: string;
  name: string;
  person_list_items: { count: number }[];
};

export function AddToListDropdown({ personIds, onSuccess }: AddToListDropdownProps) {
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  // Fetch lists when panel opens
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getLists().then(({ data }) => {
      setLists((data ?? []) as ListItem[]);
      setLoading(false);
    });
  }, [open]);

  const handleAdd = useCallback(
    async (listId: string) => {
      setAdding(listId);
      const { success: ok } = await addToList(listId, personIds);
      setAdding(null);
      if (ok) {
        setSuccess(listId);
        onSuccess?.();
        setTimeout(() => {
          setSuccess(null);
          setOpen(false);
        }, 800);
      }
    },
    [personIds, onSuccess]
  );

  const handleCreate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = newName.trim();
      if (!trimmed) return;
      setCreating(true);
      const { data } = await createList(trimmed);
      if (data?.id) {
        await handleAdd(data.id);
      }
      setCreating(false);
      setNewName("");
    },
    [newName, handleAdd]
  );

  return (
    <div>
      {/* Trigger */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border border-[var(--accent-orange)]/20 hover:bg-[var(--accent-orange)]/25 whitespace-nowrap transition-colors"
      >
        <ListPlus className="h-3.5 w-3.5" />
        Add to List
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Inline expandable panel */}
      {open && (
        <div className="mt-2 glass rounded-lg p-2 space-y-1">
          {/* Existing lists */}
          {loading ? (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="h-4 w-4 animate-spin text-[var(--text-muted)]" />
            </div>
          ) : lists.length > 0 ? (
            <div className="max-h-[180px] overflow-y-auto scrollbar-thin space-y-0.5">
              {lists.map((list) => {
                const count = list.person_list_items?.[0]?.count ?? 0;
                const isAdding = adding === list.id;
                const isSuccess = success === list.id;

                return (
                  <button
                    key={list.id}
                    onClick={() => handleAdd(list.id)}
                    disabled={!!adding || !!success}
                    className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-xs text-white hover:bg-white/5 transition-colors disabled:opacity-50"
                  >
                    <span className="truncate">{list.name}</span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      {isAdding ? (
                        <Loader2 className="h-3 w-3 animate-spin text-[var(--accent-orange)]" />
                      ) : isSuccess ? (
                        <Check className="h-3 w-3 text-emerald-400" />
                      ) : (
                        <span className="text-[var(--text-muted)]">{count}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-[var(--text-muted)] px-2 py-1.5">No lists yet</p>
          )}

          {/* Divider */}
          <div className="border-t border-[var(--glass-border)] !my-1.5" />

          {/* Create new */}
          <form onSubmit={handleCreate} className="flex items-center gap-1.5">
            <GlassInput
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New list name..."
              className="!py-1 !px-2 !text-xs flex-1 min-w-0"
            />
            <button
              type="submit"
              disabled={!newName.trim() || creating}
              className="shrink-0 p-1 rounded-md bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] hover:bg-[var(--accent-orange)]/25 disabled:opacity-40 transition-colors"
            >
              {creating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
