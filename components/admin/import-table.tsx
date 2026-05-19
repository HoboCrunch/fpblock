"use client";

import { useId } from "react";
import { X, Plus } from "lucide-react";
import { GlassSelect } from "@/components/ui/glass-select";
import { GlassCard } from "@/components/ui/glass-card";
import type { FieldDef, ImportMode } from "@/lib/uploads/field-sets";
import { parseClipboard } from "@/lib/uploads/paste-parser";

export interface ImportColumn {
  id: string;
  field: string;
  originalHeader?: string;
}

export interface ImportTableState {
  mode: ImportMode;
  columns: ImportColumn[];
  rows: string[][];
}

interface ImportTableProps {
  state: ImportTableState;
  onChange: (next: ImportTableState) => void;
  fieldSet: FieldDef[];
}

const FIELD_OPTION_DISCARD = { value: "", label: "— Discard —" };

function makeColumnId(): string {
  return `col_${Math.random().toString(36).slice(2, 9)}`;
}

export function ImportTable({ state, onChange, fieldSet }: ImportTableProps) {
  const labelId = useId();
  const options = [
    FIELD_OPTION_DISCARD,
    ...fieldSet.map((f) => ({ value: f.id, label: f.label })),
  ];

  function updateCell(r: number, c: number, value: string) {
    const rows = state.rows.map((row, ri) =>
      ri === r ? row.map((v, ci) => (ci === c ? value : v)) : row,
    );
    onChange({ ...state, rows });
  }

  function handlePaste(r: number, c: number, e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text/plain");
    const grid = parseClipboard(text);
    // Single value or empty — let the input handle it normally
    if (grid.length === 0) return;
    if (grid.length === 1 && grid[0].length === 1) return;

    e.preventDefault();

    const neededRows = r + grid.length;
    const neededCols = c + Math.max(...grid.map((row) => row.length));

    // Expand columns if needed
    const newColumnIds: ImportColumn[] = [];
    while (state.columns.length + newColumnIds.length < neededCols) {
      newColumnIds.push({ id: makeColumnId(), field: "" });
    }
    const columns = [...state.columns, ...newColumnIds];

    // Pad existing rows for new columns
    const padded = state.rows.map((row) => {
      const out = [...row];
      while (out.length < columns.length) out.push("");
      return out;
    });

    // Expand rows if needed
    while (padded.length < neededRows) {
      padded.push(columns.map(() => ""));
    }

    // Write the grid
    for (let i = 0; i < grid.length; i++) {
      for (let j = 0; j < grid[i].length; j++) {
        padded[r + i][c + j] = grid[i][j];
      }
    }

    onChange({ ...state, columns, rows: padded });
  }

  function updateColumnField(c: number, field: string) {
    const columns = state.columns.map((col, ci) =>
      ci === c ? { ...col, field } : col,
    );
    onChange({ ...state, columns });
  }

  function addRow() {
    const rows = [...state.rows, state.columns.map(() => "")];
    onChange({ ...state, rows });
  }

  function addColumn() {
    const columns = [...state.columns, { id: makeColumnId(), field: "" }];
    const rows = state.rows.map((row) => [...row, ""]);
    onChange({ ...state, columns, rows });
  }

  function removeColumn(c: number) {
    const columns = state.columns.filter((_, ci) => ci !== c);
    const rows = state.rows.map((row) => row.filter((_, ci) => ci !== c));
    onChange({ ...state, columns, rows });
  }

  function removeRow(r: number) {
    const rows = state.rows.filter((_, ri) => ri !== r);
    onChange({ ...state, rows });
  }

  return (
    <GlassCard padding={false}>
      <div className="p-4 flex items-center gap-3 border-b border-[var(--glass-border)]">
        <button
          type="button"
          aria-label="Add row"
          onClick={addRow}
          className="flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-white"
        >
          <Plus className="h-4 w-4" /> Row
        </button>
        <button
          type="button"
          aria-label="Add column"
          onClick={addColumn}
          className="flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-white"
        >
          <Plus className="h-4 w-4" /> Column
        </button>
        <span id={labelId} className="sr-only">
          Import table — header cells choose the canonical field for each column
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" aria-labelledby={labelId}>
          <thead>
            <tr className="border-b border-[var(--glass-border)]">
              {state.columns.map((col, ci) => (
                <th key={col.id} className="px-3 py-2 align-bottom">
                  <div className="flex items-center gap-2">
                    <GlassSelect
                      options={options}
                      value={col.field}
                      onChange={(e) => updateColumnField(ci, e.target.value)}
                    />
                    <button
                      type="button"
                      aria-label="Remove column"
                      onClick={() => removeColumn(ci)}
                      className="text-[var(--text-muted)] hover:text-red-400"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  {col.originalHeader && (
                    <div className="mt-1 text-xs font-mono text-[var(--text-muted)] truncate">
                      {col.originalHeader}
                    </div>
                  )}
                </th>
              ))}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {state.rows.map((row, ri) => (
              <tr
                key={ri}
                className="border-b border-[var(--glass-border)] last:border-0"
              >
                {row.map((value, ci) => (
                  <td key={ci} className="px-3 py-1">
                    <input
                      type="text"
                      value={value}
                      onChange={(e) => updateCell(ri, ci, e.target.value)}
                      onPaste={(e) => handlePaste(ri, ci, e)}
                      className="w-full bg-transparent border-0 px-1 py-1 text-[var(--text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-orange)] rounded"
                    />
                  </td>
                ))}
                <td className="px-2">
                  <button
                    type="button"
                    aria-label="Remove row"
                    onClick={() => removeRow(ri)}
                    className="text-[var(--text-muted)] hover:text-red-400"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}
