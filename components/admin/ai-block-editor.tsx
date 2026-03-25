"use client";

import { Sparkles, Trash2 } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { VariablePicker } from "./variable-picker";
import type { TemplateBlock } from "@/lib/types/database";

type AiBlock = Extract<TemplateBlock, { type: "ai" }>;

interface AiBlockEditorProps {
  block: AiBlock;
  onChange: (block: AiBlock) => void;
  onDelete: () => void;
}

export function AiBlockEditor({ block, onChange, onDelete }: AiBlockEditorProps) {
  function update(partial: Partial<AiBlock>) {
    onChange({ ...block, ...partial });
  }

  return (
    <GlassCard className="border border-[var(--accent-orange)]/20 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-[var(--accent-orange)] shrink-0" />
        <span className="text-sm font-medium text-white">AI Generate</span>
        <div className="flex-1" />
        <VariablePicker
          onSelect={(variable) =>
            update({ prompt: block.prompt + variable })
          }
        />
        <button
          onClick={onDelete}
          className="p-1 rounded hover:bg-white/[0.05] text-[var(--text-muted)] hover:text-red-400 transition-colors"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Prompt */}
      <div>
        <label className="text-xs text-[var(--text-muted)] mb-1 block">Prompt</label>
        <textarea
          rows={3}
          value={block.prompt}
          onChange={(e) => update({ prompt: e.target.value })}
          placeholder="Write a 2-sentence personalized hook about {person.full_name}..."
          className="w-full bg-white/[0.03] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--text-muted)] outline-none border border-white/[0.06] focus:border-[var(--accent-orange)]/30 resize-y"
        />
      </div>

      {/* Max words + Tone */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-[var(--text-muted)] mb-1 block">Max words</label>
          <GlassInput
            type="number"
            min={1}
            value={block.max_tokens ?? ""}
            onChange={(e) =>
              update({ max_tokens: e.target.value ? parseInt(e.target.value) : undefined })
            }
          />
        </div>
        <div>
          <label className="text-xs text-[var(--text-muted)] mb-1 block">Tone override</label>
          <GlassInput
            value={block.tone ?? ""}
            onChange={(e) =>
              update({ tone: e.target.value || undefined })
            }
            placeholder="casual, professional..."
          />
        </div>
      </div>
    </GlassCard>
  );
}
