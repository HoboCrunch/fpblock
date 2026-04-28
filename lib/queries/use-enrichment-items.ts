"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "./query-keys";
import type { OrgRow, PersonRow } from "@/app/admin/enrichment/components/entity-table";

// ---------------------------------------------------------------------------
// Supabase pagination helper — fetches all rows beyond the 1000-row default
// ---------------------------------------------------------------------------

const PAGE_SIZE = 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAll(query: any): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  let from = 0;
  while (true) {
    const { data } = await query.range(from, from + PAGE_SIZE - 1);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

/** Batch .in() queries for arrays > 500 items (Supabase IN limit) */
async function fetchInBatches<T = Record<string, unknown>>(
  supabase: ReturnType<typeof createClient>,
  table: string,
  selectCols: string,
  inColumn: string,
  ids: string[],
  batchSize = 500
): Promise<T[]> {
  const all: T[] = [];
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const { data } = await supabase
      .from(table)
      .select(selectCols)
      .in(inColumn, batch);
    if (data) all.push(...(data as T[]));
  }
  return all;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EnrichmentItemsParams {
  tab: "organizations" | "persons";
}

export interface EnrichmentItemsResult {
  items: (OrgRow | PersonRow)[];
  totalCount: number;
  categories: string[];
  sources: string[];
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useEnrichmentItems(params: EnrichmentItemsParams) {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.enrichment.items.list(params.tab, { tab: params.tab } as Record<string, unknown>),
    queryFn: async (): Promise<EnrichmentItemsResult> => {
      if (params.tab === "organizations") {
        // Fetch all orgs (paginated past 1000-row limit)
        const orgs = await fetchAll(
          supabase
            .from("organizations")
            .select(
              "id, name, category, icp_score, description, enrichment_status, enrichment_stages"
            )
            .order("name")
        );

        if (orgs.length === 0) {
          return { items: [], totalCount: 0, categories: [], sources: [] };
        }

        // Fetch event participations (batched for large ID lists)
        const orgIds = orgs.map(
          (o: Record<string, unknown>) => o.id as string
        );
        const [eps, personLinks] = await Promise.all([
          fetchInBatches(
            supabase,
            "event_participations",
            "organization_id, event_id, events(name)",
            "organization_id",
            orgIds
          ),
          fetchInBatches<{ organization_id: string; source: string }>(
            supabase,
            "person_organization",
            "organization_id, source",
            "organization_id",
            orgIds
          ),
        ]);

        // Build event map: org_id -> { event_ids, event_names }
        const eventMap = new Map<
          string,
          { ids: string[]; names: string[] }
        >();
        if (eps) {
          for (const ep of eps) {
            const orgId = (ep as Record<string, unknown>)
              .organization_id as string;
            const eventId = (ep as Record<string, unknown>)
              .event_id as string;
            const eventRec = (ep as Record<string, unknown>).events as {
              name: string;
            } | null;
            const eventName = eventRec?.name ?? "";

            let entry = eventMap.get(orgId);
            if (!entry) {
              entry = { ids: [], names: [] };
              eventMap.set(orgId, entry);
            }
            if (!entry.ids.includes(eventId)) {
              entry.ids.push(eventId);
              entry.names.push(eventName);
            }
          }
        }

        // Build person count map: orgId -> { total, enrichedFromOrg }
        const personCountMap = new Map<string, { total: number; enrichedFromOrg: number }>();
        for (const pl of personLinks) {
          const entry = personCountMap.get(pl.organization_id) ?? { total: 0, enrichedFromOrg: 0 };
          entry.total++;
          if (pl.source === "org_enrichment") entry.enrichedFromOrg++;
          personCountMap.set(pl.organization_id, entry);
        }

        // Build rows
        const rows: OrgRow[] = orgs.map((o: Record<string, unknown>) => {
          const ev = eventMap.get(o.id as string);
          return {
            id: o.id as string,
            name: o.name as string,
            event_ids: ev?.ids,
            event_names: ev?.names,
            category: (o.category as string) ?? null,
            icp_score: (o.icp_score as number) ?? null,
            description: (o.description as string) ?? null,
            enrichment_stages:
              (o.enrichment_stages as OrgRow["enrichment_stages"]) ?? null,
            enrichment_status:
              (o.enrichment_status as string) ?? "none",
            enriched_person_count: personCountMap.get(o.id as string)?.enrichedFromOrg ?? 0,
          };
        });

        // Extract unique categories
        const cats = new Set<string>();
        rows.forEach((r) => {
          if (r.category) cats.add(r.category);
        });

        return {
          items: rows,
          totalCount: rows.length,
          categories: Array.from(cats).sort(),
          sources: [],
        };
      } else {
        // Fetch persons from the view
        const persons = await fetchAll(
          supabase
            .from("persons_with_icp")
            .select(
              "id, full_name, primary_org_name, icp_score, email, linkedin_url, twitter_handle, phone, source"
            )
            .order("full_name")
        );

        if (persons.length === 0) {
          return { items: [], totalCount: 0, categories: [], sources: [] };
        }

        const personIds = persons.map(
          (p: Record<string, unknown>) => p.id as string
        );

        // Fetch enrichment_status from base persons table (batched)
        const enrichmentMap = new Map<string, string>();
        const statusData = await fetchInBatches(
          supabase,
          "persons",
          "id, enrichment_status",
          "id",
          personIds
        );
        for (const s of statusData) {
          enrichmentMap.set(
            (s as Record<string, unknown>).id as string,
            ((s as Record<string, unknown>).enrichment_status as string) ??
              "none"
          );
        }

        // Fetch event participations (batched)
        const eps = await fetchInBatches(
          supabase,
          "event_participations",
          "person_id, event_id, events(name)",
          "person_id",
          personIds
        );

        const eventMap = new Map<
          string,
          { ids: string[]; names: string[] }
        >();
        if (eps) {
          for (const ep of eps) {
            const personId = (ep as Record<string, unknown>)
              .person_id as string;
            const eid = (ep as Record<string, unknown>)
              .event_id as string;
            const eventRec = (ep as Record<string, unknown>).events as {
              name: string;
            } | null;
            const eventName = eventRec?.name ?? "";

            let entry = eventMap.get(personId);
            if (!entry) {
              entry = { ids: [], names: [] };
              eventMap.set(personId, entry);
            }
            if (!entry.ids.includes(eid)) {
              entry.ids.push(eid);
              entry.names.push(eventName);
            }
          }
        }

        const rows: PersonRow[] = persons.map(
          (p: Record<string, unknown>) => {
            const ev = eventMap.get(p.id as string);
            return {
              id: p.id as string,
              full_name: (p.full_name as string) ?? "",
              primary_org_name: (p.primary_org_name as string) ?? null,
              event_ids: ev?.ids,
              event_names: ev?.names,
              source: (p.source as string) ?? null,
              icp_score: (p.icp_score as number) ?? null,
              email: (p.email as string) ?? null,
              linkedin_url: (p.linkedin_url as string) ?? null,
              twitter_handle: (p.twitter_handle as string) ?? null,
              phone: (p.phone as string) ?? null,
              enrichment_status:
                enrichmentMap.get(p.id as string) ?? "none",
            };
          }
        );

        // Extract unique sources
        const srcs = new Set<string>();
        rows.forEach((r) => {
          if (r.source) srcs.add(r.source);
        });

        return {
          items: rows,
          totalCount: rows.length,
          categories: [],
          sources: Array.from(srcs).sort(),
        };
      }
    },
    enabled: !!params.tab,
  });
}
