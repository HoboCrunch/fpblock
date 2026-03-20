"use client";

import { useState, useTransition } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Plus, Save, Trash2 } from "lucide-react";
import type { SequenceStep } from "@/lib/types/database";
import { updateSequenceSteps } from "@/app/admin/sequences/actions";

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
  channel: string;
}

export function StepEditor({
  sequenceId,
  initialSteps,
  channel,
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
    const nextNumber = steps.length + 1;
    setSteps((prev) => [
      ...prev,
      {
        step_number: nextNumber,
        delay_days: nextNumber === 1 ? 0 : 3,
        action_type: nextNumber === 1 ? "initial" : "follow_up",
        subject_template: channel === "email" ? "" : null,
        body_template: "",
        prompt_template_id: null,
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
          {steps.map((step, index) => (
            <div key={index} className="relative">
              {/* Step number circle */}
              <div className="absolute left-3 top-5 w-7 h-7 rounded-full bg-[var(--glass-bg)] border border-[var(--glass-border)] flex items-center justify-center z-10">
                <span className="text-xs text-white font-medium">
                  {step.step_number}
                </span>
              </div>

              <GlassCard className="ml-14 space-y-3">
                <div className="flex items-center justify-between">
                  <Badge variant={actionVariant[step.action_type] ?? "default"}>
                    {step.action_type.replace("_", " ")}
                  </Badge>
                  <button
                    onClick={() => removeStep(index)}
                    className="text-[var(--text-muted)] hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
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
                    <GlassInput
                      value={step.subject_template ?? ""}
                      onChange={(e) =>
                        updateStep(index, {
                          subject_template: e.target.value,
                        })
                      }
                      placeholder="Hey {first_name}"
                    />
                  </div>
                )}

                <div>
                  <label className="text-xs text-[var(--text-muted)] mb-1 block">
                    Body Template
                  </label>
                  <textarea
                    value={step.body_template}
                    onChange={(e) =>
                      updateStep(index, { body_template: e.target.value })
                    }
                    rows={3}
                    placeholder="Hi {first_name}, ..."
                    className={cn(
                      "w-full rounded-lg font-[family-name:var(--font-body)]",
                      "bg-[var(--glass-bg)] border border-[var(--glass-border)]",
                      "backdrop-blur-xl text-white placeholder:text-[var(--text-muted)]",
                      "px-3 py-2 text-sm transition-all duration-200 resize-y",
                      "focus:outline-none focus:ring-2 focus:ring-[var(--accent-orange)]/40 focus:border-[var(--accent-orange)]/50",
                      "hover:bg-[var(--glass-bg-hover)] hover:border-[var(--glass-border-hover)]"
                    )}
                  />
                </div>
              </GlassCard>
            </div>
          ))}
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
