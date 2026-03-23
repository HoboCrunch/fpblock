"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import { Tabs } from "@/components/ui/tabs";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassSelect } from "@/components/ui/glass-select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Plus, Save, Trash2, X, Pencil } from "lucide-react";
import type {
  SenderProfile,
  PromptTemplate,
  AutomationRule,
  EventConfig,
  CompanyContext,
} from "@/lib/types/database";
import {
  getSenderProfiles,
  upsertSenderProfile,
  deleteSenderProfile,
  getPromptTemplates,
  upsertPromptTemplate,
  deletePromptTemplate,
  getAutomationRules,
  upsertAutomationRule,
  deleteAutomationRule,
  toggleAutomationRule,
  getEventConfigs,
  upsertEventConfig,
  getCompanyContext,
  updateCompanyContext,
} from "./actions";
import { createBrowserClient } from "@supabase/ssr";

// ---- Company Profile Tab ----

function CompanyProfileTab() {
  const [context, setContext] = useState<CompanyContext | null>(null);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const load = useCallback(() => {
    startTransition(async () => {
      const { data } = await getCompanyContext();
      if (data) setContext(data as CompanyContext);
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleChange(field: keyof CompanyContext, value: string) {
    if (!context) return;
    setContext({ ...context, [field]: value });
    setSaved(false);
  }

  function handleSave() {
    if (!context) return;
    startTransition(async () => {
      await updateCompanyContext({
        id: context.id,
        company_name: context.company_name,
        about: context.about,
        icp_criteria: context.icp_criteria,
        positioning: context.positioning,
        language_rules: context.language_rules,
        outreach_strategy: context.outreach_strategy,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    });
  }

  if (!context) {
    return (
      <GlassCard className="text-center py-12">
        <p className="text-[var(--text-muted)]">Loading company profile...</p>
      </GlassCard>
    );
  }

  const fields: { key: keyof CompanyContext; label: string; description: string; rows: number }[] = [
    {
      key: "company_name",
      label: "Company Name",
      description: "Your company name as used in enrichment prompts",
      rows: 1,
    },
    {
      key: "about",
      label: "About / Company Description",
      description: "Brief description of what your company does. Used as context in ICP scoring and message generation.",
      rows: 4,
    },
    {
      key: "positioning",
      label: "Positioning Statement",
      description: "How your company is positioned in the market. Embedded in Gemini ICP scoring prompts.",
      rows: 4,
    },
    {
      key: "icp_criteria",
      label: "ICP Criteria",
      description: "Your Ideal Customer Profile framework. Used verbatim by Gemini to score organizations (0-100).",
      rows: 16,
    },
    {
      key: "language_rules",
      label: "Language Rules",
      description: "Words/phrases to lead with or avoid in enrichment analysis and outreach generation.",
      rows: 4,
    },
    {
      key: "outreach_strategy",
      label: "Outreach Strategy",
      description: "High-level outreach strategy notes. Available for message generation prompts.",
      rows: 8,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--text-muted)]">
          These fields are used by the enrichment pipeline (Gemini ICP scoring) and message generation. Changes take effect on the next enrichment run.
        </p>
        <button
          onClick={handleSave}
          disabled={isPending}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
            saved
              ? "bg-green-500/15 text-green-400 border border-green-500/20"
              : "bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border border-[var(--accent-orange)]/20 hover:bg-[var(--accent-orange)]/25",
            isPending && "opacity-50 cursor-not-allowed"
          )}
        >
          <Save className="h-4 w-4" />
          {saved ? "Saved!" : isPending ? "Saving..." : "Save Changes"}
        </button>
      </div>

      {fields.map(({ key, label, description, rows }) => (
        <GlassCard key={key}>
          <div className="mb-2">
            <label className="text-sm font-medium text-white">{label}</label>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">{description}</p>
          </div>
          {rows === 1 ? (
            <input
              type="text"
              value={(context[key] as string) ?? ""}
              onChange={(e) => handleChange(key, e.target.value)}
              className={cn(
                "w-full rounded-lg font-[family-name:var(--font-body)]",
                "bg-[var(--glass-bg)] border border-[var(--glass-border)]",
                "text-white px-3 py-2 text-sm transition-all duration-200",
                "focus:outline-none focus:ring-2 focus:ring-[var(--accent-orange)]/40 focus:border-[var(--accent-orange)]/50"
              )}
            />
          ) : (
            <textarea
              value={(context[key] as string) ?? ""}
              onChange={(e) => handleChange(key, e.target.value)}
              rows={rows}
              className={cn(
                "w-full rounded-lg font-mono text-xs leading-relaxed",
                "bg-[var(--glass-bg)] border border-[var(--glass-border)]",
                "text-white px-3 py-2 transition-all duration-200 resize-y",
                "focus:outline-none focus:ring-2 focus:ring-[var(--accent-orange)]/40 focus:border-[var(--accent-orange)]/50"
              )}
            />
          )}
        </GlassCard>
      ))}

      {/* Last updated */}
      <p className="text-[10px] text-[var(--text-muted)] text-right">
        Last updated: {new Date(context.updated_at).toLocaleString()}
      </p>
    </div>
  );
}

// ---- Sender Profiles Tab ----

function SenderProfilesTab() {
  const [profiles, setProfiles] = useState<SenderProfile[]>([]);
  const [editing, setEditing] = useState<Partial<SenderProfile> | null>(null);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(() => {
    startTransition(async () => {
      const { data } = await getSenderProfiles();
      setProfiles(data as SenderProfile[]);
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleSave() {
    if (!editing?.name) return;
    startTransition(async () => {
      await upsertSenderProfile({
        id: editing.id,
        name: editing.name!,
        email: editing.email ?? null,
        heyreach_account_id: editing.heyreach_account_id ?? null,
        signature: editing.signature ?? null,
        tone_notes: editing.tone_notes ?? null,
      });
      setEditing(null);
      load();
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteSenderProfile(id);
      load();
    });
  }

  return (
    <div className="space-y-4">
      {/* Editing form */}
      {editing && (
        <GlassCard>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold">
              {editing.id ? "Edit" : "New"} Sender Profile
            </h3>
            <button onClick={() => setEditing(null)} className="text-[var(--text-muted)] hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-[var(--text-muted)] mb-1 block">Name *</label>
              <GlassInput
                value={editing.name ?? ""}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="e.g. Wesley Crook"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)] mb-1 block">Email</label>
              <GlassInput
                value={editing.email ?? ""}
                onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                placeholder="wes@gofpblock.com"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)] mb-1 block">HeyReach Account ID</label>
              <GlassInput
                value={editing.heyreach_account_id ?? ""}
                onChange={(e) => setEditing({ ...editing, heyreach_account_id: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)] mb-1 block">Tone Notes</label>
              <GlassInput
                value={editing.tone_notes ?? ""}
                onChange={(e) => setEditing({ ...editing, tone_notes: e.target.value })}
                placeholder="Casual, direct, no fluff"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-[var(--text-muted)] mb-1 block">Signature</label>
              <textarea
                value={editing.signature ?? ""}
                onChange={(e) => setEditing({ ...editing, signature: e.target.value })}
                rows={2}
                className={cn(
                  "w-full rounded-lg font-[family-name:var(--font-body)]",
                  "bg-[var(--glass-bg)] border border-[var(--glass-border)]",
                  "backdrop-blur-xl text-white placeholder:text-[var(--text-muted)]",
                  "px-3 py-2 text-sm transition-all duration-200 resize-y",
                  "focus:outline-none focus:ring-2 focus:ring-[var(--accent-orange)]/40 focus:border-[var(--accent-orange)]/50"
                )}
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleSave}
              disabled={isPending || !editing.name}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border border-[var(--accent-orange)]/20 hover:bg-[var(--accent-orange)]/25 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              Save
            </button>
          </div>
        </GlassCard>
      )}

      {/* Add button */}
      {!editing && (
        <button
          onClick={() => setEditing({})}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-[var(--text-muted)] border border-dashed border-[var(--glass-border)] hover:text-white hover:border-[var(--accent-orange)]/40 transition-all duration-200"
        >
          <Plus className="h-4 w-4" />
          Add Sender Profile
        </button>
      )}

      {/* Table */}
      <GlassCard padding={false}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--glass-border)] text-left">
              <th className="px-5 py-3 text-[var(--text-muted)] font-medium">Name</th>
              <th className="px-5 py-3 text-[var(--text-muted)] font-medium">Email</th>
              <th className="px-5 py-3 text-[var(--text-muted)] font-medium">Tone</th>
              <th className="px-5 py-3 text-[var(--text-muted)] font-medium w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => (
              <tr key={p.id} className="border-b border-[var(--glass-border)] last:border-0 hover:bg-[var(--glass-bg-hover)] transition-all duration-200">
                <td className="px-5 py-4 text-white">{p.name}</td>
                <td className="px-5 py-4 text-[var(--text-secondary)]">{p.email ?? "-"}</td>
                <td className="px-5 py-4 text-[var(--text-secondary)] truncate max-w-[200px]">{p.tone_notes ?? "-"}</td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setEditing(p)} className="text-[var(--text-muted)] hover:text-[var(--accent-indigo)]">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDelete(p.id)} className="text-[var(--text-muted)] hover:text-red-400">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {profiles.length === 0 && (
              <tr><td colSpan={4} className="px-5 py-8 text-center text-[var(--text-muted)]">No sender profiles yet</td></tr>
            )}
          </tbody>
        </table>
      </GlassCard>
    </div>
  );
}

