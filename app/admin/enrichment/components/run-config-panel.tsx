"use client";

import React from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { cn } from "@/lib/utils";
import {
  Sparkles,
  Search,
  FlaskConical,
  Brain,
  Users,
  Mail,
  Linkedin,
  Twitter,
  Phone,
  Play,
  Square,
  type LucideIcon,
} from "lucide-react";

export type OrgStage = "apollo" | "perplexity" | "gemini" | "full" | "people_finder";
export type EnrichField = "email" | "linkedin" | "twitter" | "phone";
export interface RunConfigPanelProps {
  tab: "persons" | "organizations";
  // Org config
  stages: OrgStage[];
  onStagesChange: (stages: OrgStage[]) => void;
  // Person config
  personFields: EnrichField[];
  onPersonFieldsChange: (fields: EnrichField[]) => void;
  // People Finder settings
  pfPerCompany: number;
  onPfPerCompanyChange: (n: number) => void;
  pfSeniorities: string[];
  onPfSenioritiesChange: (s: string[]) => void;
  pfDepartments: string[];
  onPfDepartmentsChange: (d: string[]) => void;
  // Selection info
  selectedCount: number;
  // Run state
  isRunning: boolean;
  canRun: boolean;
  onRun: () => void;
  onStop: () => void;
}

// ---------- constants ----------

const STAGE_OPTIONS: {
  key: OrgStage;
  label: string;
  icon: LucideIcon;
  description: string;
}[] = [
  { key: "full", label: "Full Pipeline", icon: Sparkles, description: "Apollo + Perplexity + Gemini" },
  { key: "apollo", label: "Apollo", icon: Search, description: "Firmographics" },
  { key: "perplexity", label: "Perplexity", icon: FlaskConical, description: "Deep research" },
  { key: "gemini", label: "Gemini", icon: Brain, description: "Synthesis + ICP" },
  { key: "people_finder", label: "People Finder", icon: Users, description: "Contact discovery" },
];

const FIELD_OPTIONS: { key: EnrichField; label: string; icon: LucideIcon }[] = [
  { key: "email", label: "Email", icon: Mail },
  { key: "linkedin", label: "LinkedIn", icon: Linkedin },
  { key: "twitter", label: "Twitter", icon: Twitter },
  { key: "phone", label: "Phone", icon: Phone },
];

const SENIORITY_OPTIONS = [
  "Owner",
  "Founder",
  "C-Suite",
  "Partner",
  "VP",
  "Director",
  "Manager",
  "Senior",
  "Entry",
];

const DEPARTMENT_OPTIONS = [
  "Executive",
  "Engineering",
  "Sales",
  "Marketing",
  "Finance",
  "Operations",
  "Product",
  "Legal",
  "HR",
];

const INDIVIDUAL_STAGES: OrgStage[] = ["apollo", "perplexity", "gemini"];

// ---------- component ----------

