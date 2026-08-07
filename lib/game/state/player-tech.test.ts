import { describe, expect, it } from "vitest";
import {
  createUnlockedTechSet,
  isTechAvailable,
  mapPlayerTechRows,
} from "@/lib/game/state/player-tech";

describe("player tech state", () => {
  it("maps known tech rows and ignores unknown rows", () => {
    expect(
      mapPlayerTechRows([
        {
          user_id: "user-1",
          tech_id: "basic_wall",
          unlocked_at: "2026-08-07T10:00:00.000Z",
        },
        {
          user_id: "user-1",
          tech_id: "future_node",
          unlocked_at: "2026-08-07T10:00:00.000Z",
        },
      ]),
    ).toEqual([
      {
        techId: "basic_wall",
        unlockedAt: "2026-08-07T10:00:00.000Z",
      },
    ]);
  });

  it("checks prerequisites", () => {
    const empty = createUnlockedTechSet([]);
    expect(isTechAvailable("basic_wall", empty)).toBe(true);
    expect(isTechAvailable("improved_scanner", empty)).toBe(false);

    const withWall = createUnlockedTechSet([
      { techId: "basic_wall", unlockedAt: "2026-08-07T10:00:00.000Z" },
    ]);
    expect(isTechAvailable("improved_scanner", withWall)).toBe(true);
  });
});
