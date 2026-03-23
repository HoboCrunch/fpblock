import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MuteState } from "../../src/menus/settings.js";

describe("MuteState", () => {
  let mute: MuteState;

  beforeEach(() => {
    mute = new MuteState();
  });

  it("starts unmuted", () => {
    expect(mute.isMuted()).toBe(false);
  });

  it("mutes for specified duration", () => {
    mute.muteFor(60);
    expect(mute.isMuted()).toBe(true);
  });

  it("unmutes manually", () => {
    mute.muteFor(60);
    mute.unmute();
    expect(mute.isMuted()).toBe(false);
  });

  it("auto-unmutes after duration expires", () => {
    vi.useFakeTimers();
    mute.muteFor(1); // 1 minute
    expect(mute.isMuted()).toBe(true);
    vi.advanceTimersByTime(61 * 1000);
    expect(mute.isMuted()).toBe(false);
    vi.useRealTimers();
  });
});
