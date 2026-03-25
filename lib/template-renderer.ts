import { ComposableTemplate, TemplateBlock } from "@/lib/types/database";
import type { Person, Organization, Event, SenderProfile } from "@/lib/types/database";

export interface TemplateContext {
  person: Record<string, string | number | null>;
  org: Record<string, string | number | null>;
  event: Record<string, string | number | null>;
  sender: Record<string, string | null>;
}

/**
 * Replaces {entity.field} tokens in text with values from context.
 * Unknown variables are left as-is.
 */
export function resolveVariables(text: string, ctx: TemplateContext): string {
  return text.replace(/\{(\w+)\.(\w+)\}/g, (_match, entity, field) => {
    const namespace = ctx[entity as keyof TemplateContext];
    if (!namespace) return _match;
    const value = namespace[field];
    if (value === undefined) return _match;
    if (value === null) return "";
    return String(value);
  });
}

/**
 * Renders a full ComposableTemplate into a string.
 * - Text blocks get variable substitution.
 * - AI blocks are replaced with content from aiResults (keyed by block index),
 *   or marked as [AI_BLOCK_PENDING] if not provided.
 */
export function renderTemplate(
  template: ComposableTemplate | null,
  ctx: TemplateContext,
  aiResults?: Map<number, string>
): string {
  if (!template || !template.blocks || template.blocks.length === 0) return "";

  return template.blocks
    .map((block: TemplateBlock, index: number) => {
      if (block.type === "text") {
        return resolveVariables(block.content, ctx);
      }
      if (block.type === "ai") {
        if (aiResults && aiResults.has(index)) {
          return aiResults.get(index)!;
        }
        return "[AI_BLOCK_PENDING]";
      }
      return "";
    })
    .join("");
}

/**
 * Extracts AI blocks from a template with their prompts resolved.
 * Returns an array suitable for batch AI generation.
 */
export function extractAiBlocks(
  template: ComposableTemplate | null,
  ctx: TemplateContext
): { index: number; prompt: string; max_tokens?: number; tone?: string }[] {
  if (!template || !template.blocks || template.blocks.length === 0) return [];

  const results: { index: number; prompt: string; max_tokens?: number; tone?: string }[] = [];

  template.blocks.forEach((block: TemplateBlock, index: number) => {
    if (block.type === "ai") {
      results.push({
        index,
        prompt: resolveVariables(block.prompt, ctx),
        ...(block.max_tokens !== undefined ? { max_tokens: block.max_tokens } : {}),
        ...(block.tone !== undefined ? { tone: block.tone } : {}),
      });
    }
  });

  return results;
}

/**
 * Builds a TemplateContext from database records, picking only the relevant fields.
 */
export function buildContext(
  person: Person | null | undefined,
  org: Organization | null | undefined,
  event: Event | null | undefined,
  sender: SenderProfile | null | undefined
): TemplateContext {
  return {
    person: {
      first_name: person?.first_name ?? null,
      full_name: person?.full_name ?? null,
      title: person?.title ?? null,
      seniority: person?.seniority ?? null,
      department: person?.department ?? null,
      email: person?.email ?? null,
      linkedin_url: person?.linkedin_url ?? null,
      bio: person?.bio ?? null,
    },
    org: {
      name: org?.name ?? null,
      category: org?.category ?? null,
      icp_score: org?.icp_score ?? null,
      icp_reason: org?.icp_reason ?? null,
      usp: org?.usp ?? null,
      context: org?.context ?? null,
      website: org?.website ?? null,
    },
    event: {
      name: event?.name ?? null,
      date_start: event?.date_start ?? null,
      location: event?.location ?? null,
    },
    sender: {
      name: sender?.name ?? null,
      email: sender?.email ?? null,
      signature: sender?.signature ?? null,
    },
  };
}
