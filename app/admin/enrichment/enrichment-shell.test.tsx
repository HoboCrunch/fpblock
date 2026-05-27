import { describe, it, expect } from "vitest";
import { reseedSelection } from "./enrichment-shell";

const set = (...ids: string[]) => new Set(ids);

describe("reseedSelection", () => {
  it("auto-checks newly visible rows when the filter changes", () => {
    const next = reseedSelection({
      prevSelected: set("a"),
      prevVisible: set("a"),
      nextVisible: set("a", "b", "c"),
      filterChanged: true,
      suppressAutoAdd: false,
    });
    // a kept (still visible), b + c newly visible → auto-checked
    expect(next).toEqual(set("a", "b", "c"));
  });

  it("keeps prior selection untouched on a pure refetch (same visible set, no filter change)", () => {
    const prevSelected = set("a");
    const next = reseedSelection({
      prevSelected,
      prevVisible: set("a", "b", "c"),
      nextVisible: set("a", "b", "c"),
      filterChanged: false,
      suppressAutoAdd: false,
    });
    // Identical visible set + no filter change → no re-seed, same reference back
    expect(next).toBe(prevSelected);
  });

  it("does NOT re-check cleared rows when a refetch hands a new array identity (the reported bug)", () => {
    // User cleared everything, then a background refetch fires the effect again
    // with the same visible rows. Nothing should get re-checked.
    const next = reseedSelection({
      prevSelected: set(), // user just cleared
      prevVisible: set("a", "b", "c"),
      nextVisible: set("a", "b", "c"),
      filterChanged: false,
      suppressAutoAdd: false,
    });
    expect(next).toEqual(set());
  });

  it("respects explicit Clear intent even if the visible set looks new", () => {
    // Edge: refetch changes the visible set slightly but the user just clicked
    // Clear; suppressAutoAdd guards against re-adding the just-cleared rows.
    const next = reseedSelection({
      prevSelected: set(),
      prevVisible: set("a", "b"),
      nextVisible: set("a", "b", "c"),
      filterChanged: true, // even if filter changed, Clear intent wins this cycle
      suppressAutoAdd: true,
    });
    expect(next).toEqual(set());
  });

  it("drops rows that left the visible set", () => {
    const next = reseedSelection({
      prevSelected: set("a", "b"),
      prevVisible: set("a", "b", "c"),
      nextVisible: set("a"), // b and c filtered out
      filterChanged: true,
      suppressAutoAdd: false,
    });
    expect(next).toEqual(set("a"));
  });

  it("preserves manual deselection across a no-op refilter", () => {
    // User unchecked b; a refilter produces the same visible set without a
    // filter-key change → b must stay unchecked.
    const prevSelected = set("a", "c");
    const next = reseedSelection({
      prevSelected,
      prevVisible: set("a", "b", "c"),
      nextVisible: set("a", "b", "c"),
      filterChanged: false,
      suppressAutoAdd: false,
    });
    expect(next).toBe(prevSelected);
    expect(next.has("b")).toBe(false);
  });
});
