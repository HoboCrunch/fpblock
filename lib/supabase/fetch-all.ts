import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Fetch all rows from a Supabase table, working around the 1000-row limit.
 * Uses range-based pagination — fetches the first page sequentially,
 * then fires all remaining pages in parallel.
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

  function buildQuery(offset: number) {
    let query = supabase
      .from(table)
      .select(select, options?.count ? { count: "exact" } : undefined);

    if (options?.filters) {
      query = options.filters(query);
    }

    if (options?.order) {
      query = query.order(options.order.column, {
        ascending: options.order.ascending ?? true,
      });
    }

    return query.range(offset, offset + PAGE - 1);
  }

  // First page — sequential to learn total count and whether more pages exist
  const { data: firstData, count, error: firstError } = await buildQuery(0);

  if (firstError) {
    console.error(`fetchAll ${table} error:`, firstError.message);
    return { data: [], count: 0 };
  }

  if (!firstData || firstData.length === 0) {
    return { data: [], count: count ?? 0 };
  }

  let all: T[] = firstData as T[];
  const totalCount = count ?? 0;

  // If the first page was full, there may be more data
  if (firstData.length === PAGE) {
    if (totalCount > PAGE) {
      // We know the total — fire all remaining pages in parallel
      const remainingPages: number[] = [];
      for (let offset = PAGE; offset < totalCount; offset += PAGE) {
        remainingPages.push(offset);
      }

      const results = await Promise.all(
        remainingPages.map(async (offset) => {
          const { data, error } = await buildQuery(offset);
          if (error) {
            console.error(`fetchAll ${table} page offset=${offset} error:`, error.message);
            return [] as T[];
          }
          return (data ?? []) as T[];
        })
      );

      for (const pageData of results) {
        all = all.concat(pageData);
      }
    } else {
      // No count available — fall back to sequential pagination
      let offset = PAGE;
      while (true) {
        const { data, error } = await buildQuery(offset);
        if (error) {
          console.error(`fetchAll ${table} page offset=${offset} error:`, error.message);
          break;
        }
        if (!data || data.length === 0) break;
        all = all.concat(data as T[]);
        if (data.length < PAGE) break;
        offset += PAGE;
      }
    }
  }

  return { data: all, count: totalCount || all.length };
}
