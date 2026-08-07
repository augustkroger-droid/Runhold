import { describe, expect, it } from "vitest";
import {
  formatCampfireRemaining,
  getCampfireCapacitySnapshot,
  getCampfireSnapshot,
} from "@/lib/game/systems/campfire";

describe("campfire system", () => {
  it("treats expired fire as not burning", () => {
    expect(
      getCampfireSnapshot(
        {
          burnUntil: "2026-08-07T10:00:00.000Z",
          lastFueledAt: "2026-08-07T09:00:00.000Z",
        },
        "2026-08-07T10:01:00.000Z",
      ),
    ).toEqual({
      isBurning: false,
      timer: null,
    });
  });

  it("returns remaining burn timer for active fire", () => {
    const snapshot = getCampfireSnapshot(
      {
        burnUntil: "2026-08-07T10:30:00.000Z",
        lastFueledAt: "2026-08-07T10:00:00.000Z",
      },
      "2026-08-07T10:15:00.000Z",
    );

    expect(snapshot.isBurning).toBe(true);
    expect(snapshot.timer?.remainingMs).toBe(900_000);
  });

  it("tracks burn bar as remaining capacity", () => {
    expect(
      getCampfireCapacitySnapshot(
        { burnUntil: "2026-08-07T22:00:00.000Z" },
        "2026-08-07T10:00:00.000Z",
      ),
    ).toMatchObject({
      remainingMs: 43_200_000,
      maxMs: 86_400_000,
      fillRatio: 0.5,
      woodNeededToFill: 72,
    });
  });

  it("formats campfire time without seconds", () => {
    expect(formatCampfireRemaining(65 * 60_000)).toBe("1h 05m");
    expect(formatCampfireRemaining(25 * 60 * 60_000)).toBe("1d 1h");
    expect(formatCampfireRemaining(0)).toBe("0m");
  });

  it("formats campfire detail time with seconds", () => {
    expect(formatCampfireRemaining(65_000, { includeSeconds: true })).toBe("1m 05s");
    expect(formatCampfireRemaining(3_665_000, { includeSeconds: true })).toBe(
      "1h 01m 05s",
    );
  });
});
