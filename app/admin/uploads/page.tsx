"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import Papa from "papaparse";
import { Upload as UploadIcon, CheckCircle, AlertCircle } from "lucide-react";
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
import {
  fieldSetForMode,
  isValidFieldForMode,
  type ImportMode,
} from "@/lib/uploads/field-sets";
import { autoMatchHeader } from "@/lib/uploads/auto-match";
import {
  importPersons,
  importOrganizations,
  listUnknownEvents,
  findOrCreateEvents,
  type DuplicateHandling,
  type EventDecision,
  type PersonImportRow,
  type OrganizationImportRow,
} from "./actions";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { Upload, Event } from "@/lib/types/database";

const DEFAULT_PERSON_COLUMNS = ["full_name", "email", "linkedin", "title", "event"];
const DEFAULT_ORG_COLUMNS = ["name", "website", "category", "linkedin_url", "event"];

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
  const [mode, setMode] = useState<ImportMode>("persons");
  const [state, setState] = useState<ImportTableState>(() => emptyStateFor("persons"));
  const [filename, setFilename] = useState("manual-import.csv");
  const [events, setEvents] = useState<Pick<Event, "id" | "name">[]>([]);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [duplicateHandling, setDuplicateHandling] = useState<DuplicateHandling>("skip");
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    personsCreated: number;
    organizationsCreated: number;
    skipped: number;
    errors: string[];
  } | null>(null);
  const [pendingEventResolution, setPendingEventResolution] = useState<{
    unknown: string[];
    known: Record<string, string>;
  } | null>(null);
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
    setResult(null);
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
      setResult({
        personsCreated: 0,
        organizationsCreated: 0,
        skipped: 0,
        errors: [err instanceof Error ? err.message : "Unknown error creating events"],
      });
      setPendingEventResolution(null);
    }
  }

  function runImport(
    validRows: string[][],
    eventMap: Record<string, string | null>,
  ) {
    return new Promise<void>((resolve) => {
      startTransition(async () => {
        const records = validRows.map((row) => rowToRecord(state.columns, row));
        const res =
          mode === "persons"
            ? await importPersons(records as PersonImportRow[], { duplicateHandling, eventMap }, filename)
            : await importOrganizations(records as OrganizationImportRow[], { duplicateHandling, eventMap }, filename);
        setResult({
          personsCreated: res.personsCreated,
          organizationsCreated: res.organizationsCreated,
          skipped: res.skipped,
          errors: res.errors,
        });
        const supabase = createClient();
        const { data } = await supabase
          .from("uploads")
          .select("*")
          .order("created_at", { ascending: false });
        if (data) setUploads(data as Upload[]);
        resolve();
      });
    });
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
                setResult(null);
              }}
              className="px-3 py-2 text-sm rounded-lg border border-[var(--glass-border)] text-[var(--text-secondary)] hover:text-white"
            >
              Reset table
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
              disabled={isPending || !hasMappedField || totalValidRows === 0}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium",
                "bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border border-[var(--accent-orange)]/20",
                "hover:bg-[var(--accent-orange)]/25",
                (isPending || !hasMappedField || totalValidRows === 0) &&
                  "opacity-50 cursor-not-allowed",
              )}
            >
              <UploadIcon className="h-4 w-4" />
              {isPending ? "Importing..." : `Import ${totalValidRows} row${totalValidRows === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
        {result && (
          <div className="mt-3 flex items-center gap-2 text-sm">
            {result.errors.length === 0 ? (
              <>
                <CheckCircle className="h-4 w-4 text-emerald-400" />
                <span className="text-emerald-400">
                  {result.personsCreated} persons, {result.organizationsCreated} organizations created. {result.skipped} skipped.
                </span>
              </>
            ) : (
              <>
                <AlertCircle className="h-4 w-4 text-yellow-400" />
                <span className="text-yellow-400">
                  {result.personsCreated + result.organizationsCreated} created, {result.errors.length} errors
                </span>
              </>
            )}
          </div>
        )}
      </GlassCard>

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
