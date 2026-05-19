import { describe, it, expect, vi, beforeEach } from "vitest";
import * as telegram from "@/lib/telegram";
import { correlateAndNotify } from "./inbox-correlator";

// Mock find-person-by-email so correlateEmail sees a successful match
// without needing a real Supabase connection.
vi.mock("@/lib/inbox/find-person-by-email", () => ({
  findPersonByEmail: vi.fn().mockResolvedValue({
    person_id: "p1",
    match_type: "exact_email",
    person: { id: "p1", full_name: "Alice" },
    organization: { id: "o1", name: "Acme", icp_score: 80 },
  }),
}));

// Build a minimal Supabase stub that satisfies all the chained calls
// in processCorrelation (interactions query, update, inbound_emails update, job_log insert).
function makeSupabaseStub() {
  const chainable = {
    select: () => chainable,
    eq: () => chainable,
    in: () => chainable,
    order: () => chainable,
    limit: () => chainable,
    single: () => Promise.resolve({ data: null, error: null }),
    update: () => chainable,
    insert: () => Promise.resolve({ data: null, error: null }),
  };

  return {
    from: (_table: string) => chainable,
  };
}

describe("correlateAndNotify", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("suppresses Telegram notification when notify: false, even on successful match", async () => {
    const telegramSpy = vi
      .spyOn(telegram, "sendTelegramNotification")
      .mockResolvedValue(undefined as never);

    const supabase = makeSupabaseStub();

    const result = await correlateAndNotify(
      supabase as never,
      {
        id: "e1",
        from_address: "alice@acme.com",
        from_name: "Alice",
        subject: "Re: your message",
        body_preview: "Sounds good!",
        received_at: new Date().toISOString(),
      },
      { notify: false }
    );

    expect(result.person_id).toBe("p1");
    expect(telegramSpy).not.toHaveBeenCalled();
  });

  it("sends Telegram notification by default when a match is found", async () => {
    const telegramSpy = vi
      .spyOn(telegram, "sendTelegramNotification")
      .mockResolvedValue(undefined as never);

    const supabase = makeSupabaseStub();

    const result = await correlateAndNotify(
      supabase as never,
      {
        id: "e2",
        from_address: "alice@acme.com",
        from_name: "Alice",
        subject: "Re: your message",
        body_preview: "Sounds good!",
        received_at: new Date().toISOString(),
      }
      // no opts — default should notify
    );

    expect(result.person_id).toBe("p1");
    expect(telegramSpy).toHaveBeenCalledOnce();
  });

  it("sends Telegram notification when notify: true is explicit", async () => {
    const telegramSpy = vi
      .spyOn(telegram, "sendTelegramNotification")
      .mockResolvedValue(undefined as never);

    const supabase = makeSupabaseStub();

    await correlateAndNotify(
      supabase as never,
      {
        id: "e3",
        from_address: "alice@acme.com",
        from_name: "Alice",
        subject: "Hi",
        body_preview: "Hello",
        received_at: new Date().toISOString(),
      },
      { notify: true }
    );

    expect(telegramSpy).toHaveBeenCalledOnce();
  });
});
