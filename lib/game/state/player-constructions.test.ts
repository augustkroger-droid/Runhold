import { describe, expect, it } from "vitest";
import { mapPlayerConstructionRows } from "@/lib/game/state/player-constructions";

describe("player constructions", () => {
  it("maps known construction rows", () => {
    expect(
      mapPlayerConstructionRows([
        {
          id: "construction-1",
          user_id: "user-1",
          construction_id: "wall_level_1",
          target_building_id: "wall",
          status: "active",
          starts_at: "2026-08-07T10:00:00.000Z",
          completes_at: "2026-08-07T10:02:00.000Z",
          completed_at: null,
          cost: { wood: 20, stone: 15 },
          created_at: "2026-08-07T10:00:00.000Z",
          updated_at: "2026-08-07T10:00:00.000Z",
        },
      ]),
    ).toEqual([
      {
        id: "construction-1",
        constructionId: "wall_level_1",
        targetBuildingId: "wall",
        status: "active",
        startsAt: "2026-08-07T10:00:00.000Z",
        completesAt: "2026-08-07T10:02:00.000Z",
        completedAt: null,
      },
    ]);
  });
});