export const RunConfigPanel = React.memo(function RunConfigPanel({
  tab,
  stages,
  onStagesChange,
  personFields,
  onPersonFieldsChange,
  pfPerCompany,
  onPfPerCompanyChange,
  pfSeniorities,
  onPfSenioritiesChange,
  pfDepartments,
  onPfDepartmentsChange,
  selectedCount,
  isRunning,
  canRun,
  onRun,
  onStop,
}: RunConfigPanelProps) {
  const hasPeopleFinder = stages.includes("people_finder");

  // ---- stage toggle logic ----
  // "full" is a virtual state: it means all three individual stages are selected.
  // Selecting Full Pipeline adds apollo+perplexity+gemini. Deselecting one
  // just removes that stage (no longer "full"). Toggling Full off removes all three.
  const hasAllThree = INDIVIDUAL_STAGES.every((s) => stages.includes(s));

  function toggleStage(key: OrgStage) {
    if (key === "people_finder") {
      onStagesChange(
        stages.includes("people_finder")
          ? stages.filter((s) => s !== "people_finder")
          : [...stages, "people_finder"]
      );
      return;
    }

    if (key === "full") {
      if (hasAllThree) {
        // Toggling Full OFF — remove all three individual stages, keep people_finder
        onStagesChange(stages.filter((s) => !INDIVIDUAL_STAGES.includes(s)));
      } else {
        // Toggling Full ON — add all three, keep people_finder and any existing
        const next = new Set(stages);
        INDIVIDUAL_STAGES.forEach((s) => next.add(s));
        next.delete("full"); // "full" is virtual, never stored
        onStagesChange(Array.from(next));
      }
      return;
    }

    // Individual stage (apollo/perplexity/gemini) — simple toggle
    if (stages.includes(key)) {
      onStagesChange(stages.filter((s) => s !== key && s !== "full"));
    } else {
      const next = [...stages.filter((s) => s !== "full"), key];
      onStagesChange(next);
    }
  }

  // ---- field toggle logic ----
  function toggleField(key: EnrichField) {
    if (personFields.includes(key)) {
      onPersonFieldsChange(personFields.filter((f) => f !== key));
    } else {
      onPersonFieldsChange([...personFields, key]);
    }
  }

  // ---- chip toggle helper ----
  function toggleChip<T extends string>(list: T[], item: T, setter: (v: T[]) => void) {
    if (list.includes(item)) {
      setter(list.filter((x) => x !== item));
    } else {
      setter([...list, item]);
    }
  }

  return (
    <GlassCard className="relative">
      {/* ---- Header (always interactive) ---- */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-medium">
          Pipeline Configuration
        </span>

        {isRunning ? (
          <button
            onClick={onStop}
            className="bg-red-500/15 text-red-400 border border-red-500/20 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 hover:bg-red-500/25 transition-colors"
          >
            <Square className="h-3.5 w-3.5" />
            Stop
          </button>
        ) : (
          <button
            onClick={onRun}
            disabled={!canRun}
            className={cn(
              "bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border border-[var(--accent-orange)]/20 hover:bg-[var(--accent-orange)]/25 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors",
              !canRun && "opacity-50 cursor-not-allowed"
            )}
          >
            <Play className="h-3.5 w-3.5" />
            Run Pipeline {selectedCount > 0 ? `(${selectedCount})` : ""}
          </button>
        )}
      </div>

      {/* ---- Config body (dims when running) ---- */}
      <div className={cn(isRunning && "pointer-events-none opacity-40")}>

      {/* ---- Stages / Fields ---- */}
      {tab === "organizations" ? (
        <>
          <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2">
            Pipeline Stages
          </div>
          <div className="flex flex-col gap-1.5 mb-4">
            {STAGE_OPTIONS.map((opt) => {
              // "full" is active when all three individual stages are selected
              const isActive = opt.key === "full"
                ? hasAllThree
                : stages.includes(opt.key);
              const Icon = opt.icon;

              return (
                <button
                  key={opt.key}
                  onClick={() => toggleStage(opt.key)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left text-sm transition-colors",
                    isActive
                      ? "bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border-[var(--accent-orange)]/20"
                      : "bg-[var(--glass-bg)] text-[var(--text-muted)] border-[var(--glass-border)] hover:text-white"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <div className="flex flex-col">
                    <span className="font-medium text-sm leading-tight">{opt.label}</span>
                    <span className="text-[10px] text-[var(--text-muted)] leading-tight">
                      {opt.description}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* ---- People Finder Settings ---- */}
          <div
            className={cn(
              "overflow-hidden transition-all duration-300",
              hasPeopleFinder ? "max-h-[500px] opacity-100 mb-4" : "max-h-0 opacity-0"
            )}
          >
            <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2">
              People Finder Settings
            </div>

            {/* Contacts per company */}
            <div className="mb-3">
              <label className="text-xs text-[var(--text-muted)] mb-1 block">
                Contacts per company
              </label>
              <GlassInput
                type="number"
                min={1}
                max={25}
                value={pfPerCompany}
                onChange={(e) => onPfPerCompanyChange(Math.max(1, Math.min(25, Number(e.target.value) || 1)))}
                className="w-24"
              />
            </div>

            {/* Seniority chips */}
            <div className="mb-3">
              <label className="text-xs text-[var(--text-muted)] mb-1.5 block">Seniority</label>
              <div className="flex flex-wrap gap-1">
                {SENIORITY_OPTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => toggleChip(pfSeniorities, s, onPfSenioritiesChange)}
                    className={cn(
                      "px-2 py-1 rounded-md text-[10px] font-medium border transition-colors",
                      pfSeniorities.includes(s)
                        ? "bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border-[var(--accent-orange)]/20"
                        : "bg-[var(--glass-bg)] text-[var(--text-muted)] border-[var(--glass-border)]"
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Department chips */}
            <div>
              <label className="text-xs text-[var(--text-muted)] mb-1.5 block">Departments</label>
              <div className="flex flex-wrap gap-1">
                {DEPARTMENT_OPTIONS.map((d) => (
                  <button
                    key={d}
                    onClick={() => toggleChip(pfDepartments, d, onPfDepartmentsChange)}
                    className={cn(
                      "px-2 py-1 rounded-md text-[10px] font-medium border transition-colors",
                      pfDepartments.includes(d)
                        ? "bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border-[var(--accent-orange)]/20"
                        : "bg-[var(--glass-bg)] text-[var(--text-muted)] border-[var(--glass-border)]"
                    )}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2">
            Fields to Enrich
          </div>
          <div className="flex flex-col gap-1.5 mb-2">
            {FIELD_OPTIONS.map((opt) => {
              const isActive = personFields.includes(opt.key);
              const Icon = opt.icon;

              return (
                <button
                  key={opt.key}
                  onClick={() => toggleField(opt.key)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left text-sm transition-colors",
                    isActive
                      ? "bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border-[var(--accent-orange)]/20"
                      : "bg-[var(--glass-bg)] text-[var(--text-muted)] border-[var(--glass-border)] hover:text-white"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="font-medium">{opt.label}</span>
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-[var(--text-muted)] mb-4">Source: Apollo</p>
        </>
      )}

      </div>{/* end config body dim wrapper */}
    </GlassCard>
  );
});

RunConfigPanel.displayName = "RunConfigPanel";
