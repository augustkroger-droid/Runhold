import { describe, expect, it } from "vitest";
import {
  createManualRouteDraft,
  createSuggestedRouteDraft,
} from "@/lib/game/systems/route-planner";
import type { PlayerMapObject } from "@/lib/game/state/map-objects";

const start = { lat: 57.78, lng: 14.16 };

function object(
  id: string,
  resourceId: PlayerMapObject["resourceId"],
  quantity: number,
  latOffset: number,
): PlayerMapObject {
  return {
    id,
    objectKind: "resource",
    resourceId,
    quantity,
    position: { lat: start.lat + latOffset, lng: start.lng },
    distanceM: 0,
  };
}

describe("route planner", () => {
  it("suggests a round trip route for matching resource focus", () => {
    const draft = createSuggestedRouteDraft({
      start,
      objects: [
        object("wood-1", "wood", 4, 0.001),
        object("stone-1", "stone", 20, 0.0012),
        object("wood-2", "wood", 5, 0.0014),
      ],
      focus: "wood",
      targetDistanceM: 1500,
    });

    expect(draft.stops.map((stop) => stop.objectId)).toContain("wood-1");
    expect(draft.stops.map((stop) => stop.objectId)).toContain("wood-2");
    expect(draft.resourceHaul.wood).toBe(9);
    expect(draft.waypointPositions[0]).toEqual(start);
    expect(draft.waypointPositions.at(-1)).toEqual(start);
  });

  it("orders manual stops by route efficiency instead of selected order", () => {
    const far = object("far", "wood", 1, 0.01);
    const near = object("near", "stone", 1, 0.001);
    const draft = createManualRouteDraft({
      start,
      objects: [far, near],
      selectedObjectIds: new Set(["far", "near"]),
    });

    expect(draft.stops[0].objectId).toBe("near");
    expect(draft.stops[1].objectId).toBe("far");
  });

  it("keeps picked stops and fills the route with focused finds", () => {
    const draft = createSuggestedRouteDraft({
      start,
      objects: [
        object("picked-stone", "stone", 1, 0.001),
        object("wood-1", "wood", 4, 0.0012),
        object("wood-2", "wood", 5, 0.0014),
      ],
      focus: "wood",
      targetDistanceM: 1200,
      selectedObjectIds: new Set(["picked-stone"]),
    });

    expect(draft.stops.map((stop) => stop.objectId)).toContain("picked-stone");
    expect(draft.stops.map((stop) => stop.objectId)).toContain("wood-1");
    expect(draft.resourceHaul.stone).toBe(1);
    expect(draft.resourceHaul.wood).toBeGreaterThan(0);
  });
});
