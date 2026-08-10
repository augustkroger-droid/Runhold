import { describe, expect, it } from "vitest";
import {
  calculateExpeditionXp,
  calculateRouteDistanceMeters,
} from "@/lib/game/systems/expedition";

describe("expedition system", () => {
  it("rewards one xp per 50 traveled meters", () => {
    expect(calculateExpeditionXp({ distanceM: 49, durationSeconds: 60 })).toBe(0);
    expect(calculateExpeditionXp({ distanceM: 50, durationSeconds: 60 })).toBe(1);
    expect(calculateExpeditionXp({ distanceM: 1000, durationSeconds: 360 })).toBe(20);
  });

  it("adds pickup xp to traveled distance xp", () => {
    expect(
      calculateExpeditionXp({
        distanceM: 500,
        durationSeconds: 180,
        pickupXp: 7,
      }),
    ).toBe(17);
  });

  it("sums traveled route distance instead of start-to-finish distance", () => {
    const distanceM = calculateRouteDistanceMeters([
      { lat: 57.7815, lng: 14.1562 },
      { lat: 57.782, lng: 14.1562 },
      { lat: 57.782, lng: 14.157 },
    ]);

    expect(distanceM).toBeGreaterThan(95);
    expect(distanceM).toBeLessThan(115);
  });
});
