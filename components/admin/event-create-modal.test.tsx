import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { EventCreateModal } from "./event-create-modal";
import { createEvent } from "@/app/admin/events/actions";

vi.mock("@/app/admin/events/actions", () => ({
  createEvent: vi.fn(),
}));

const mockedCreateEvent = vi.mocked(createEvent);

afterEach(cleanup);
beforeEach(() => {
  mockedCreateEvent.mockReset();
});

describe("EventCreateModal", () => {
  it("disables submit when name is empty", () => {
    render(
      <EventCreateModal onCreated={() => {}} onCancel={() => {}} />
    );
    const submit = screen.getByRole("button", { name: /create event/i });
    expect(submit).toBeDisabled();
  });

  it("enables submit and calls createEvent then onCreated on submit", async () => {
    const created = { id: "ev-1", name: "DevCon 7" };
    mockedCreateEvent.mockResolvedValue(created);
    const onCreated = vi.fn();

    render(<EventCreateModal onCreated={onCreated} onCancel={() => {}} />);

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "DevCon 7" },
    });

    const submit = screen.getByRole("button", { name: /create event/i });
    expect(submit).not.toBeDisabled();
    fireEvent.click(submit);

    await waitFor(() => {
      expect(mockedCreateEvent).toHaveBeenCalledWith(
        expect.objectContaining({ name: "DevCon 7" })
      );
    });
    expect(onCreated).toHaveBeenCalledWith(created);
  });

  it("calls onCancel when cancel is clicked", () => {
    const onCancel = vi.fn();
    render(<EventCreateModal onCreated={() => {}} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
