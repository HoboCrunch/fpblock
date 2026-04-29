"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Save,
  Plus,
  AlertTriangle,
  Mail,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassInput } from "@/components/ui/glass-input";
import {
  type SegmentSpec,
  type SamplePerson,
  type EventRole,
  type PersonEnrichmentStatus,
  DEFAULT_SEGMENT_LIMIT,
  SEGMENT_WARN_THRESHOLD,
} from "@/lib/segments";
import { previewSegment, enrollFromSegment } from "@/app/admin/sequences/actions";
import { useEvents } from "@/lib/queries/use-events";

// ---------------------------------------------------------------------------
// Constants — these would normally come from the DB; using a static list
// keeps the UI snappy and avoids extra round-trips. Easy to swap later.
// ---------------------------------------------------------------------------

const INDUSTRY_OPTIONS = [
  "Crypto/Blockchain",
  "Financial Services",
  "Software",
  "Information Technology",
  "Media",
  "Internet",
  "Computer Software",
  "Venture Capital & Private Equity",
  "Marketing & Advertising",
];

const FUNDING_STAGE_OPTIONS = [
  "Seed",
  "Series A",
  "Series B",
  "Series C",
  "Series D",
  "Series E",
  "Series F+",
  "Public",
  "Acquired",
];

const ENRICHMENT_STATUS_OPTIONS: PersonEnrichmentStatus[] = [
  "none",
  "in_progress",
  "complete",
  "failed",
];

const EVENT_ROLE_OPTIONS: EventRole[] = [
  "speaker",
  "attendee",
  "sponsor",
  "org_affiliated",
];

const PRESET_STORAGE_KEY = "segment_builder_presets_v1";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptySpec(): SegmentSpec {
  return {
    exclude_already_enrolled: true,
    exclude_in_active_sequence: false,
    exclude_bounced: true,
    exclude_replied_recently: true,
    limit: DEFAULT_SEGMENT_LIMIT,
  };
}

function loadPresets(): Record<string, SegmentSpec> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PRESET_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, SegmentSpec>) : {};
  } catch {
    return {};
  }
}

function savePresets(presets: Record<string, SegmentSpec>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets));
}

// ---------------------------------------------------------------------------
// Small primitives
// ---------------------------------------------------------------------------

function Section({
  title,
  defaultOpen = true,
  badge,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  badge?: string | number | null;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-[var(--glass-border)] rounded-lg bg-[var(--glass-bg)]/50">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between p-3 text-left hover:bg-[var(--glass-bg-hover)] transition-colors rounded-lg"
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 text-[var(--text-muted)]" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-[var(--text-muted)]" />
          )}
          <span className="text-sm font-medium text-white">{title}</span>
        </div>
        {badge !== null && badge !== undefined && badge !== "" && (
          <span className="text-[11px] text-[var(--accent-orange)] bg-[var(--accent-orange)]/10 px-1.5 py-0.5 rounded">
            {badge}
          </span>
        )}
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 space-y-3 border-t border-[var(--glass-border)]">
          {children}
        </div>
      )}
    </div>
  );
}

function PillSelect<T extends string>({
  options,
  selected,
  onChange,
}: {
  options: readonly T[];
  selected: T[];
  onChange: (next: T[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const on = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() =>
              onChange(on ? selected.filter((s) => s !== opt) : [...selected, opt])
            }
            className={cn(
              "px-2 py-1 rounded-md text-[11px] border transition-colors",
              on
                ? "bg-[var(--accent-indigo)]/20 border-[var(--accent-indigo)]/40 text-white"
                : "bg-[var(--glass-bg)] border-[var(--glass-border)] text-[var(--text-muted)] hover:text-white"
            )}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean | undefined;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={!!value}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-3.5 w-3.5 accent-[var(--accent-orange)]"
      />
      <span className="flex-1">
        <span className="text-xs text-white">{label}</span>
        {hint && (
          <span className="block text-[11px] text-[var(--text-muted)] mt-0.5">
            {hint}
          </span>
        )}
      </span>
    </label>
  );
}

function NumberInput({
  value,
  onChange,
  placeholder,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
}) {
  return (
    <GlassInput
      type="number"
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === "") onChange(undefined);
        else {
          const n = Number(raw);
          onChange(Number.isFinite(n) ? n : undefined);
        }
      }}
      className="w-24"
    />
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface SegmentBuilderProps {
  sequenceId: string;
  onClose: () => void;
  onEnrolled?: (count: number) => void;
}

