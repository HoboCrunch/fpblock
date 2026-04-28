export const queryKeys = {
  organizations: {
    all: ["organizations"] as const,
    list: (filters?: Record<string, unknown>) =>
      ["organizations", "list", filters] as const,
    detail: (id: string) => ["organizations", "detail", id] as const,
  },
  persons: {
    all: ["persons"] as const,
    list: (filters?: Record<string, unknown>) =>
      ["persons", "list", filters] as const,
    detail: (id: string) => ["persons", "detail", id] as const,
  },
  enrichment: {
    all: ["enrichment"] as const,
    jobs: {
      all: ["enrichment", "jobs"] as const,
      detail: (activeJobId: string) =>
        ["enrichment", "jobs", activeJobId] as const,
    },
    items: {
      all: ["enrichment", "items"] as const,
      list: (tab: string, filters?: Record<string, unknown>) =>
        ["enrichment", "items", tab, filters] as const,
    },
  },
  events: { all: ["events"] as const },
  initiatives: { all: ["initiatives"] as const },
  savedLists: { all: ["saved-lists"] as const },
  dashboard: { stats: ["dashboard", "stats"] as const },
  sequences: {
    all: ["sequences"] as const,
    list: (filters?: Record<string, unknown>) => ["sequences", "list", filters] as const,
    detail: (id: string) => ["sequences", "detail", id] as const,
    messages: {
      all: (id: string) => ["sequences", "messages", id] as const,
      list: (id: string, filters?: Record<string, unknown>) => ["sequences", "messages", id, filters] as const,
    },
    stats: (id: string) => ["sequences", "stats", id] as const,
  },
  eventAffiliations: {
    all: ["event-affiliations"] as const,
    byEvent: (eventId: string) => ["event-affiliations", "event", eventId] as const,
    personIdsForEvent: (eventId: string, relation: string) =>
      ["event-affiliations", "event", eventId, "ids", relation] as const,
    personIdsForEvents: (eventIds: string[], relation: string) =>
      ["event-affiliations", "events", [...eventIds].sort().join(","), "ids", relation] as const,
  },
} as const;
