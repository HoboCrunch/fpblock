import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Fetch all rows from a Supabase table, working around the 1000-row limit.
 * Uses range-based pagination internally.
 */
export async function fetchAll<T = any>(
  supabase: SupabaseClient,
  table: string,
  select: string,
  options?: {
    order?: { column: string; ascending?: boolean };
    filters?: (query: any) => any;
    count?: boolean;
  }
): Promise<{ data: T[]; count: number }> {
  const PAGE = 1000;
  let all: T[] = [];
  let offset = 0;
  let totalCount = 0;

  while (true) {
    let query = supabase.from(table).select(select, options?.count ? { count: "exact" } : undefined);

    if (options?.filters) {
      query = options.filters(query);
    }

    if (options?.order) {
      query = query.order(options.order.column, { ascending: options.order.ascending ?? true });
    }

    query = query.range(offset, offset + PAGE - 1);

    const { data, count, error } = await query;

    if (error) {
      console.error(`fetchAll ${table} error:`, error.message);
      break;
    }

    if (count !== null && count !== undefined) totalCount = count;

    if (!data || data.length === 0) break;

    all = all.concat(data as T[]);

    if (data.length < PAGE) break; // Last page
    offset += PAGE;
  }

  return { data: all, count: totalCount || all.length };
}
