"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { Upload as UploadIcon } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassSelect } from "@/components/ui/glass-select";
import { Badge } from "@/components/ui/badge";
import { FileDropzone } from "@/components/admin/file-dropzone";
import {
  ImportTable,
  type ImportTableState,
  type ImportColumn,
} from "@/components/admin/import-table";
import { EventDetectModal } from "@/components/admin/event-detect-modal";
import { EventCreateModal } from "@/components/admin/event-create-modal";
import {
  fieldSetForMode,
  isValidFieldForMode,
  type ImportMode,
} from "@/lib/uploads/field-sets";
import { autoMatchHeader } from "@/lib/uploads/auto-match";
import {
  createImportJob,
  listUnknownEvents,
  findOrCreateEvents,
  type DuplicateHandling,
  type EventDecision,
  type PersonImportRow,
  type OrganizationImportRow,
} from "./actions";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { Upload, Event } from "@/lib/types/database";
import type { ParticipationRole, SponsorTier } from "@/lib/types/database";

const DEFAULT_PERSON_COLUMNS = ["full_name", "email", "linkedin", "title", "event"];
const DEFAULT_ORG_COLUMNS = ["name", "website", "category", "linkedin_url", "event"];

const PERSON_ROLES: ParticipationRole[] = [
  "speaker",
  "panelist",
  "mc",
  "attendee",
  "organizer",
  "media",
];
const ORG_ROLES: ParticipationRole[] = ["sponsor", "partner", "exhibitor"];
const SPONSOR_TIERS: SponsorTier[] = [
  "presented_by",
  "platinum",
  "diamond",
  "emerald",
  "gold",
  "silver",
  "bronze",
  "copper",
  "community",
];

function defaultRoleForMode(m: ImportMode): ParticipationRole {
  return m === "persons" ? "speaker" : "sponsor";
}

function isValidRoleForMode(role: ParticipationRole, m: ImportMode): boolean {
  return (m === "persons" ? PERSON_ROLES : ORG_ROLES).includes(role);
}

function makeColumnId(): string {
  return `col_${Math.random().toString(36).slice(2, 9)}`;
}

function emptyStateFor(mode: ImportMode): ImportTableState {
  const fields = mode === "persons" ? DEFAULT_PERSON_COLUMNS : DEFAULT_ORG_COLUMNS;
  return {
    mode,
    columns: fields.map((f) => ({ id: makeColumnId(), field: f })),
    rows: Array.from({ length: 5 }, () => fields.map(() => "")),
  };
}

function rowToRecord(
  columns: ImportColumn[],
  row: string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  columns.forEach((col, i) => {
    if (col.field) out[col.field] = row[i] ?? "";
  });
  return out;
}

function dropEmptyRows(state: ImportTableState): string[][] {
  return state.rows.filter((row) =>
    state.columns.some((col, i) => col.field && (row[i]?.trim() ?? "") !== ""),
  );
}