// ---- Prompt Templates Tab ----

function PromptTemplatesTab() {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [editing, setEditing] = useState<Partial<PromptTemplate> | null>(null);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(() => {
    startTransition(async () => {
      const { data } = await getPromptTemplates();
      setTemplates(data as PromptTemplate[]);
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleSave() {
    if (!editing?.name) return;
    startTransition(async () => {
      await upsertPromptTemplate({
        id: editing.id,
        name: editing.name!,
        channel: editing.channel ?? null,
        system_prompt: editing.system_prompt ?? "",
        user_prompt_template: editing.user_prompt_template ?? "",
      });
      setEditing(null);
      load();
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deletePromptTemplate(id);
      load();
    });
  }

  return (
    <div className="space-y-4">
      {editing && (
        <GlassCard>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold">{editing.id ? "Edit" : "New"} Prompt Template</h3>
            <button onClick={() => setEditing(null)} className="text-[var(--text-muted)] hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-[var(--text-muted)] mb-1 block">Name *</label>
                <GlassInput
                  value={editing.name ?? ""}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="e.g. EthCC Cold Outreach"
                />
              </div>
              <div>
                <label className="text-xs text-[var(--text-muted)] mb-1 block">Channel</label>
                <GlassSelect
                  options={[
                    { value: "email", label: "Email" },
                    { value: "linkedin", label: "LinkedIn" },
                    { value: "twitter", label: "Twitter" },
                  ]}
                  placeholder="Any"
                  value={editing.channel ?? ""}
                  onChange={(e) => setEditing({ ...editing, channel: e.target.value || null })}
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)] mb-1 block">System Prompt</label>
              <textarea
                value={editing.system_prompt ?? ""}
                onChange={(e) => setEditing({ ...editing, system_prompt: e.target.value })}
                rows={4}
                placeholder="You are a professional outreach assistant..."
                className={cn(
                  "w-full rounded-lg font-[family-name:var(--font-body)]",
                  "bg-[var(--glass-bg)] border border-[var(--glass-border)]",
                  "backdrop-blur-xl text-white placeholder:text-[var(--text-muted)]",
                  "px-3 py-2 text-sm transition-all duration-200 resize-y",
                  "focus:outline-none focus:ring-2 focus:ring-[var(--accent-orange)]/40 focus:border-[var(--accent-orange)]/50"
                )}
              />
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)] mb-1 block">User Prompt Template</label>
              <textarea
                value={editing.user_prompt_template ?? ""}
                onChange={(e) => setEditing({ ...editing, user_prompt_template: e.target.value })}
                rows={4}
                placeholder="Write a {channel} message to {first_name} at {company_name}..."
                className={cn(
                  "w-full rounded-lg font-[family-name:var(--font-body)]",
                  "bg-[var(--glass-bg)] border border-[var(--glass-border)]",
                  "backdrop-blur-xl text-white placeholder:text-[var(--text-muted)]",
                  "px-3 py-2 text-sm transition-all duration-200 resize-y",
                  "focus:outline-none focus:ring-2 focus:ring-[var(--accent-orange)]/40 focus:border-[var(--accent-orange)]/50"
                )}
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleSave}
              disabled={isPending || !editing.name}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border border-[var(--accent-orange)]/20 hover:bg-[var(--accent-orange)]/25 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              Save
            </button>
          </div>
        </GlassCard>
      )}

      {!editing && (
        <button
          onClick={() => setEditing({})}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-[var(--text-muted)] border border-dashed border-[var(--glass-border)] hover:text-white hover:border-[var(--accent-orange)]/40 transition-all duration-200"
        >
          <Plus className="h-4 w-4" />
          Add Prompt Template
        </button>
      )}

      <GlassCard padding={false}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--glass-border)] text-left">
              <th className="px-5 py-3 text-[var(--text-muted)] font-medium">Name</th>
              <th className="px-5 py-3 text-[var(--text-muted)] font-medium">Channel</th>
              <th className="px-5 py-3 text-[var(--text-muted)] font-medium">System Prompt</th>
              <th className="px-5 py-3 text-[var(--text-muted)] font-medium w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id} className="border-b border-[var(--glass-border)] last:border-0 hover:bg-[var(--glass-bg-hover)] transition-all duration-200">
                <td className="px-5 py-4 text-white">{t.name}</td>
                <td className="px-5 py-4">
                  {t.channel ? <Badge variant="glass-indigo">{t.channel}</Badge> : <span className="text-[var(--text-muted)]">Any</span>}
                </td>
                <td className="px-5 py-4 text-[var(--text-secondary)] truncate max-w-[300px]">
                  {t.system_prompt.slice(0, 80)}{t.system_prompt.length > 80 ? "..." : ""}
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setEditing(t)} className="text-[var(--text-muted)] hover:text-[var(--accent-indigo)]">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDelete(t.id)} className="text-[var(--text-muted)] hover:text-red-400">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {templates.length === 0 && (
              <tr><td colSpan={4} className="px-5 py-8 text-center text-[var(--text-muted)]">No prompt templates yet</td></tr>
            )}
          </tbody>
        </table>
      </GlassCard>
    </div>
  );
}

