"use client";

import { useState, useEffect, useTransition } from "react";
import Papa from "papaparse";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassSelect } from "@/components/ui/glass-select";
import { Badge } from "@/components/ui/badge";
import { FileDropzone } from "@/components/admin/file-dropzone";
import { ColumnMapper, type FieldMapping } from "@/components/admin/column-mapper";
import { importCsvData } from "./actions";
import { cn } from "@/lib/utils";
import { Upload as UploadIcon, CheckCircle, AlertCircle } from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";
import type { Upload, Event } from "@/lib/types/database";

export default function UploadsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvData, setCsvData] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<FieldMapping>({});
  const [events, setEvents] = useState<Pick<Event, "id" | "name">[]>([]);
  const [uploads, setUploads] = useState<Upload[]>([]);

  // Import config
  const [eventId, setEventId] = useState("");
  const [importAs, setImportAs] = useState<"persons" | "organizations" | "both">(
    "persons"
  );
  const [duplicateHandling, setDuplicateHandling] = useState<
    "skip" | "update" | "create_new"
  >("skip");

  // Import state
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    personsCreated: number;
    organizationsCreated: number;
    skipped: number;
    errors: string[];
  } | null>(null);

  // Load events and upload history
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

    supabase
      .from("uploads")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setUploads(data as Upload[]);
      });
  }, []);

  function handleFile(f: File) {
    setFile(f);
    setResult(null);
    Papa.parse(f, {
      header: false,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as string[][];
        if (rows.length > 0) {
          setCsvHeaders(rows[0]);
          setCsvData(rows.slice(1));
          setMapping({});
        }
      },
    });
  }

  function handleImport() {
    if (csvHeaders.length === 0 || csvData.length === 0) return;

    // Build mapped rows
    const mappedRows = csvData.map((row) => {
      const mapped: Record<string, string> = {};
      csvHeaders.forEach((header, i) => {
        const field = mapping[header];
        if (field) {
          mapped[field] = row[i] ?? "";
        }
      });
      return mapped;
    });

    startTransition(async () => {
      const res = await importCsvData(
        mappedRows,
        {
          eventId: eventId || null,
          importAs,
          duplicateHandling,
        },
        file?.name ?? "upload.csv"
      );
      setResult({
        personsCreated: res.personsCreated,
        organizationsCreated: res.organizationsCreated,
        skipped: res.skipped,
        errors: res.errors,
      });

      // Refresh upload history
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const { data } = await supabase
        .from("uploads")
        .select("*")
        .order("created_at", { ascending: false });
      if (data) setUploads(data as Upload[]);
    });
  }

  const hasMappedFields = Object.values(mapping).some((v) => v !== "");

  return (
    <div className="space-y-6">
      {/* Dropzone */}
      {!file && <FileDropzone onFile={handleFile} />}

      {/* File selected - show mapper */}
      {file && csvHeaders.length > 0 && (
        <div className="space-y-6">
          <GlassCard className="flex items-center justify-between">
            <div>
              <p className="text-white font-medium">{file.name}</p>
              <p className="text-sm text-[var(--text-muted)]">
                {csvData.length} rows, {csvHeaders.length} columns
              </p>
            </div>
            <button
              onClick={() => {
                setFile(null);
                setCsvHeaders([]);
                setCsvData([]);
                setMapping({});
                setResult(null);
              }}
              className="text-sm text-[var(--text-muted)] hover:text-white transition-colors"
            >
              Choose different file
            </button>
          </GlassCard>

          <ColumnMapper
            csvHeaders={csvHeaders}
            csvPreview={csvData}
            mapping={mapping}
            onMappingChange={setMapping}
          />

          {/* Import Config */}
          <GlassCard>
            <h3 className="text-white font-semibold font-[family-name:var(--font-heading)] mb-4">
              Import Configuration
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-[var(--text-muted)] mb-1 block">
                  Event
                </label>
                <GlassSelect
                  options={events.map((e) => ({
                    value: e.id,
                    label: e.name,
                  }))}
                  placeholder="No event"
                  value={eventId}
                  onChange={(e) => setEventId(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-[var(--text-muted)] mb-1 block">
                  Import As
                </label>
                <GlassSelect
                  options={[
                    { value: "persons", label: "Persons" },
                    { value: "organizations", label: "Organizations" },
                    { value: "both", label: "Both" },
                  ]}
                  value={importAs}
                  onChange={(e) =>
                    setImportAs(
                      e.target.value as "persons" | "organizations" | "both"
                    )
                  }
                />
              </div>
              <div>
                <label className="text-xs text-[var(--text-muted)] mb-1 block">
                  Duplicate Handling
                </label>
                <GlassSelect
                  options={[
                    { value: "skip", label: "Skip duplicates" },
                    { value: "update", label: "Update existing" },
                    { value: "create_new", label: "Create new" },
                  ]}
                  value={duplicateHandling}
                  onChange={(e) =>
                    setDuplicateHandling(
                      e.target.value as "skip" | "update" | "create_new"
                    )
                  }
                />
              </div>
            </div>

            <div className="mt-6 flex items-center gap-4">
              <button
                onClick={handleImport}
                disabled={isPending || !hasMappedFields}
                className={cn(
                  "flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                  "bg-[var(--accent-orange)]/15 text-[var(--accent-orange)] border border-[var(--accent-orange)]/20",
                  "hover:bg-[var(--accent-orange)]/25",
                  (isPending || !hasMappedFields) &&
                    "opacity-50 cursor-not-allowed"
                )}
              >
                <UploadIcon className="h-4 w-4" />
                {isPending ? "Importing..." : `Import ${csvData.length} rows`}
              </button>

              {result && (
                <div className="flex items-center gap-2 text-sm">
                  {result.errors.length === 0 ? (
                    <>
                      <CheckCircle className="h-4 w-4 text-emerald-400" />
                      <span className="text-emerald-400">
                        {result.personsCreated} persons,{" "}
                        {result.organizationsCreated} organizations created.{" "}
                        {result.skipped} skipped.
                      </span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-4 w-4 text-yellow-400" />
                      <span className="text-yellow-400">
                        {result.personsCreated} created, {result.errors.length}{" "}
                        errors
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
          </GlassCard>
        </div>
      )}

      {/* Upload History */}
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
                    <th className="px-5 py-3 text-[var(--text-muted)] font-medium">
                      Date
                    </th>
                    <th className="px-5 py-3 text-[var(--text-muted)] font-medium">
                      Filename
                    </th>
                    <th className="px-5 py-3 text-[var(--text-muted)] font-medium">
                      Rows
                    </th>
                    <th className="px-5 py-3 text-[var(--text-muted)] font-medium">
                      Persons
                    </th>
                    <th className="px-5 py-3 text-[var(--text-muted)] font-medium">
                      Organizations
                    </th>
                    <th className="px-5 py-3 text-[var(--text-muted)] font-medium">
                      Status
                    </th>
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
                      <td className="px-5 py-4 text-[var(--text-secondary)]">
                        {u.row_count ?? "-"}
                      </td>
                      <td className="px-5 py-4 text-[var(--text-secondary)]">
                        {u.persons_created}
                      </td>
                      <td className="px-5 py-4 text-[var(--text-secondary)]">
                        {u.organizations_created}
                      </td>
                      <td className="px-5 py-4">
                        <Badge variant={u.status === "completed" ? "sent" : u.status === "failed" ? "failed" : "processing"}>
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
