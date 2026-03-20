"use server";

import { createClient } from "@/lib/supabase/server";

// ---- Sender Profiles ----

export async function getSenderProfiles() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sender_profiles")
    .select("*")
    .order("created_at", { ascending: false });
  return { data: data ?? [], error: error?.message ?? null };
}

export async function upsertSenderProfile(profile: {
  id?: string;
  name: string;
  email: string | null;
  heyreach_account_id: string | null;
  signature: string | null;
  tone_notes: string | null;
}) {
  const supabase = await createClient();
  if (profile.id) {
    const { error } = await supabase
      .from("sender_profiles")
      .update({
        name: profile.name,
        email: profile.email,
        heyreach_account_id: profile.heyreach_account_id,
        signature: profile.signature,
        tone_notes: profile.tone_notes,
      })
      .eq("id", profile.id);
    return { success: !error, error: error?.message ?? null };
  } else {
    const { error } = await supabase.from("sender_profiles").insert({
      name: profile.name,
      email: profile.email,
      heyreach_account_id: profile.heyreach_account_id,
      signature: profile.signature,
      tone_notes: profile.tone_notes,
    });
    return { success: !error, error: error?.message ?? null };
  }
}

export async function deleteSenderProfile(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("sender_profiles").delete().eq("id", id);
  return { success: !error, error: error?.message ?? null };
}

// ---- Prompt Templates ----

export async function getPromptTemplates() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prompt_templates")
    .select("*")
    .order("created_at", { ascending: false });
  return { data: data ?? [], error: error?.message ?? null };
}

export async function upsertPromptTemplate(template: {
  id?: string;
  name: string;
  channel: string | null;
  system_prompt: string;
  user_prompt_template: string;
}) {
  const supabase = await createClient();
  if (template.id) {
    const { error } = await supabase
      .from("prompt_templates")
      .update({
        name: template.name,
        channel: template.channel,
        system_prompt: template.system_prompt,
        user_prompt_template: template.user_prompt_template,
        updated_at: new Date().toISOString(),
      })
      .eq("id", template.id);
    return { success: !error, error: error?.message ?? null };
  } else {
    const { error } = await supabase.from("prompt_templates").insert({
      name: template.name,
      channel: template.channel,
      system_prompt: template.system_prompt,
      user_prompt_template: template.user_prompt_template,
    });
    return { success: !error, error: error?.message ?? null };
  }
}

export async function deletePromptTemplate(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("prompt_templates").delete().eq("id", id);
  return { success: !error, error: error?.message ?? null };
}

// ---- Automation Rules ----

export async function getAutomationRules() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("automation_rules")
    .select("*")
    .order("created_at", { ascending: false });
  return { data: data ?? [], error: error?.message ?? null };
}

export async function upsertAutomationRule(rule: {
  id?: string;
  name: string;
  trigger_table: string;
  trigger_event: string;
  conditions: Record<string, unknown>;
  action: string;
  action_params: Record<string, unknown>;
  enabled: boolean;
}) {
  const supabase = await createClient();
  if (rule.id) {
    const { error } = await supabase
      .from("automation_rules")
      .update({
        name: rule.name,
        trigger_table: rule.trigger_table,
        trigger_event: rule.trigger_event,
        conditions: rule.conditions,
        action: rule.action,
        action_params: rule.action_params,
        enabled: rule.enabled,
      })
      .eq("id", rule.id);
    return { success: !error, error: error?.message ?? null };
  } else {
    const { error } = await supabase.from("automation_rules").insert({
      name: rule.name,
      trigger_table: rule.trigger_table,
      trigger_event: rule.trigger_event,
      conditions: rule.conditions,
      action: rule.action,
      action_params: rule.action_params,
      enabled: rule.enabled,
    });
    return { success: !error, error: error?.message ?? null };
  }
}

export async function deleteAutomationRule(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("automation_rules").delete().eq("id", id);
  return { success: !error, error: error?.message ?? null };
}

export async function toggleAutomationRule(id: string, enabled: boolean) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("automation_rules")
    .update({ enabled })
    .eq("id", id);
  return { success: !error, error: error?.message ?? null };
}

// ---- Event Config ----

export async function getEventConfigs() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("event_config")
    .select("*, events(name)")
    .order("created_at", { ascending: false });
  return { data: data ?? [], error: error?.message ?? null };
}

export async function upsertEventConfig(config: {
  id?: string;
  event_id: string;
  sender_id: string | null;
  cta_url: string | null;
  cta_text: string | null;
  prompt_template_id: string | null;
  notify_emails: string[] | null;
}) {
  const supabase = await createClient();
  if (config.id) {
    const { error } = await supabase
      .from("event_config")
      .update({
        sender_id: config.sender_id,
        cta_url: config.cta_url,
        cta_text: config.cta_text,
        prompt_template_id: config.prompt_template_id,
        notify_emails: config.notify_emails,
      })
      .eq("id", config.id);
    return { success: !error, error: error?.message ?? null };
  } else {
    const { error } = await supabase.from("event_config").insert({
      event_id: config.event_id,
      sender_id: config.sender_id,
      cta_url: config.cta_url,
      cta_text: config.cta_text,
      prompt_template_id: config.prompt_template_id,
      notify_emails: config.notify_emails,
    });
    return { success: !error, error: error?.message ?? null };
  }
}
