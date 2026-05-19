import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { EventDetectModal } from "./event-detect-modal";

afterEach(cleanup);

const existingEvents = [
  { id: "e1", name: "EthCC Cannes 2026" },
  { id: "e2", name: "ETHGlobal SF" },
];

describe("EventDetectModal", () => {
  it("lists each unknown event with a row", () => {
    render(
      <EventDetectModal
        unknownEvents={["DevCon 7", "ETHWaterloo"]}
        existingEvents={existingEvents}
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByText("DevCon 7")).toBeInTheDocument();
    expect(screen.getByText("ETHWaterloo")).toBeInTheDocument();
  });

  it("defaults each row to 'create' and emits create decisions on confirm", () => {
    const onConfirm = vi.fn();
    render(
      <EventDetectModal
        unknownEvents={["DevCon 7"]}
        existingEvents={existingEvents}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(onConfirm).toHaveBeenCalledWith([
      { name: "DevCon 7", mode: "create", date_start: "" },
    ]);
  });

  it("emits skip decision when skip radio is chosen", () => {
    const onConfirm = vi.fn();
    render(
      <EventDetectModal
        unknownEvents={["DevCon 7"]}
        existingEvents={existingEvents}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    );
    fireEvent.click(screen.getByLabelText(/skip/i));
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(onConfirm).toHaveBeenCalledWith([{ name: "DevCon 7", mode: "skip" }]);
  });

  it("emits map decision with selected event id", () => {
    const onConfirm = vi.fn();
    render(
      <EventDetectModal
        unknownEvents={["DevCon 7"]}
        existingEvents={existingEvents}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    );
    fireEvent.click(screen.getByLabelText(/map to existing/i));
    const select = screen.getByLabelText(/existing event/i);
    fireEvent.change(select, { target: { value: "e1" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(onConfirm).toHaveBeenCalledWith([
      { name: "DevCon 7", mode: "map", eventId: "e1" },
    ]);
  });

  it("calls onCancel when cancel is clicked", () => {
    const onCancel = vi.fn();
    render(
      <EventDetectModal
        unknownEvents={["DevCon 7"]}
        existingEvents={existingEvents}
        onConfirm={() => {}}
        onCancel={onCancel}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
