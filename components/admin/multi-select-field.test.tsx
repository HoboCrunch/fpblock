import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MultiSelectField } from "./multi-select-field";

afterEach(cleanup);

describe("MultiSelectField", () => {
  const options = [
    { value: "a", label: "Alpha" },
    { value: "b", label: "Beta" },
    { value: "c", label: "Gamma" },
  ];

  it("shows placeholder when no values selected", () => {
    render(
      <MultiSelectField
        placeholder="Pick one"
        options={options}
        values={[]}
        onChange={() => {}}
      />
    );
    expect(screen.getByText("Pick one")).toBeInTheDocument();
  });

  it("shows count when multiple values selected", () => {
    render(
      <MultiSelectField
        placeholder="Pick one"
        options={options}
        values={["a", "b"]}
        onChange={() => {}}
      />
    );
    expect(screen.getByText("2 selected")).toBeInTheDocument();
  });

  it("shows the single selected label when one value selected", () => {
    render(
      <MultiSelectField
        placeholder="Pick one"
        options={options}
        values={["b"]}
        onChange={() => {}}
      />
    );
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("calls onChange with toggled value when option clicked", () => {
    const onChange = vi.fn();
    render(
      <MultiSelectField
        placeholder="Pick"
        options={options}
        values={["a"]}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getAllByRole("button", { name: /pick|alpha/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Beta" }));
    expect(onChange).toHaveBeenCalledWith(["a", "b"]);
  });

  it("calls onChange clearing all when X clicked", () => {
    const onChange = vi.fn();
    render(
      <MultiSelectField
        placeholder="Pick"
        options={options}
        values={["a", "b"]}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByLabelText("Clear selection"));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
