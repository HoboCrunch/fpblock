"use client";

import { useState, useTransition } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ChevronUp, ChevronDown, Plus, Save, Trash2 } from "lucide-react";
import type { SequenceStep } from "@/lib/types/database";
import { updateSequenceSteps } from "@/app/admin/sequences/actions";
import { ComposableTemplateEditor } from "./composable-template-editor";

const ACTION_TYPE_OPTIONS = [
  { value: "initial", label: "Initial" },
  { value: "follow_up", label: "Follow Up" },
  { value: "break_up", label: "Break Up" },
];

const actionVariant: Record<string, string> = {
  initial: "glass-orange",
  follow_up: "glass-indigo",
  break_up: "bounced",
};

interface StepEditorProps {
  sequenceId: string;
  initialSteps: SequenceStep[];
  channel?: string;
  stepStats?: Record<number, { sent: number; opened: number; replied: number }>;
}

export function StepEditor({
  sequenceId,
  initialSteps,
  channel,
  stepStats,
}: StepEditorProps) {
  const [steps, setSteps] = useState<SequenceStep[]>(initialSteps);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function updateStep(index: number, updates: Partial<SequenceStep>) {
    setSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...updates } : s))
    );
    setSaved(false);
  }

  function addStep() {
    setSteps((prev) => [
      ...prev,
      {
        step_number: prev.length + 1,
        delay_days: prev.length === 0 ? 0 : 3,
        action_type: prev.length === 0 ? "initial" : "follow_up",
        subject_template: { blocks: [{ type: "text" as const, content: "" }] },
        body_template: { blocks: [{ type: "text" as const, content: "" }] },
      },
    ]);
    setSaved(false);
  }

  function removeStep(index: number) {
    setSteps((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((s, i) => ({ ...s, step_number: i + 1 }))
    );
    setSaved(false);
  }

  function moveStep(index: number, direction: "up" | "down") {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= steps.length) return;
    setSteps((prev) => {
      const next = [...prev];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next.map((s, i) => ({ ...s, step_number: i + 1 }));
    });
    setSaved(false);
  }

  function handleSave() {
    startTransition(async () => {
      const result = await updateSequenceSteps(sequenceId, steps);
      if (result.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold font-[family-name:var(--font-heading)] text-white">
          Steps
        </h2>
        <button
          onClick={handleSave}
          disabled={isPending}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
            saved
              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
              : "bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border border-[var(--accent-orange)]/20 hover:bg-[var(--accent-orange)]/25",
            isPending && "opacity-50 cursor-not-allowed"
          )}
        >
          <Save className="h-4 w-4" />
          {isPending ? "Saving..." : saved ? "Saved!" : "Save Steps"}
        </button>
      </div>

      {/* Vertical timeline */}
      <div className="relative">
        {/* Timeline line */}
        {steps.length > 1 && (
          <div className="absolute left-6 top-8 bottom-8 w-px bg-[var(--glass-border)]" />
        )}

        <div className="space-y-4">
          {steps.map((step, index) => {
            const stats = stepStats?.[step.step_number];
            const openedPct =
              stats && stats.sent > 0
                ? Math.round((stats.opened / stats.sent) * 100)
                : 0;
            const repliedPct =
              stats && stats.sent > 0
                ? Math.round((stats.replied / stats.sent) * 100)
                : 0;

            return (
              <div key={`step-${step.step_number}`} className="relative">
                {/* Step number circle */}
                <div className="absolute left-3 top-5 w-7 h-7 rounded-full bg-[var(--glass-bg)] border border-[var(--glass-border)] flex items-center justify-center z-10">
                  <span className="text-xs text-white font-medium">
                    {step.step_number}
                  </span>
                </div>

                <GlassCard className="ml-14 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant={actionVariant[step.action_type] ?? "default"}>
                        {step.action_type.replace("_", " ")}
                      </Badge>
                      <span className="text-xs text-[var(--text-muted)]">
                        {index === 0 ? "Day 0" : `+${step.delay_days} days`}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {index > 0 && (
                        <button
                          onClick={() => moveStep(index, "up")}
                          className="text-[var(--text-muted)] hover:text-white transition-colors p-1"
                          title="Move up"
                        >
                          <ChevronUp className="h-4 w-4" />
                        </button>
                      )}
                      {index < steps.length - 1 && (
                        <button
                          onClick={() => moveStep(index, "down")}
                          className="text-[var(--text-muted)] hover:text-white transition-colors p-1"
                          title="Move down"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => removeStep(index)}
                        className="text-[var(--text-muted)] hover:text-red-400 transition-colors p-1"
                        title="Delete step"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-[var(--text-muted)] mb-1 block">
                        Delay (days)
                      </label>
                      <GlassInput
                        type="number"
                        min={0}
                        value={step.delay_days}
                        onChange={(e) =>
                          updateStep(index, {
                            delay_days: parseInt(e.target.value) || 0,
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--text-muted)] mb-1 block">
                        Action Type
                      </label>
                      <GlassSelect
                        options={ACTION_TYPE_OPTIONS}
                        value={step.action_type}
                        onChange={(e) =>
                          updateStep(index, {
                            action_type: e.target.value as SequenceStep["action_type"],
                          })
                        }
                      />
                    </div>
                  </div>

                  {channel === "email" && (
                    <div>
                      <label className="text-xs text-[var(--text-muted)] mb-1 block">
                        Subject Template
                      </label>
                      <ComposableTemplateEditor
                        value={step.subject_template}
                        onChange={(template) =>
                          updateStep(index, { ...step, subject_template: template })
                        }
                        placeholder="Email subject..."
                        singleLine={true}
                      />
                    </div>
                  )}

                  <div>
                    <label className="text-xs text-[var(--text-muted)] mb-1 block">
                      Body Template
                    </label>
                    <ComposableTemplateEditor
                      value={step.body_template}
                      onChange={(template) =>
                        updateStep(index, { ...step, body_template: template })
                      }
                      placeholder="Message body..."
                    />
                  </div>

                  {stats && (
                    <div className="text-xs text-[var(--text-muted)] mt-2">
                      {stats.sent} sent · {stats.opened} opened ({openedPct}%) · {stats.replied} replied ({repliedPct}%)
                    </div>
                  )}
                </GlassCard>
              </div>
            );
          })}
        </div>
      </div>

      <button
        onClick={addStep}
        className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-[var(--glass-border)] text-[var(--text-muted)] hover:text-white hover:border-[var(--accent-orange)]/40 transition-all duration-200"
      >
        <Plus className="h-4 w-4" />
        Add Step
      </button>
    </div>
  );
}
