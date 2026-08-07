import { describe, expect, it } from "vitest";
import {
  createTimer,
  formatRemainingDuration,
  getTimerSnapshot,
} from "@/lib/game/systems/timers";

describe("game timers", () => {
  it("creates timers from server-style timestamps and durations", () => {
    expect(
      createTimer({
        id: "build-wall",
        startsAt: "2026-08-07T10:00:00.000Z",
        durationMs: 30_000,
      }),
    ).toEqual({
      id: "build-wall",
      startsAt: "2026-08-07T10:00:00.000Z",
      completesAt: "2026-08-07T10:00:30.000Z",
    });
  });

  it("computes active progress from timestamps after restart", () => {
    const timer = {
      startsAt: "2026-08-07T10:00:00.000Z",
      completesAt: "2026-08-07T10:10:00.000Z",
    };

    expect(getTimerSnapshot(timer, "2026-08-07T10:05:00.000Z")).toEqual({
      status: "active",
      totalMs: 600_000,
      elapsedMs: 300_000,
      remainingMs: 300_000,
      progress: 0.5,
    });
  });

  it("marks completed timers from timestamps alone", () => {
    expect(
      getTimerSnapshot(
        {
          startsAt: "2026-08-07T10:00:00.000Z",
          completesAt: "2026-08-07T10:10:00.000Z",
        },
        "2026-08-07T10:11:00.000Z",
      ).status,
    ).toBe("completed");
  });

  it("formats remaining time compactly", () => {
    expect(formatRemainingDuration(3_665_000)).toBe("1h 01m");
    expect(formatRemainingDuration(65_000)).toBe("1m 05s");
  });
});
