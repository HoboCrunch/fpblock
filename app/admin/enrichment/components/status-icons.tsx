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
        const hasData =
          stage.status === "completed" &&
          !stage.error;
        const colorClass = stageColor(
          hasData ? stage.status : "completed_empty",
          isActive
        );

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