// ---- Automation Rules Tab ----

function AutomationRulesTab() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [editing, setEditing] = useState<Partial<AutomationRule> | null>(null);
  const [isPending, startTransition] = useTransition();
  const [conditionsStr, setConditionsStr] = useState("{}");
  const [actionParamsStr, setActionParamsStr] = useState("{}");

  const load = useCallback(() => {
    startTransition(async () => {
      const { data } = await getAutomationRules();
      setRules(data as AutomationRule[]);
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  function startEdit(rule?: AutomationRule) {
    if (rule) {
      setEditing(rule);
      setConditionsStr(JSON.stringify(rule.conditions, null, 2));
      setActionParamsStr(JSON.stringify(rule.action_params, null, 2));
    } else {
      setEditing({ enabled: true });
      setConditionsStr("{}");
      setActionParamsStr("{}");
    }
  }

  function handleSave() {
    if (!editing?.name) return;
    let conditions: Record<string, unknown> = {};
    let actionParams: Record<string, unknown> = {};
    try {
      conditions = JSON.parse(conditionsStr);
      actionParams = JSON.parse(actionParamsStr);
    } catch {
      return; // Invalid JSON
    }
    startTransition(async () => {
      await upsertAutomationRule({
        id: editing.id,
        name: editing.name!,
        trigger_table: editing.trigger_table ?? "",
        trigger_event: editing.trigger_event ?? "",
        conditions,
        action: editing.action ?? "",
        action_params: actionParams,
        enabled: editing.enabled ?? true,
      });
      setEditing(null);
      load();
    });
  }

  function handleToggle(id: string, enabled: boolean) {
    startTransition(async () => {
      await toggleAutomationRule(id, enabled);
      load();
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteAutomationRule(id);
      load();
    });
  }

  return (
    <div className="space-y-4">
      {editing && (
        <GlassCard>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold">{editing.id ? "Edit" : "New"} Automation Rule</h3>
            <button onClick={() => setEditing(null)} className="text-[var(--text-muted)] hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-xs text-[var(--text-muted)] mb-1 block">Name *</label>
              <GlassInput value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)] mb-1 block">Action</label>
              <GlassInput value={editing.action ?? ""} onChange={(e) => setEditing({ ...editing, action: e.target.value })} placeholder="send_message" />
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)] mb-1 block">Trigger Table</label>
              <GlassInput value={editing.trigger_table ?? ""} onChange={(e) => setEditing({ ...editing, trigger_table: e.target.value })} placeholder="persons" />
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)] mb-1 block">Trigger Event</label>
              <GlassInput value={editing.trigger_event ?? ""} onChange={(e) => setEditing({ ...editing, trigger_event: e.target.value })} placeholder="INSERT" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-[var(--text-muted)] mb-1 block">Conditions (JSON)</label>
              <textarea
                value={conditionsStr}
                onChange={(e) => setConditionsStr(e.target.value)}
                rows={3}
                className={cn(
                  "w-full rounded-lg font-mono",
                  "bg-[var(--glass-bg)] border border-[var(--glass-border)]",
                  "backdrop-blur-xl text-white placeholder:text-[var(--text-muted)]",
                  "px-3 py-2 text-sm transition-all duration-200 resize-y",
                  "focus:outline-none focus:ring-2 focus:ring-[var(--accent-orange)]/40 focus:border-[var(--accent-orange)]/50"
                )}
              />
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)] mb-1 block">Action Params (JSON)</label>
              <textarea
                value={actionParamsStr}
                onChange={(e) => setActionParamsStr(e.target.value)}
                rows={3}
                className={cn(
                  "w-full rounded-lg font-mono",
                  "bg-[var(--glass-bg)] border border-[var(--glass-border)]",
                  "backdrop-blur-xl text-white placeholder:text-[var(--text-muted)]",
                  "px-3 py-2 text-sm transition-all duration-200 resize-y",
                  "focus:outline-none focus:ring-2 focus:ring-[var(--accent-orange)]/40 focus:border-[var(--accent-orange)]/50"
                )}
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleSave}
              disabled={isPending || !editing.name}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border border-[var(--accent-orange)]/20 hover:bg-[var(--accent-orange)]/25 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              Save
            </button>
          </div>
        </GlassCard>
      )}

      {!editing && (
        <button
          onClick={() => startEdit()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-[var(--text-muted)] border border-dashed border-[var(--glass-border)] hover:text-white hover:border-[var(--accent-orange)]/40 transition-all duration-200"
        >
          <Plus className="h-4 w-4" />
          Add Automation Rule
        </button>
      )}

      <GlassCard padding={false}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--glass-border)] text-left">
              <th className="px-5 py-3 text-[var(--text-muted)] font-medium">Enabled</th>
              <th className="px-5 py-3 text-[var(--text-muted)] font-medium">Name</th>
              <th className="px-5 py-3 text-[var(--text-muted)] font-medium">Trigger</th>
              <th className="px-5 py-3 text-[var(--text-muted)] font-medium">Action</th>
              <th className="px-5 py-3 text-[var(--text-muted)] font-medium w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id} className="border-b border-[var(--glass-border)] last:border-0 hover:bg-[var(--glass-bg-hover)] transition-all duration-200">
                <td className="px-5 py-4">
                  <button
                    onClick={() => handleToggle(r.id, !r.enabled)}
                    className={cn(
                      "w-10 h-5 rounded-full transition-all duration-200 relative",
                      r.enabled ? "bg-[var(--accent-orange)]/30" : "bg-[var(--glass-bg)]"
                    )}
                  >
                    <div className={cn(
                      "w-4 h-4 rounded-full absolute top-0.5 transition-all duration-200",
                      r.enabled ? "left-5 bg-[var(--accent-orange)]" : "left-0.5 bg-[var(--text-muted)]"
                    )} />
                  </button>
                </td>
                <td className="px-5 py-4 text-white">{r.name}</td>
                <td className="px-5 py-4 text-[var(--text-secondary)]">
                  {r.trigger_table}.{r.trigger_event}
                </td>
                <td className="px-5 py-4">
                  <Badge variant="glass-indigo">{r.action}</Badge>
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    <button onClick={() => startEdit(r)} className="text-[var(--text-muted)] hover:text-[var(--accent-indigo)]">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDelete(r.id)} className="text-[var(--text-muted)] hover:text-red-400">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rules.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-[var(--text-muted)]">No automation rules yet</td></tr>
            )}
          </tbody>
        </table>
      </GlassCard>
    </div>
  );
}

