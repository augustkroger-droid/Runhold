import {
  type ResourceId,
  isResourceId,
} from "@/lib/game/definitions/resources";
import type { MapObjectKind } from "@/lib/game/definitions/map-objects";
import type { Coordinate } from "@/lib/game/gps/position";

export type PlayerMapObject = {
  id: string;
  objectKind: MapObjectKind;
  resourceId: ResourceId | null;
  quantity: number;
  position: Coordinate;
  distanceM: number;
};

export type PlayerMapObjectRow = {
  id: string;
  object_kind?: string;
  resource_id: string | null;
  quantity: number;
  lat: number;
  lng: number;
  distance_m: number;
};

export function mapPlayerMapObjectRows(
  rows: readonly PlayerMapObjectRow[],
): PlayerMapObject[] {
  return rows
    .filter((row) => {
      if (row.object_kind === "chest") return true;
      return typeof row.resource_id === "string" && isResourceId(row.resource_id);
    })
    .map((row) => ({
      id: row.id,
      objectKind: row.object_kind === "chest" ? "chest" : "resource",
      resourceId:
        typeof row.resource_id === "string" && isResourceId(row.resource_id)
          ? row.resource_id
          : null,
      quantity: row.quantity,
      position: {
        lat: row.lat,
        lng: row.lng,
      },
      distanceM: row.distance_m,
    }));
}
