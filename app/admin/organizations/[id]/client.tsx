"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { createClient } from "@/lib/supabase/client";
import { Check, Loader2 } from "lucide-react";

interface OrgDetailClientProps {
  orgId: string;
  initialNotes: string;
}

export function OrgDetailClient({ orgId, initialNotes }: OrgDetailClientProps) {
  const [notes, setNotes] = useState(initialNotes);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const supabase = useRef(createClient());

  const saveNotes = useCallback(
    async (value: string) => {
      setSaveStatus("saving");
      const { error } = await supabase.current
        .from("organizations")
        .update({ notes: value })
        .eq("id", orgId);
      setSaveStatus(error ? "idle" : "saved");
      if (!error) {
        setTimeout(() => setSaveStatus("idle"), 2000);
      }
    },
    [orgId]
  );

  const handleChange = useCallback(
    (value: string) => {
      setNotes(value);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => saveNotes(value), 1000);
    },
    [saveNotes]
  );

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <GlassCard>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-white">Notes</h3>
        {saveStatus === "saving" && (
          <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
            <Loader2 className="w-3 h-3 animate-spin" /> Saving...
          </span>
        )}
        {saveStatus === "saved" && (
          <span className="flex items-center gap-1 text-xs text-emerald-400">
            <Check className="w-3 h-3" /> Saved
          </span>
        )}
      </div>
      <textarea
        value={notes}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={() => {
          if (notes !== initialNotes) saveNotes(notes);
        }}
        placeholder="Add notes about this organization..."
        className="w-full h-24 bg-transparent border border-[var(--glass-border)] rounded-lg p-3 text-sm text-[var(--text-secondary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-orange)]/50 resize-none"
      />
    </GlassCard>
  );
}
