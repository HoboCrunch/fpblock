"use client";

import { useState, useEffect } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassSelect } from "@/components/ui/glass-select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Sparkles, Play, Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import type { Event, JobLog } from "@/lib/types/database";

type EnrichField = "email" | "linkedin" | "twitter" | "phone";

export default function EnrichmentPage() {
  const searchParams = useSearchParams();
  const preSelectedContacts = searchParams.get("contacts")?.split(",") ?? [];

  const [source] = useState("apollo");
  const [target, setTarget] = useState<string>(
    preSelectedContacts.length > 0 ? "selected" : "unenriched"
  );
  const [eventId, setEventId] = useState("");
  const [fields, setFields] = useState<EnrichField[]>(["email", "linkedin"]);
  const [events, setEvents] = useState<Pick<Event, "id" | "name">[]>([]);
  const [jobs, setJobs] = useState<JobLog[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    supabase
      .from("events")
      .select("id, name")
      .order("date_start", { ascending: false })
      .then(({ data }) => {
        if (data) setEvents(data as Pick<Event, "id" | "name">[]);
      });

    loadJobs();
  }, []);

  async function loadJobs() {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data } = await supabase
      .from("job_log")
      .select("*")
      .eq("job_type", "enrichment")
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) setJobs(data as JobLog[]);
  }

  function toggleField(field: EnrichField) {
    setFields((prev) =>
      prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]
    );
  }

  async function handleRun() {
    if (fields.length === 0) return;
    setIsRunning(true);

    try {
      const body: Record<string, unknown> = { fields, source };

      if (target === "selected" && preSelectedContacts.length > 0) {
        body.contactIds = preSelectedContacts;
      } else if (target === "event" && eventId) {
        body.eventId = eventId;
      }
      // "unenriched" — API handles it

      const res = await fetch("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (data.jobId) {
        setActiveJobId(data.jobId);
      }

      // Refresh jobs
      await loadJobs();
    } catch {
      // Error handling — job list will reflect any failures
    } finally {
      setIsRunning(false);
      setActiveJobId(null);
    }
  }

  const fieldOptions: { key: EnrichField; label: string }[] = [
    { key: "email", label: "Email" },
    { key: "linkedin", label: "LinkedIn" },
    { key: "twitter", label: "Twitter" },
    { key: "phone", label: "Phone" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold font-[family-name:var(--font-heading)] text-white">
        Enrichment
      </h1>

      {/* Run Enrichment Card */}
      <GlassCard>
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-5 w-5 text-[var(--accent-orange)]" />
          <h2 className="text-lg font-semibold font-[family-name:var(--font-heading)] text-white">
            Run Enrichment
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div>
            <label className="text-xs text-[var(--text-muted)] mb-1 block">
              Source
            </label>
            <GlassSelect
              options={[{ value: "apollo", label: "Apollo" }]}
              value={source}
              disabled
            />
          </div>
          <div>
            <label className="text-xs text-[var(--text-muted)] mb-1 block">
              Target
            </label>
            <GlassSelect
              options={[
                { value: "unenriched", label: "All unenriched contacts" },
                {
                  value: "selected",
                  label: `Selected contacts (${preSelectedContacts.length})`,
                },
                { value: "event", label: "Contacts from event" },
              ]}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </div>
          {target === "event" && (
            <div>
              <label className="text-xs text-[var(--text-muted)] mb-1 block">
                Event
              </label>
              <GlassSelect
                options={events.map((e) => ({
                  value: e.id,
                  label: e.name,
                }))}
                placeholder="Select event"
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Field checkboxes */}
        <div className="mb-6">
          <label className="text-xs text-[var(--text-muted)] mb-2 block">
            Fields to Enrich
          </label>
          <div className="flex flex-wrap gap-3">
            {fieldOptions.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => toggleField(key)}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium border transition-all duration-200",
                  fields.includes(key)
                    ? "bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border-[var(--accent-orange)]/20"
                    : "bg-[var(--glass-bg)] text-[var(--text-muted)] border-[var(--glass-border)] hover:text-white"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Run button */}
        <button
          onClick={handleRun}
          disabled={isRunning || fields.length === 0}
          className={cn(
            "flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
            "bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border border-[var(--accent-orange)]/20",
            "hover:bg-[var(--accent-orange)]/25",
            (isRunning || fields.length === 0) &&
              "opacity-50 cursor-not-allowed"
          )}
        >
          {isRunning ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          {isRunning ? "Running..." : "Run Enrichment"}
        </button>

        {activeJobId && (
          <p className="mt-3 text-sm text-[var(--text-muted)]">
            Job started: {activeJobId}
          </p>
        )}
      </GlassCard>

      {/* Job History */}
      <div>
        <h2 className="text-lg font-semibold font-[family-name:var(--font-heading)] text-white mb-3">
          Job History
        </h2>
        {jobs.length === 0 ? (
          <GlassCard className="text-center py-8">
            <Sparkles className="h-8 w-8 text-[var(--text-muted)] mx-auto mb-2" />
            <p className="text-[var(--text-muted)]">No enrichment jobs yet</p>
          </GlassCard>
        ) : (
          <GlassCard padding={false}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--glass-border)] text-left">
                    <th className="px-5 py-3 text-[var(--text-muted)] font-medium">
                      Date
                    </th>
                    <th className="px-5 py-3 text-[var(--text-muted)] font-medium">
                      Source
                    </th>
                    <th className="px-5 py-3 text-[var(--text-muted)] font-medium">
                      Contacts
                    </th>
                    <th className="px-5 py-3 text-[var(--text-muted)] font-medium">
                      Emails Found
                    </th>
                    <th className="px-5 py-3 text-[var(--text-muted)] font-medium">
                      LinkedIn Found
                    </th>
                    <th className="px-5 py-3 text-[var(--text-muted)] font-medium">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => {
                    const meta = (job.metadata ?? {}) as Record<string, unknown>;
                    return (
                      <tr
                        key={job.id}
                        className="border-b border-[var(--glass-border)] last:border-0 hover:bg-[var(--glass-bg-hover)] transition-all duration-200"
                      >
                        <td className="px-5 py-4 text-[var(--text-secondary)]">
                          {new Date(job.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-5 py-4 text-[var(--text-secondary)]">
                          {(meta.source as string) ?? "apollo"}
                        </td>
                        <td className="px-5 py-4 text-[var(--text-secondary)]">
                          {(meta.contacts_processed as number) ?? "-"}
                        </td>
                        <td className="px-5 py-4 text-[var(--text-secondary)]">
                          {(meta.emails_found as number) ?? "-"}
                        </td>
                        <td className="px-5 py-4 text-[var(--text-secondary)]">
                          {(meta.linkedin_found as number) ?? "-"}
                        </td>
                        <td className="px-5 py-4">
                          <Badge
                            variant={
                              job.status === "completed"
                                ? "sent"
                                : job.status === "failed"
                                ? "failed"
                                : "processing"
                            }
                          >
                            {job.status}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </GlassCard>
        )}
      </div>
    </div>
  );
}
