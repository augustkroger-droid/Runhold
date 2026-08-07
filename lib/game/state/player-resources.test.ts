import { describe, expect, it } from "vitest";
import {
  createEmptyResourceBalanceMap,
  mapPlayerResourceRows,
} from "@/lib/game/state/player-resources";

describe("player resources", () => {
  it("starts every known resource at zero", () => {
    expect(createEmptyResourceBalanceMap()).toEqual({
      wood: 0,
      stone: 0,
      food: 0,
    });
  });

  it("maps known resource rows and ignores unknown future data safely", () => {
    expect(
      mapPlayerResourceRows([
        { resource_id: "wood", quantity: 12 },
        { resource_id: "stone", quantity: 4 },
        { resource_id: "crystal", quantity: 99 },
      ]),
    ).toEqual({
      wood: 12,
      stone: 4,
      food: 0,
    });
  });
});
