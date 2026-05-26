"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ListPlus, X, Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassInput } from "@/components/ui/glass-input";
import { createList, addToList } from "@/app/admin/lists/actions";

export function CreateListButton({
  personIds,
  defaultName,
}: {
  personIds: string[];
  defaultName: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const disabled = personIds.length === 0;

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        disabled={disabled}
        title={disabled ? "No people in this view" : undefined}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border border-[var(--accent-orange)]/20 hover:bg-[var(--accent-orange)]/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <ListPlus className="h-3.5 w-3.5" />
        Create list
      </button>
      {isOpen && (
        <CreateListModal
          personIds={personIds}
          defaultName={defaultName}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}

function CreateListModal({
  personIds,
  defaultName,
  onClose,
}: {
  personIds: string[];
  defaultName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(defaultName);
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
    await addToList(result.data.id, personIds);
    router.push(`/admin/lists/${result.data.id}`);
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
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
                if (e.key === "Escape") onClose();
              }}
              placeholder="e.g. EthCC Tier 1 Speakers"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") onClose();
              }}
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
          <p className="text-xs text-[var(--text-muted)]">
            {personIds.length} {personIds.length === 1 ? "person" : "people"} from this view will be added.
          </p>
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
