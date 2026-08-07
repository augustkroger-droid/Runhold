import { describe, expect, it } from "vitest";
import { mapPlayerBuildingRows } from "@/lib/game/state/player-buildings";

describe("player buildings", () => {
  it("maps missing rows to the configured initial base", () => {
    expect(mapPlayerBuildingRows([])).toEqual([
      {
        buildingId: "tent",
        level: 1,
        currentHp: 80,
        maxHp: 80,
        state: "active",
      },
      {
        buildingId: "campfire",
        level: 1,
        currentHp: 0,
        maxHp: 0,
        state: "active",
      },
      {
        buildingId: "wall",
        level: 0,
        currentHp: 0,
        maxHp: 100,
        state: "not_built",
      },
    ]);
  });
});
