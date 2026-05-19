"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { SequenceParametersPanel } from "./sequence-parameters-panel";
import type { SequenceSchedule, SenderProfile } from "@/lib/types/database";

interface Props {
  open: boolean;
  onClose: () => void;
  sendMode: "auto" | "approval";
  senderId: string | null;
  senderProfiles: Pick<SenderProfile, "id" | "name" | "email">[];
  scheduleConfig: SequenceSchedule;
  onSendModeChange: (mode: "auto" | "approval") => void;
  onSenderChange: (senderId: string | null) => void;
  onScheduleChange: (config: SequenceSchedule) => void;
}

/**
 * Slide-over sheet that hosts the full sequence-level configuration.
 * Keeps the detail page focused on step composition by tucking advanced
 * parameters behind a single entry point.
 */
export function SequenceSettingsSheet({
  open,
  onClose,
  sendMode,
  senderId,
  senderProfiles,
  scheduleConfig,
  onSendModeChange,
  onSenderChange,
  onScheduleChange,
}: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-label="Sequence settings"
        className="absolute right-0 top-0 h-full w-full max-w-md bg-[#0d0d11] border-l border-[var(--glass-border)] shadow-2xl flex flex-col"
      >
        <header className="flex items-start justify-between gap-3 px-6 py-5 border-b border-[var(--glass-border)]">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)]">
              Sequence
            </p>
            <h2 className="text-base font-semibold text-white font-[family-name:var(--font-heading)] mt-0.5">
              Configuration
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-white transition-colors"
            aria-label="Close settings"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-6 scrollbar-thin">
          <SequenceParametersPanel
            sendMode={sendMode}
            senderId={senderId}
            senderProfiles={senderProfiles}
            scheduleConfig={scheduleConfig}
            onSendModeChange={onSendModeChange}
            onSenderChange={onSenderChange}
            onScheduleChange={onScheduleChange}
          />
        </div>
      </aside>
    </div>
  );
}