export default function UploadsPage() {
  const router = useRouter();
  const [mode, setMode] = useState<ImportMode>("persons");
  const [state, setState] = useState<ImportTableState>(() => emptyStateFor("persons"));
  const [filename, setFilename] = useState("manual-import.csv");
  const [events, setEvents] = useState<Pick<Event, "id" | "name">[]>([]);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [duplicateHandling, setDuplicateHandling] = useState<DuplicateHandling>("skip");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingEventResolution, setPendingEventResolution] = useState<{
    unknown: string[];
    known: Record<string, string>;
  } | null>(null);
  const [journeyEvent, setJourneyEvent] = useState<{ id: string; name: string } | null>(null);
  const [showEventCreate, setShowEventCreate] = useState(false);
  const [listRole, setListRole] = useState<ParticipationRole>("speaker");
  const [sponsorTier, setSponsorTier] = useState<SponsorTier | "">("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("events")
      .select("id, name")
      .order("date_start", { ascending: false })
      .then(({ data }) => {
        if (data) setEvents(data as Pick<Event, "id" | "name">[]);
      });
    supabase
      .from("uploads")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setUploads(data as Upload[]);
      });
  }, []);

  function switchMode(next: ImportMode) {
    if (next === mode) return;
    const hasUserContent =
      state.rows.some((row) => row.some((v) => v.trim() !== "")) ||
      state.columns.some((c) => c.field && !DEFAULT_PERSON_COLUMNS.includes(c.field) && !DEFAULT_ORG_COLUMNS.includes(c.field));
    if (
      hasUserContent &&
      !confirm("Switch mode? Column bindings will reset. Row data will be preserved.")
    ) {
      return;
    }
    setMode(next);
    setListRole((prev) => (isValidRoleForMode(prev, next) ? prev : defaultRoleForMode(next)));
    setState((prev) => ({
      ...prev,
      mode: next,
      columns: prev.columns.map((c) => ({
        ...c,
        field: isValidFieldForMode(c.field, next) ? c.field : "",
      })),
    }));
  }

  function handleCsv(file: File) {
    setFilename(file.name);
    Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      complete: (results) => {
        const all = results.data as string[][];
        if (all.length === 0) return;
        const headers = all[0];
        const body = all.slice(1);
        const columns: ImportColumn[] = headers.map((h) => ({
          id: makeColumnId(),
          field: autoMatchHeader(h, mode),
          originalHeader: h,
        }));
        setState({ mode, columns, rows: body });
      },
    });
  }

  async function handleSubmit() {
    const validRows = dropEmptyRows(state);
    if (validRows.length === 0) return;

    // New-event-list journey: bind every row to the chosen event/role, skip
    // event-column detection entirely.
    if (journeyEvent) {
      await runImport(validRows, {}, {
        id: journeyEvent.id,
        role: listRole,
        sponsorTier: mode === "organizations" ? (sponsorTier || null) : null,
      });
      return;
    }

    // Extract event-column values
    const eventColIndex = state.columns.findIndex((c) => c.field === "event");
    const rawEventNames =
      eventColIndex >= 0 ? validRows.map((r) => r[eventColIndex] ?? "") : [];

    const partition = await listUnknownEvents(rawEventNames);
    if (partition.unknown.length > 0) {
      setPendingEventResolution(partition);
      return;
    }
    await runImport(validRows, partition.known);
  }

  async function resolveEventsAndImport(decisions: EventDecision[]) {
    if (!pendingEventResolution) return;
    try {
      const created = await findOrCreateEvents(decisions);
      const eventMap = { ...pendingEventResolution.known, ...created };
      setPendingEventResolution(null);
      await runImport(dropEmptyRows(state), eventMap);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unknown error creating events");
      setPendingEventResolution(null);
    }
  }

  async function runImport(
    validRows: string[][],
    eventMap: Record<string, string | null>,
    forcedEvent?: { id: string; role: ParticipationRole; sponsorTier?: SponsorTier | null },
  ) {
    setIsSubmitting(true);
    try {
      const records = validRows.map((row) => rowToRecord(state.columns, row));

      // 1. Create the job_log row + get a signed upload URL (server action)
      const { jobId, path, token } = await createImportJob({
        mode,
        filename,
        rowCount: records.length,
        config: {
          duplicateHandling,
          eventMap,
          forcedEvent: forcedEvent ?? null,
        },
      });

      // 2. Upload the resolved rows JSON to Storage via the signed URL
      const supabase = createClient();
      const payload = JSON.stringify({
        mode,
        rows: records as PersonImportRow[] | OrganizationImportRow[],
        config: {
          mode,
          duplicateHandling,
          eventMap,
          forcedEvent: forcedEvent ?? null,
        },
      });
      const { error: uploadError } = await supabase.storage
        .from("csv-imports")
        .uploadToSignedUrl(path, token, new Blob([payload], { type: "application/json" }));

      if (uploadError) {
        toast.error(`Failed to upload import data: ${uploadError.message}`);
        return;
      }

      // 3. Fire-and-forget: kick off the processor (cron will resume if this fails)
      fetch("/api/uploads/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      }).catch(() => {
        // Failures are surfaced via job_log / Process Details drawer.
      });

      // 4. Notify, reset form
      toast.success("Import started — track progress in Process Details");
      setState(emptyStateFor(mode));
      setFilename("manual-import.csv");
      setJourneyEvent(null);
      setSponsorTier("");

      // Refresh uploads table
      const { data } = await supabase
        .from("uploads")
        .select("*")
        .order("created_at", { ascending: false });
      if (data) setUploads(data as Upload[]);

      // New-event-list journey: navigate to the freshly-targeted event so the
      // imported rows become visible. The event page is a server component and
      // will fetch fresh participations on navigation (the cron / process route
      // drains the async import shortly after).
      if (forcedEvent) {
        router.push(`/admin/events/${forcedEvent.id}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start import");
    } finally {
      setIsSubmitting(false);
    }
  }

  const totalValidRows = dropEmptyRows(state).length;
  const hasMappedField = state.columns.some((c) => c.field);

  return (
    <div className="space-y-6">
      {/* Mode toggle + toolbar */}
      <GlassCard>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex rounded-lg overflow-hidden border border-[var(--glass-border)]">
            {(["persons", "organizations"] as const).map((m) => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className={cn(
                  "px-4 py-2 text-sm capitalize transition-colors",
                  mode === m
                    ? "bg-[var(--accent-orange)]/20 text-[var(--accent-orange)]"
                    : "text-[var(--text-secondary)] hover:text-white",
                )}
              >
                {m}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleCsv(f);
                e.target.value = "";
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-2 text-sm rounded-lg border border-[var(--glass-border)] text-[var(--text-secondary)] hover:text-white"
            >
              Upload CSV
            </button>
            <button
              onClick={() => {
                setState(emptyStateFor(mode));
                setFilename("manual-import.csv");
              }}
              className="px-3 py-2 text-sm rounded-lg border border-[var(--glass-border)] text-[var(--text-secondary)] hover:text-white"
            >
              Reset table
            </button>
            <button
              onClick={() => setShowEventCreate(true)}
              className="px-3 py-2 text-sm rounded-lg border border-[var(--glass-border)] text-[var(--text-secondary)] hover:text-white"
            >
              New event list
            </button>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <label className="text-xs text-[var(--text-muted)]">Duplicates</label>
            <GlassSelect
              options={[
                { value: "skip", label: "Skip duplicates" },
                { value: "update", label: "Update existing" },
                { value: "create_new", label: "Create new" },
              ]}
              value={duplicateHandling}
              onChange={(e) =>
                setDuplicateHandling(e.target.value as DuplicateHandling)
              }
            />
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !hasMappedField || totalValidRows === 0}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium",
                "bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border border-[var(--accent-orange)]/20",
                "hover:bg-[var(--accent-orange)]/25",
                (isSubmitting || !hasMappedField || totalValidRows === 0) &&
                  "opacity-50 cursor-not-allowed",
              )}
            >
              <UploadIcon className="h-4 w-4" />
              {isSubmitting ? "Starting..." : `Import ${totalValidRows} row${totalValidRows === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      </GlassCard>

      {/* New-event-list banner */}
      {journeyEvent && (
        <GlassCard className="border-[var(--accent-orange)]/30">
          <div className="flex flex-wrap items-center gap-4">
            <p className="text-sm text-[var(--text-secondary)]">
              Importing into{" "}
              <span className="font-semibold text-[var(--accent-orange)]">
                {journeyEvent.name}
              </span>
            </p>

            <div className="flex items-center gap-2">
              <label className="text-xs text-[var(--text-muted)]">Import as</label>
              <GlassSelect
                options={(mode === "persons" ? PERSON_ROLES : ORG_ROLES).map((r) => ({
                  value: r,
                  label: r,
                }))}
                value={listRole}
                onChange={(e) => setListRole(e.target.value as ParticipationRole)}
              />
            </div>

            {mode === "organizations" && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-[var(--text-muted)]">Sponsor tier</label>
                <GlassSelect
                  options={[
                    { value: "", label: "No tier" },
                    ...SPONSOR_TIERS.map((t) => ({ value: t, label: t })),
                  ]}
                  value={sponsorTier}
                  onChange={(e) => setSponsorTier(e.target.value as SponsorTier | "")}
                />
              </div>
            )}

            <button
              onClick={() => {
                setJourneyEvent(null);
                setSponsorTier("");
              }}
              className="ml-auto px-3 py-2 text-sm rounded-lg border border-[var(--glass-border)] text-[var(--text-secondary)] hover:text-white"
            >
              Exit list mode
            </button>
          </div>
        </GlassCard>
      )}

      {/* Drop target */}
      <FileDropzone onFile={handleCsv} />

      {/* The editable table */}
      <ImportTable
        state={state}
        onChange={setState}
        fieldSet={fieldSetForMode(mode)}
      />

      {/* Event resolution modal */}
      {pendingEventResolution && (
        <EventDetectModal
          unknownEvents={pendingEventResolution.unknown}
          existingEvents={events}
          onConfirm={resolveEventsAndImport}
          onCancel={() => setPendingEventResolution(null)}
        />
      )}

      {/* New event creation (starts the new-event-list journey) */}
      {showEventCreate && (
        <EventCreateModal
          onCreated={(event) => {
            setJourneyEvent(event);
            setShowEventCreate(false);
            setListRole((prev) =>
              isValidRoleForMode(prev, mode) ? prev : defaultRoleForMode(mode),
            );
          }}
          onCancel={() => setShowEventCreate(false)}
        />
      )}

      {/* Upload history */}
      <div>
        <h2 className="text-lg font-semibold font-[family-name:var(--font-heading)] text-white mb-3">
          Upload History
        </h2>
        {uploads.length === 0 ? (
          <GlassCard className="text-center py-8">
            <p className="text-[var(--text-muted)]">No uploads yet</p>
          </GlassCard>
        ) : (
          <GlassCard padding={false}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--glass-border)] text-left">
                    <th className="px-5 py-3 text-[var(--text-muted)] font-medium">Date</th>
                    <th className="px-5 py-3 text-[var(--text-muted)] font-medium">Filename</th>
                    <th className="px-5 py-3 text-[var(--text-muted)] font-medium">Rows</th>
                    <th className="px-5 py-3 text-[var(--text-muted)] font-medium">Persons</th>
                    <th className="px-5 py-3 text-[var(--text-muted)] font-medium">Organizations</th>
                    <th className="px-5 py-3 text-[var(--text-muted)] font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {uploads.map((u) => (
                    <tr
                      key={u.id}
                      className="border-b border-[var(--glass-border)] last:border-0 hover:bg-[var(--glass-bg-hover)] transition-all duration-200"
                    >
                      <td className="px-5 py-4 text-[var(--text-secondary)]">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-4 text-white">{u.filename}</td>
                      <td className="px-5 py-4 text-[var(--text-secondary)]">{u.row_count ?? "-"}</td>
                      <td className="px-5 py-4 text-[var(--text-secondary)]">{u.persons_created}</td>
                      <td className="px-5 py-4 text-[var(--text-secondary)]">{u.organizations_created}</td>
                      <td className="px-5 py-4">
                        <Badge
                          variant={
                            u.status === "completed"
                              ? "sent"
                              : u.status === "failed"
                                ? "failed"
                                : "processing"
                          }
                        >
                          {u.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>
        )}
      </div>
    </div>
  );
}
