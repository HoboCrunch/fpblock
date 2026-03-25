"use client";

import { useState, useEffect } from "react";
import { X, Loader2, AlertTriangle } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassSelect } from "@/components/ui/glass-select";

interface MessagePreviewModalProps {
  sequenceId: string;
  stepIndex: number;
  enrollments: { person_id: string; person_name: string }[];
  onClose: () => void;
}

interface PreviewResult {
  subject: string;
  body: string;
  hasSender: boolean;
}

export function MessagePreviewModal({
  sequenceId,
  stepIndex,
  enrollments,
  onClose,
}: MessagePreviewModalProps) {
  const [selectedPersonId, setSelectedPersonId] = useState<string>("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const personOptions = enrollments.map((e) => ({
    value: e.person_id,
    label: e.person_name,
  }));

  useEffect(() => {
    if (!selectedPersonId) return;

    let cancelled = false;

    async function fetchPreview() {
      setLoading(true);
      setError(null);
      setPreview(null);

      try {
        const res = await fetch(`/api/sequences/${sequenceId}/preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stepIndex, personId: selectedPersonId }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Request failed (${res.status})`);
        }

        const data: PreviewResult = await res.json();
        if (!cancelled) setPreview(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchPreview();
    return () => { cancelled = true; };
  }, [selectedPersonId, sequenceId, stepIndex]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl">
        <GlassCard className="relative">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-white">
              Message Preview — Step {stepIndex + 1}
            </h2>
            <button
              onClick={onClose}
              className="text-[var(--text-muted)] hover:text-white transition-colors"
              aria-label="Close preview"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Person selector */}
          <div className="mb-4">
            <label className="block text-xs text-[var(--text-muted)] mb-1.5">
              Preview for
            </label>
            <GlassSelect
              options={personOptions}
              placeholder="Select a person..."
              value={selectedPersonId}
              onChange={(e) => setSelectedPersonId(e.target.value)}
            />
          </div>

          {/* Content area */}
          {!selectedPersonId && (
            <p className="text-sm text-[var(--text-muted)] text-center py-8">
              Select a person to preview the rendered message.
            </p>
          )}

          {selectedPersonId && loading && (
            <div className="flex items-center justify-center py-10 gap-2 text-[var(--text-muted)]">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Generating preview…</span>
            </div>
          )}

          {selectedPersonId && error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/30 p-3">
              <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {preview && !loading && (
            <div className="space-y-3">
              {/* No sender warning */}
              {!preview.hasSender && (
                <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 p-3">
                  <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-amber-300">
                    Configure a sender profile to preview sender variables.
                  </p>
                </div>
              )}

              {/* Subject */}
              {preview.subject && (
                <div className="rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] p-3">
                  <p className="text-xs text-[var(--text-muted)] mb-1">Subject</p>
                  <p className="text-sm font-semibold text-white">{preview.subject}</p>
                </div>
              )}

              {/* Body */}
              <div className="rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] p-3">
                <p className="text-xs text-[var(--text-muted)] mb-1">Body</p>
                <pre className="text-sm text-[var(--text-primary)] whitespace-pre-wrap font-[family-name:var(--font-body)]">
                  {preview.body}
                </pre>
              </div>
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
