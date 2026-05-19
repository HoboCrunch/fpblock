export function normalizeEventName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

export interface EventPartitionResult {
  /** Original (un-normalized) name → existing event id */
  known: Record<string, string>;
  /** Unique original-cased names not found in the map */
  unknown: string[];
}

export function partitionEventNames(
  rawNames: string[],
  eventsByNormalized: Map<string, string>,
): EventPartitionResult {
  const known: Record<string, string> = {};
  const unknownSet = new Set<string>();
  const seenOriginals = new Set<string>();

  for (const raw of rawNames) {
    const trimmed = raw?.trim();
    if (!trimmed) continue;
    if (seenOriginals.has(trimmed)) continue;
    seenOriginals.add(trimmed);

    const normalized = normalizeEventName(trimmed);
    const matched = eventsByNormalized.get(normalized);
    if (matched) {
      known[trimmed] = matched;
    } else {
      unknownSet.add(trimmed);
    }
  }

  return { known, unknown: [...unknownSet] };
}
