import {
  type ResourceId,
  isResourceId,
} from "@/lib/game/definitions/resources";
import type { Coordinate } from "@/lib/game/gps/position";

export type PlayerMapObject = {
  id: string;
  resourceId: ResourceId;
  quantity: number;
  position: Coordinate;
  distanceM: number;
};

export type PlayerMapObjectRow = {
  id: string;
  resource_id: string;
  quantity: number;
  lat: number;
  lng: number;
  distance_m: number;
};

export function mapPlayerMapObjectRows(
  rows: readonly PlayerMapObjectRow[],
): PlayerMapObject[] {
  return rows
    .filter((row): row is PlayerMapObjectRow & { resource_id: ResourceId } =>
      isResourceId(row.resource_id),
    )
    .map((row) => ({
      id: row.id,
      resourceId: row.resource_id,
      quantity: row.quantity,
      position: {
        lat: row.lat,
        lng: row.lng,
      },
      distanceM: row.distance_m,
    }));
}
