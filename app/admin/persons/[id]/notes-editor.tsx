"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Check, Loader2 } from "lucide-react";

interface PersonNotesEditorProps {
  personId: string;
  initialNotes: string;
}

export function PersonNotesEditor({ personId, initialNotes }: PersonNotesEditorProps) {
  const [notes, setNotes] = useState(initialNotes);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef(initialNotes);

  const save = useCallback(
    async (value: string) => {
      if (value === lastSavedRef.current) return;
      setSaveState("saving");
      try {
        const supabase = createClient();
        await supabase
          .from("persons")
          .update({ notes: value || null })
          .eq("id", personId);
        lastSavedRef.current = value;
        setSaveState("saved");
        setTimeout(() => setSaveState("idle"), 2000);
      } catch {
        setSaveState("idle");
      }
    },
    [personId]
  );

  const debouncedSave = useCallback(
    (value: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => save(value), 1000);
    },
    [save]
  );

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div className="relative">
      <textarea
        value={notes}
        onChange={(e) => {
          setNotes(e.target.value);
          debouncedSave(e.target.value);
        }}
        onBlur={() => {
          if (timerRef.current) clearTimeout(timerRef.current);
          save(notes);
        }}
        placeholder="Add notes about this person..."
        rows={4}
        className="w-full rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] backdrop-blur-xl text-white placeholder:text-[var(--text-muted)] px-3 py-2 text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--accent-orange)]/40 focus:border-[var(--accent-orange)]/50 hover:bg-[var(--glass-bg-hover)] hover:border-[var(--glass-border-hover)] resize-y"
      />
      {/* Save indicator */}
      {saveState !== "idle" && (
        <div className="absolute bottom-3 right-3 flex items-center gap-1">
          {saveState === "saving" && (
            <Loader2 className="w-3 h-3 text-[var(--text-muted)] animate-spin" />
          )}
          {saveState === "saved" && (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-[10px] text-emerald-400">Saved</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