// ---- Event Config Tab ----

function EventConfigTab() {
  const [configs, setConfigs] = useState<(EventConfig & { events?: { name: string } })[]>([]);
  const [senders, setSenders] = useState<{ value: string; label: string }[]>([]);
  const [promptTemplates, setPromptTemplates] = useState<{ value: string; label: string }[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<Partial<EventConfig>>({});
  const [isPending, startTransition] = useTransition();

  const load = useCallback(() => {
    startTransition(async () => {
      const { data } = await getEventConfigs();
      setConfigs(data as (EventConfig & { events?: { name: string } })[]);
    });

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    supabase.from("sender_profiles").select("id, name").then(({ data }) => {
      setSenders((data ?? []).map((s: { id: string; name: string }) => ({ value: s.id, label: s.name })));
    });
    supabase.from("prompt_templates").select("id, name").then(({ data }) => {
      setPromptTemplates((data ?? []).map((t: { id: string; name: string }) => ({ value: t.id, label: t.name })));
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  function startInlineEdit(config: EventConfig) {
    setEditingId(config.id);
    setEditState(config);
  }

  function handleSave() {
    if (!editingId) return;
    startTransition(async () => {
      await upsertEventConfig({
        id: editState.id,
        event_id: editState.event_id!,
        sender_id: editState.sender_id ?? null,
        cta_url: editState.cta_url ?? null,
        cta_text: editState.cta_text ?? null,
        prompt_template_id: editState.prompt_template_id ?? null,
        notify_emails: editState.notify_emails ?? null,
      });
      setEditingId(null);
      load();
    });
  }

  return (
    <div className="space-y-4">
      <GlassCard padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--glass-border)] text-left">
                <th className="px-5 py-3 text-[var(--text-muted)] font-medium">Event</th>
                <th className="px-5 py-3 text-[var(--text-muted)] font-medium">Sender</th>
                <th className="px-5 py-3 text-[var(--text-muted)] font-medium">CTA URL</th>
                <th className="px-5 py-3 text-[var(--text-muted)] font-medium">CTA Text</th>
                <th className="px-5 py-3 text-[var(--text-muted)] font-medium">Prompt</th>
                <th className="px-5 py-3 text-[var(--text-muted)] font-medium">Notify</th>
                <th className="px-5 py-3 text-[var(--text-muted)] font-medium w-20"></th>
              </tr>
            </thead>
            <tbody>
              {configs.map((c) => {
                const isEditing = editingId === c.id;
                return (
                  <tr key={c.id} className="border-b border-[var(--glass-border)] last:border-0 hover:bg-[var(--glass-bg-hover)] transition-all duration-200">
                    <td className="px-5 py-4 text-white">{c.events?.name ?? c.event_id}</td>
                    <td className="px-5 py-3">
                      {isEditing ? (
                        <GlassSelect
                          options={senders}
                          placeholder="None"
                          value={editState.sender_id ?? ""}
                          onChange={(e) => setEditState({ ...editState, sender_id: e.target.value || null })}
                        />
                      ) : (
                        <span className="text-[var(--text-secondary)]">
                          {senders.find((s) => s.value === c.sender_id)?.label ?? "-"}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {isEditing ? (
                        <GlassInput
                          value={editState.cta_url ?? ""}
                          onChange={(e) => setEditState({ ...editState, cta_url: e.target.value })}
                          placeholder="https://..."
                        />
                      ) : (
                        <span className="text-[var(--text-secondary)] truncate max-w-[150px] block">{c.cta_url ?? "-"}</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {isEditing ? (
                        <GlassInput
                          value={editState.cta_text ?? ""}
                          onChange={(e) => setEditState({ ...editState, cta_text: e.target.value })}
                        />
                      ) : (
                        <span className="text-[var(--text-secondary)]">{c.cta_text ?? "-"}</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {isEditing ? (
                        <GlassSelect
                          options={promptTemplates}
                          placeholder="None"
                          value={editState.prompt_template_id ?? ""}
                          onChange={(e) => setEditState({ ...editState, prompt_template_id: e.target.value || null })}
                        />
                      ) : (
                        <span className="text-[var(--text-secondary)]">
                          {promptTemplates.find((t) => t.value === c.prompt_template_id)?.label ?? "-"}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {isEditing ? (
                        <GlassInput
                          value={(editState.notify_emails ?? []).join(", ")}
                          onChange={(e) => setEditState({ ...editState, notify_emails: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                          placeholder="a@b.com, c@d.com"
                        />
                      ) : (
                        <span className="text-[var(--text-secondary)] truncate max-w-[150px] block">
                          {c.notify_emails?.join(", ") ?? "-"}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <button onClick={handleSave} disabled={isPending} className="text-emerald-400 hover:text-emerald-300">
                            <Save className="h-4 w-4" />
                          </button>
                          <button onClick={() => setEditingId(null)} className="text-[var(--text-muted)] hover:text-white">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => startInlineEdit(c)} className="text-[var(--text-muted)] hover:text-[var(--accent-indigo)]">
                          <Pencil className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {configs.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-[var(--text-muted)]">No event configs yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}

// ---- Main Settings Page ----

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold font-[family-name:var(--font-heading)] text-white">
        Settings
      </h1>

      <Tabs
        tabs={[
          {
            id: "company",
            label: "Company Profile",
            content: <CompanyProfileTab />,
          },
          {
            id: "senders",
            label: "Sender Profiles",
            content: <SenderProfilesTab />,
          },
          {
            id: "prompts",
            label: "Prompt Templates",
            content: <PromptTemplatesTab />,
          },
          {
            id: "automations",
            label: "Automation Rules",
            content: <AutomationRulesTab />,
          },
          {
            id: "events",
            label: "Event Config",
            content: <EventConfigTab />,
          },
        ]}
      />
    </div>
  );
}
