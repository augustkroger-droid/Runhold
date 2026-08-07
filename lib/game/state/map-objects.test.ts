import { describe, expect, it } from "vitest";
import { mapPlayerMapObjectRows } from "@/lib/game/state/map-objects";

describe("map object state", () => {
  it("maps known resource objects and ignores unknown resource ids", () => {
    expect(
      mapPlayerMapObjectRows([
        {
          id: "object-1",
          object_kind: "resource",
          resource_id: "wood",
          quantity: 5,
          lat: 57.1,
          lng: 14.2,
          distance_m: 30,
        },
        {
          id: "object-2",
          object_kind: "resource",
          resource_id: "future_resource",
          quantity: 1,
          lat: 57.1,
          lng: 14.2,
          distance_m: 40,
        },
      ]),
    ).toEqual([
      {
        id: "object-1",
        objectKind: "resource",
        resourceId: "wood",
        quantity: 5,
        position: { lat: 57.1, lng: 14.2 },
        distanceM: 30,
      },
    ]);
  });

  it("maps chest objects without revealing a resource id", () => {
    expect(
      mapPlayerMapObjectRows([
        {
          id: "chest-1",
          object_kind: "chest",
          resource_id: null,
          quantity: 1,
          lat: 57.2,
          lng: 14.3,
          distance_m: 120,
        },
      ]),
    ).toEqual([
      {
        id: "chest-1",
        objectKind: "chest",
        resourceId: null,
        quantity: 1,
        position: { lat: 57.2, lng: 14.3 },
        distanceM: 120,
      },
    ]);
  });
});
