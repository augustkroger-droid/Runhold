import { describe, expect, it } from "vitest";
import { calculateExpeditionXp } from "@/lib/game/systems/expedition";

describe("expedition system", () => {
  it("does not reward tiny expeditions", () => {
    expect(calculateExpeditionXp({ distanceM: 80, durationSeconds: 60 })).toBe(0);
  });

  it("rewards distance with a small pace bonus", () => {
    expect(calculateExpeditionXp({ distanceM: 1000, durationSeconds: 360 })).toBe(24);
  });
});
