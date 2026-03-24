"use client";

import { cn } from "@/lib/utils";
import {
  Search,
  FlaskConical,
  Brain,
  Users,
  Mail,
  Linkedin,
  Twitter,
  Phone,
  type LucideIcon,
} from "lucide-react";

// ---------- Org Status Icons ----------

export interface OrgStatusIconsProps {
  stages: Record<
    string,
    { status?: string; error?: string; [key: string]: unknown }
  > | null;
  mode?: "static" | "live";
  activeStage?: string;
}

const ORG_STAGE_ICONS: { key: string; icon: LucideIcon; label: string }[] = [
  { key: "apollo", icon: Search, label: "Apollo" },
  { key: "perplexity", icon: FlaskConical, label: "Perplexity" },
  { key: "gemini", icon: Brain, label: "Gemini" },
  { key: "people_finder", icon: Users, label: "People Finder" },
];

function stageColor(
  status: string | undefined,
  isActive: boolean
): string {
  if (isActive) return "text-[var(--accent-orange)] animate-pulse";
  switch (status) {
    case "completed":
      return "text-green-400";
    case "completed_empty":
      return "text-gray-500";
    case "failed":
      return "text-red-400";
    default:
      return "text-gray-500";
  }
}

/**
 * Determine whether a completed stage actually produced meaningful results.
 * Stages store numeric fields (found, signals) when they complete.
 * If those fields are present and zero, the stage ran but found nothing → gray.
 * If no numeric field is present (legacy data), assume it has results → green.
 */
function stageHasResults(
  key: string,
  stage: { status?: string; [key: string]: unknown }
): boolean {
  if (stage.status !== "completed") return false;

  // People Finder: check `found` count
  if (key === "people_finder") {
    if (typeof stage.found === "number") return stage.found > 0;
    // Legacy data without found field — treat as has results
    return true;
  }

  // Gemini: check `signals` count
  if (key === "gemini") {
    if (typeof stage.signals === "number") return stage.signals > 0;
    return true;
  }

  // Apollo / Perplexity: check `found` (1 = got data, 0 = empty)
  if (key === "apollo" || key === "perplexity") {
    if (typeof stage.found === "number") return stage.found > 0;
    return true;
  }

  return true;
}

export function OrgStatusIcons({
  stages,
  mode = "static",
  activeStage,
}: OrgStatusIconsProps) {
  if (!stages) return null;

  return (
    <div className="flex items-center gap-1.5">
      {ORG_STAGE_ICONS.map(({ key, icon: Icon, label }) => {
        const stage = stages[key];
        if (!stage) return null;

        const isActive = mode === "live" && activeStage === key;
        const hasResults = stageHasResults(key, stage);
        const effectiveStatus =
          stage.status === "completed" && !hasResults
            ? "completed_empty"
            : stage.status;
        const colorClass = stageColor(effectiveStatus, isActive);

        return (
          <Icon
            key={key}
            className={cn("h-3.5 w-3.5", colorClass)}
            aria-label={`${label}: ${isActive ? "processing" : stage.status}`}
          />
        );
      })}
    </div>
  );
}

// ---------- Person Status Icons ----------

export interface PersonStatusIconsProps {
  email: string | null;
  linkedin_url: string | null;
  twitter_handle: string | null;
  phone: string | null;
  enrichmentStatus?: string;
  mode?: "static" | "live";
  activeField?: string;
}

const PERSON_FIELD_ICONS: {
  key: string;
  icon: LucideIcon;
  label: string;
}[] = [
  { key: "email", icon: Mail, label: "Email" },
  { key: "linkedin_url", icon: Linkedin, label: "LinkedIn" },
  { key: "twitter_handle", icon: Twitter, label: "Twitter" },
  { key: "phone", icon: Phone, label: "Phone" },
];

export function PersonStatusIcons({
  email,
  linkedin_url,
  twitter_handle,
  phone,
  enrichmentStatus,
  mode = "static",
  activeField,
}: PersonStatusIconsProps) {
  if (enrichmentStatus === "none") return null;

  const fieldValues: Record<string, string | null> = {
    email,
    linkedin_url,
    twitter_handle,
    phone,
  };

  const isFailed = enrichmentStatus === "failed";

  return (
    <div className="flex items-center gap-1.5">
      {PERSON_FIELD_ICONS.map(({ key, icon: Icon, label }) => {
        const value = fieldValues[key];
        const isActive = mode === "live" && activeField === key;

        // If enrichment is complete or failed, show all icons
        // If a specific field has data, always show it
        if (!isFailed && value === null && enrichmentStatus !== "complete") {
          return null;
        }

        let colorClass: string;
        if (isActive) {
          colorClass = "text-[var(--accent-orange)] animate-pulse";
        } else if (isFailed) {
          colorClass = "text-red-400";
        } else if (value !== null) {
          colorClass = "text-green-400";
        } else {
          colorClass = "text-gray-500";
        }

        return (
          <Icon
            key={key}
            className={cn("h-3.5 w-3.5", colorClass)}
            aria-label={`${label}: ${isActive ? "processing" : value ? "found" : "not found"}`}
          />
        );
      })}
    </div>
  );
}
