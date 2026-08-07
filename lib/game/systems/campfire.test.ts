import { describe, expect, it } from "vitest";
import { getCampfireSnapshot } from "@/lib/game/systems/campfire";

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
});
