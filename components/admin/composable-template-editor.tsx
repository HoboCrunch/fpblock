"use client";
import { useRef, useState, useCallback } from "react";
import { Plus, Sparkles, Type, X } from "lucide-react";
import { VariablePicker } from "./variable-picker";
import { AiBlockEditor } from "./ai-block-editor";
import type { ComposableTemplate, TemplateBlock } from "@/lib/types/database";

type AiBlock = Extract<TemplateBlock, { type: "ai" }>;
type TextBlock = Extract<TemplateBlock, { type: "text" }>;

interface ComposableTemplateEditorProps {
  value: ComposableTemplate | null;
  onChange: (template: ComposableTemplate) => void;
  placeholder?: string;
  singleLine?: boolean;
}

const EMPTY_TEXT_BLOCK: TextBlock = { type: "text", content: "" };

function initBlocks(value: ComposableTemplate | null): TemplateBlock[] {
  if (!value || value.blocks.length === 0) return [{ ...EMPTY_TEXT_BLOCK }];
  return value.blocks;
}

export function ComposableTemplateEditor({
  value,
  onChange,
  placeholder,
  singleLine = false,
}: ComposableTemplateEditorProps) {
  const blocks = initBlocks(value);
  const blockIdsRef = useRef<string[]>([]);

  if (blockIdsRef.current.length !== blocks.length) {
    blockIdsRef.current = blocks.map(
      (_, i) => blockIdsRef.current[i] || crypto.randomUUID()
    );
  }

  // Track inline variable picker state per block
  const [inlinePicker, setInlinePicker] = useState<{ index: number; pos: { top: number; left: number } } | null>(null);
  const textareaRefs = useRef<(HTMLTextAreaElement | HTMLInputElement | null)[]>([]);

  function emit(newBlocks: TemplateBlock[]) {
    const safe = newBlocks.length === 0 ? [{ ...EMPTY_TEXT_BLOCK }] : newBlocks;
    onChange({ blocks: safe });
  }

  function updateBlock(index: number, updated: TemplateBlock) {
    const next = blocks.map((b, i) => (i === index ? updated : b));
    emit(next);
  }

  function deleteBlock(index: number) {
    const next = blocks.filter((_, i) => i !== index);
    emit(next);
    blockIdsRef.current.splice(index, 1);
  }

  function addTextBlock() {
    blockIdsRef.current.push(crypto.randomUUID());
    emit([...blocks, { type: "text", content: "" }]);
  }

  function addAiBlock() {
    blockIdsRef.current.push(crypto.randomUUID());
    emit([...blocks, { type: "ai", prompt: "" }]);
  }

  const insertVariable = useCallback(
    (index: number, variable: string) => {
      const el = textareaRefs.current[index];
      const block = blocks[index];
      if (!block || block.type !== "text") return;

      const start = el?.selectionStart ?? block.content.length;
      const end = el?.selectionEnd ?? block.content.length;
      const newContent =
        block.content.slice(0, start) + variable + block.content.slice(end);
      updateBlock(index, { type: "text", content: newContent });

      // Restore cursor after React re-render
      requestAnimationFrame(() => {
        const ref = textareaRefs.current[index];
        if (ref) {
          const pos = start + variable.length;
          ref.setSelectionRange(pos, pos);
          ref.focus();
        }
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [blocks]
  );

  function handleTextKeyDown(
    e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>,
    index: number
  ) {
    if (e.key === "{") {
      const el = e.currentTarget;
      const rect = el.getBoundingClientRect();
      const containerRect = el.closest(".composable-editor-root")?.getBoundingClientRect();
      setInlinePicker({
        index,
        pos: {
          top: rect.bottom - (containerRect?.top ?? 0) + 4,
          left: rect.left - (containerRect?.left ?? 0),
        },
      });
    } else {
      setInlinePicker(null);
    }
  }

  const inputClass =
    "w-full bg-white/[0.03] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[var(--text-muted)] outline-none border border-white/[0.06] focus:border-white/[0.12]";

  return (
    <div className="composable-editor-root space-y-2 relative">
      {blocks.map((block, i) => {
        const key = blockIdsRef.current[i];

        if (block.type === "text") {
          return (
            <div key={key} className="relative group">
              {/* Variable picker button — top-right */}
              <div className="absolute top-1.5 right-1.5 z-10 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                <VariablePicker
                  onSelect={(variable) => insertVariable(i, variable)}
                />
              </div>

              {singleLine ? (
                <input
                  ref={(el) => { textareaRefs.current[i] = el; }}
                  type="text"
                  value={block.content}
                  onChange={(e) =>
                    updateBlock(i, { type: "text", content: e.target.value })
                  }
                  onKeyDown={(e) => handleTextKeyDown(e, i)}
                  placeholder={placeholder}
                  className={inputClass + " pr-28"}
                />
              ) : (
                <textarea
                  ref={(el) => { textareaRefs.current[i] = el as HTMLTextAreaElement; }}
                  rows={4}
                  value={block.content}
                  onChange={(e) =>
                    updateBlock(i, { type: "text", content: e.target.value })
                  }
                  onKeyDown={(e) => handleTextKeyDown(e, i)}
                  placeholder={placeholder}
                  className={inputClass + " resize-y pr-28"}
                />
              )}

              {/* Delete button for text blocks (only when multiple blocks) */}
              {blocks.length > 1 && (
                <button
                  type="button"
                  onClick={() => deleteBlock(i)}
                  className="absolute top-1.5 right-20 z-10 p-1 rounded hover:bg-white/[0.05] text-[var(--text-muted)] hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}

              {/* Inline variable picker */}
              {inlinePicker?.index === i && (
                <VariablePicker
                  trigger="inline"
                  position={inlinePicker.pos}
                  onSelect={(variable) => {
                    insertVariable(i, variable);
                    setInlinePicker(null);
                  }}
                  onClose={() => setInlinePicker(null)}
                />
              )}
            </div>
          );
        }

        // AI block
        return (
          <AiBlockEditor
            key={key}
            block={block as AiBlock}
            onChange={(updated) => updateBlock(i, updated)}
            onDelete={() => deleteBlock(i)}
          />
        );
      })}

      {/* Add buttons */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={addTextBlock}
          className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded glass hover:bg-white/[0.05] text-[var(--text-secondary)] transition-colors"
        >
          <Type className="h-3.5 w-3.5" />
          Add Text
        </button>
        {!singleLine && (
          <button
            type="button"
            onClick={addAiBlock}
            className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded glass hover:bg-white/[0.05] text-[var(--accent-orange)] transition-colors"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Add AI Block
          </button>
        )}
      </div>
    </div>
  );
}
