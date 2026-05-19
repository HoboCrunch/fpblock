import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ImportTable } from "./import-table";
import { PERSON_FIELDS } from "@/lib/uploads/field-sets";

afterEach(cleanup);

const emptyState = {
  mode: "persons" as const,
  columns: [
    { id: "c1", field: "full_name" },
    { id: "c2", field: "email" },
  ],
  rows: [
    ["Alice", "alice@example.com"],
    ["", ""],
  ],
};

describe("ImportTable", () => {
  it("renders one header select per column and one input per cell", () => {
    render(
      <ImportTable
        state={emptyState}
        onChange={() => {}}
        fieldSet={PERSON_FIELDS}
      />
    );
    // 2 columns -> 2 header selects
    expect(screen.getAllByRole("combobox")).toHaveLength(2);
    // 2 rows × 2 cols = 4 inputs
    expect(screen.getAllByRole("textbox")).toHaveLength(4);
  });

  it("fires onChange with updated cell value when typing", () => {
    const onChange = vi.fn();
    render(
      <ImportTable
        state={emptyState}
        onChange={onChange}
        fieldSet={PERSON_FIELDS}
      />
    );
    const cells = screen.getAllByRole("textbox");
    fireEvent.change(cells[0], { target: { value: "Bob" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0];
    expect(next.rows[0][0]).toBe("Bob");
  });

  it("fires onChange with updated column field when header select changes", () => {
    const onChange = vi.fn();
    render(
      <ImportTable
        state={emptyState}
        onChange={onChange}
        fieldSet={PERSON_FIELDS}
      />
    );
    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[0], { target: { value: "first_name" } });
    const next = onChange.mock.calls[0][0];
    expect(next.columns[0].field).toBe("first_name");
  });

  it("adds a new empty row when + Row is clicked", () => {
    const onChange = vi.fn();
    render(
      <ImportTable
        state={emptyState}
        onChange={onChange}
        fieldSet={PERSON_FIELDS}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /add row/i }));
    const next = onChange.mock.calls[0][0];
    expect(next.rows).toHaveLength(3);
    expect(next.rows[2]).toEqual(["", ""]);
  });

  it("adds a new column with empty field and corresponding empty cells", () => {
    const onChange = vi.fn();
    render(
      <ImportTable
        state={emptyState}
        onChange={onChange}
        fieldSet={PERSON_FIELDS}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /add column/i }));
    const next = onChange.mock.calls[0][0];
    expect(next.columns).toHaveLength(3);
    expect(next.rows[0]).toHaveLength(3);
    expect(next.rows[0][2]).toBe("");
  });

  it("removes a column and its cells", () => {
    const onChange = vi.fn();
    render(
      <ImportTable
        state={emptyState}
        onChange={onChange}
        fieldSet={PERSON_FIELDS}
      />
    );
    const removeCol = screen.getAllByRole("button", { name: /remove column/i })[0];
    fireEvent.click(removeCol);
    const next = onChange.mock.calls[0][0];
    expect(next.columns).toHaveLength(1);
    expect(next.rows[0]).toEqual(["alice@example.com"]);
  });

  it("removes a row", () => {
    const onChange = vi.fn();
    render(
      <ImportTable
        state={emptyState}
        onChange={onChange}
        fieldSet={PERSON_FIELDS}
      />
    );
    const removeRow = screen.getAllByRole("button", { name: /remove row/i })[0];
    fireEvent.click(removeRow);
    const next = onChange.mock.calls[0][0];
    expect(next.rows).toHaveLength(1);
    expect(next.rows[0]).toEqual(["", ""]);
  });
});

describe("ImportTable paste", () => {
  it("spreads TSV paste from the focused cell across rows and columns", () => {
    const onChange = vi.fn();
    render(
      <ImportTable
        state={{
          mode: "persons",
          columns: [
            { id: "c1", field: "full_name" },
            { id: "c2", field: "email" },
          ],
          rows: [
            ["", ""],
            ["", ""],
          ],
        }}
        onChange={onChange}
        fieldSet={PERSON_FIELDS}
      />
    );
    const cells = screen.getAllByRole("textbox");
    // Focus row 0, col 0; paste "Alice\talice\nBob\tbob"
    fireEvent.paste(cells[0], {
      clipboardData: { getData: () => "Alice\talice\nBob\tbob" },
    });
    const next = onChange.mock.calls[0][0];
    expect(next.rows[0]).toEqual(["Alice", "alice"]);
    expect(next.rows[1]).toEqual(["Bob", "bob"]);
  });

  it("expands rows/columns when paste exceeds current dimensions", () => {
    const onChange = vi.fn();
    render(
      <ImportTable
        state={{
          mode: "persons",
          columns: [{ id: "c1", field: "full_name" }],
          rows: [[""]],
        }}
        onChange={onChange}
        fieldSet={PERSON_FIELDS}
      />
    );
    const cells = screen.getAllByRole("textbox");
    fireEvent.paste(cells[0], {
      clipboardData: { getData: () => "a\tb\n1\t2" },
    });
    const next = onChange.mock.calls[0][0];
    expect(next.columns).toHaveLength(2);
    expect(next.rows).toHaveLength(2);
    expect(next.rows[0]).toEqual(["a", "b"]);
    expect(next.rows[1]).toEqual(["1", "2"]);
  });

  it("treats a single-value paste as a normal input change (no spread)", () => {
    const onChange = vi.fn();
    render(
      <ImportTable
        state={{
          mode: "persons",
          columns: [{ id: "c1", field: "full_name" }],
          rows: [[""]],
        }}
        onChange={onChange}
        fieldSet={PERSON_FIELDS}
      />
    );
    const cells = screen.getAllByRole("textbox");
    fireEvent.paste(cells[0], {
      clipboardData: { getData: () => "Alice" },
    });
    // Should NOT call onChange from paste handler; the input's onChange fires naturally.
    expect(onChange).not.toHaveBeenCalled();
  });
});