export function SegmentBuilder({
  sequenceId,
  onClose,
  onEnrolled,
}: SegmentBuilderProps) {
  const [spec, setSpec] = useState<SegmentSpec>(() => emptySpec());
  const [count, setCount] = useState<number | null>(null);
  const [limited, setLimited] = useState<number | null>(null);
  const [sample, setSample] = useState<SamplePerson[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [presets, setPresets] = useState<Record<string, SegmentSpec>>({});
  const [error, setError] = useState<string | null>(null);

  const { data: events } = useEvents();
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewSeq = useRef(0);

  // Load presets once
  useEffect(() => {
    setPresets(loadPresets());
  }, []);

  // Debounced preview
  useEffect(() => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(async () => {
      const ticket = ++previewSeq.current;
      setPreviewing(true);
      setError(null);
      try {
        const res = await previewSegment(spec, sequenceId);
        if (ticket !== previewSeq.current) return; // stale
        setCount(res.count);
        setLimited(res.limited);
        setSample(res.sample);
      } catch (e) {
        if (ticket !== previewSeq.current) return;
        setError(e instanceof Error ? e.message : "Preview failed");
      } finally {
        if (ticket === previewSeq.current) setPreviewing(false);
      }
    }, 350);
    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
    };
  }, [spec, sequenceId]);

  function patch(p: Partial<SegmentSpec>) {
    setSpec((prev) => ({ ...prev, ...p }));
  }

  async function handleEnroll() {
    if (!count || count === 0) return;
    if ((limited ?? 0) > SEGMENT_WARN_THRESHOLD) {
      const ok = window.confirm(
        `You're about to enroll ${limited} persons. Continue?`
      );
      if (!ok) return;
    }
    setEnrolling(true);
    setError(null);
    try {
      const res = await enrollFromSegment(sequenceId, spec);
      if (!res.success) {
        setError(res.error);
        return;
      }
      onEnrolled?.(res.enrolled);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enrollment failed");
    } finally {
      setEnrolling(false);
    }
  }

  function handleSavePreset() {
    const name = presetName.trim();
    if (!name) return;
    const next = { ...presets, [name]: spec };
    savePresets(next);
    setPresets(next);
    setPresetName("");
  }

  function handleLoadPreset(name: string) {
    const p = presets[name];
    if (p) setSpec(p);
  }

  function handleDeletePreset(name: string) {
    const next = { ...presets };
    delete next[name];
    savePresets(next);
    setPresets(next);
  }

  // Section badge counts
  const icpBadge = useMemo(() => {
    let n = 0;
    if (spec.icp_score?.min !== undefined || spec.icp_score?.max !== undefined) n++;
    if (spec.enrichment_status?.length) n++;
    if (spec.has_email !== undefined) n++;
    if (spec.has_linkedin !== undefined) n++;
    if (spec.source_in?.length) n++;
    return n || null;
  }, [spec]);

  const orgBadge = useMemo(() => {
    let n = 0;
    if (spec.org_industry_in?.length) n++;
    if (
      spec.org_employee_count?.min !== undefined ||
      spec.org_employee_count?.max !== undefined
    )
      n++;
    if (spec.org_funding_stage_in?.length) n++;
    if (spec.org_hq_country_in?.length) n++;
    return n || null;
  }, [spec]);

  const eventBadge = spec.event_id ? "on" : null;

  const exclusionsBadge = useMemo(() => {
    let n = 0;
    if (spec.exclude_already_enrolled) n++;
    if (spec.exclude_in_active_sequence) n++;
    if (spec.exclude_bounced) n++;
    if (spec.exclude_replied_recently) n++;
    return n || null;
  }, [spec]);

  const overWarn = (limited ?? 0) > SEGMENT_WARN_THRESHOLD;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4">
      {/* ----- LEFT: Filter form ----- */}
      <div className="space-y-3">
        {/* Presets */}
        {Object.keys(presets).length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <span className="text-[11px] text-[var(--text-muted)] mr-1 self-center">
              Presets:
            </span>
            {Object.keys(presets).map((name) => (
              <span
                key={name}
                className="inline-flex items-center gap-1 text-[11px] bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-md pl-2 pr-1 py-0.5"
              >
                <button
                  type="button"
                  className="text-white hover:text-[var(--accent-orange)]"
                  onClick={() => handleLoadPreset(name)}
                >
                  {name}
                </button>
                <button
                  type="button"
                  className="text-[var(--text-muted)] hover:text-red-400"
                  onClick={() => handleDeletePreset(name)}
                  title="Delete preset"
                >
                  <XCircle className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <Section title="ICP & enrichment" badge={icpBadge}>
          <div>
            <label className="text-[11px] text-[var(--text-muted)] mb-1 block">
              ICP score range
            </label>
            <div className="flex items-center gap-2">
              <NumberInput
                value={spec.icp_score?.min}
                placeholder="min"
                onChange={(v) =>
                  patch({ icp_score: { ...spec.icp_score, min: v } })
                }
              />
              <span className="text-[var(--text-muted)] text-xs">to</span>
              <NumberInput
                value={spec.icp_score?.max}
                placeholder="max"
                onChange={(v) =>
                  patch({ icp_score: { ...spec.icp_score, max: v } })
                }
              />
              <div className="flex gap-1">
                <button
                  type="button"
                  className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--glass-border)] text-[var(--text-muted)] hover:text-white"
                  onClick={() => patch({ icp_score: { min: 75 } })}
                >
                  ≥75
                </button>
                <button
                  type="button"
                  className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--glass-border)] text-[var(--text-muted)] hover:text-white"
                  onClick={() => patch({ icp_score: { min: 90 } })}
                >
                  ≥90
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="text-[11px] text-[var(--text-muted)] mb-1 block">
              Enrichment status
            </label>
            <PillSelect
              options={ENRICHMENT_STATUS_OPTIONS}
              selected={spec.enrichment_status ?? []}
              onChange={(next) =>
                patch({ enrichment_status: next.length ? next : undefined })
              }
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <ToggleRow
              label="Has email"
              value={spec.has_email === true}
              onChange={(v) => patch({ has_email: v ? true : undefined })}
            />
            <ToggleRow
              label="Has LinkedIn"
              value={spec.has_linkedin === true}
              onChange={(v) => patch({ has_linkedin: v ? true : undefined })}
            />
          </div>
        </Section>

        <Section title="Organization" badge={orgBadge} defaultOpen={false}>
          <div>
            <label className="text-[11px] text-[var(--text-muted)] mb-1 block">
              Industry
            </label>
            <PillSelect
              options={INDUSTRY_OPTIONS}
              selected={spec.org_industry_in ?? []}
              onChange={(next) =>
                patch({ org_industry_in: next.length ? next : undefined })
              }
            />
          </div>

          <div>
            <label className="text-[11px] text-[var(--text-muted)] mb-1 block">
              Employee count
            </label>
            <div className="flex items-center gap-2">
              <NumberInput
                value={spec.org_employee_count?.min}
                placeholder="min"
                onChange={(v) =>
                  patch({
                    org_employee_count: { ...spec.org_employee_count, min: v },
                  })
                }
              />
              <span className="text-[var(--text-muted)] text-xs">to</span>
              <NumberInput
                value={spec.org_employee_count?.max}
                placeholder="max"
                onChange={(v) =>
                  patch({
                    org_employee_count: { ...spec.org_employee_count, max: v },
                  })
                }
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] text-[var(--text-muted)] mb-1 block">
              Funding stage
            </label>
            <PillSelect
              options={FUNDING_STAGE_OPTIONS}
              selected={spec.org_funding_stage_in ?? []}
              onChange={(next) =>
                patch({ org_funding_stage_in: next.length ? next : undefined })
              }
            />
          </div>

          <div>
            <label className="text-[11px] text-[var(--text-muted)] mb-1 block">
              HQ country/city (comma-separated keywords)
            </label>
            <GlassInput
              value={(spec.org_hq_country_in ?? []).join(", ")}
              placeholder="e.g. United States, Singapore"
              onChange={(e) => {
                const parts = e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean);
                patch({ org_hq_country_in: parts.length ? parts : undefined });
              }}
            />
          </div>
        </Section>

        <Section title="Event affiliation" badge={eventBadge} defaultOpen={false}>
          <div>
            <label className="text-[11px] text-[var(--text-muted)] mb-1 block">
              Event
            </label>
            <select
              value={spec.event_id ?? ""}
              onChange={(e) =>
                patch({ event_id: e.target.value || undefined })
              }
              className="w-full bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="">— Any —</option>
              {(events ?? []).map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name}
                </option>
              ))}
            </select>
          </div>
          {spec.event_id && (
            <div>
              <label className="text-[11px] text-[var(--text-muted)] mb-1 block">
                Roles
              </label>
              <PillSelect
                options={EVENT_ROLE_OPTIONS}
                selected={spec.event_role_in ?? []}
                onChange={(next) =>
                  patch({ event_role_in: next.length ? next : undefined })
                }
              />
            </div>
          )}
        </Section>

        <Section title="Exclusions" badge={exclusionsBadge}>
          <ToggleRow
            label="Already enrolled in this sequence"
            hint="Skips persons already added — recommended."
            value={spec.exclude_already_enrolled}
            onChange={(v) => patch({ exclude_already_enrolled: v })}
          />
          <ToggleRow
            label="In any active sequence"
            hint="Avoids cross-sequence overlap."
            value={spec.exclude_in_active_sequence}
            onChange={(v) => patch({ exclude_in_active_sequence: v })}
          />
          <ToggleRow
            label="Recently bounced (90 days)"
            hint="Skips persons whose mail bounced recently."
            value={spec.exclude_bounced}
            onChange={(v) => patch({ exclude_bounced: v })}
          />
          <ToggleRow
            label="Replied recently (30 days)"
            hint="Don't re-engage someone who already responded."
            value={spec.exclude_replied_recently}
            onChange={(v) => patch({ exclude_replied_recently: v })}
          />
        </Section>

        <Section title="Limit" defaultOpen>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--text-muted)]">
              Cap enrolled to
            </span>
            <NumberInput
              value={spec.limit ?? DEFAULT_SEGMENT_LIMIT}
              placeholder="100"
              onChange={(v) => patch({ limit: v })}
            />
            <span className="text-xs text-[var(--text-muted)]">persons</span>
          </div>
          <p className="text-[11px] text-[var(--text-muted)]">
            Default {DEFAULT_SEGMENT_LIMIT}. Above {SEGMENT_WARN_THRESHOLD}{" "}
            you&apos;ll be asked to confirm.
          </p>
        </Section>
      </div>

      {/* ----- RIGHT: Preview & Actions ----- */}
      <div className="space-y-3 lg:sticky lg:top-3 lg:self-start">
        <div className="border border-[var(--glass-border)] rounded-lg p-3 bg-[var(--glass-bg)]/60">
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-xs text-[var(--text-muted)]">Matches</span>
            {previewing && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--text-muted)]" />
            )}
          </div>
          <div className="text-2xl font-semibold text-white tabular-nums">
            {count === null ? "—" : count.toLocaleString()}
            <span className="text-xs text-[var(--text-muted)] ml-2 font-normal">
              persons match
            </span>
          </div>
          {count !== null && limited !== null && limited < count && (
            <p className="text-[11px] text-[var(--text-muted)] mt-1">
              Will enroll first {limited} (limit cap).
            </p>
          )}
          {overWarn && (
            <div className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-400">
              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
              <span>Large enrollment — you&apos;ll be asked to confirm.</span>
            </div>
          )}
          {error && (
            <div className="mt-2 text-[11px] text-red-400 break-words">
              {error}
            </div>
          )}
        </div>

        {/* Sample */}
        <div className="border border-[var(--glass-border)] rounded-lg p-3 bg-[var(--glass-bg)]/60">
          <div className="text-[11px] text-[var(--text-muted)] mb-2">
            Sample
          </div>
          {sample.length === 0 ? (
            <p className="text-[11px] text-[var(--text-muted)]">
              No preview yet.
            </p>
          ) : (
            <div className="space-y-1.5">
              {sample.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between text-[11px]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-white truncate">{p.full_name}</p>
                    <p className="text-[var(--text-muted)] truncate">
                      {p.primary_org_name ?? "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 ml-2 shrink-0">
                    {p.email && (
                      <Mail className="h-3 w-3 text-[var(--text-muted)]" />
                    )}
                    {p.icp_score !== null && (
                      <span className="tabular-nums text-[var(--accent-orange)]">
                        {p.icp_score}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <button
          type="button"
          onClick={handleEnroll}
          disabled={!count || enrolling || previewing}
          className={cn(
            "w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200",
            "bg-[var(--accent-orange)] text-white hover:bg-[var(--accent-orange)]/90",
            "shadow-lg shadow-[var(--accent-orange)]/20",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          {enrolling ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Enroll {limited ?? 0} matching
        </button>

        <div className="flex items-center gap-1.5">
          <GlassInput
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="Save as preset…"
            className="flex-1"
          />
          <button
            type="button"
            onClick={handleSavePreset}
            disabled={!presetName.trim()}
            className="p-2 rounded-lg border border-[var(--glass-border)] text-[var(--text-muted)] hover:text-white disabled:opacity-50"
            title="Save preset"
          >
            <Save className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => setSpec(emptySpec())}
          className="w-full text-[11px] text-[var(--text-muted)] hover:text-white py-1"
        >
          Reset filters
        </button>
      </div>
    </div>
  );
}
