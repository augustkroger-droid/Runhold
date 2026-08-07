import type { ResourceId } from "@/lib/game/definitions/resources";

export const MAP_OBJECT_CONFIG = {
  sectorSizeDegrees: 0.01,
  spawnRadiusM: 5000,
  scanRadiusM: 2000,
  improvedScanRadiusM: 2500,
  collectRadiusM: 25,
} as const;

export type MapObjectKind = "resource";

export type MapObjectDefinition = {
  kind: MapObjectKind;
  resourceId: ResourceId;
  minQuantity: number;
  maxQuantity: number;
};

export const MAP_OBJECT_DEFINITIONS: readonly MapObjectDefinition[] = [
  { kind: "resource", resourceId: "wood", minQuantity: 4, maxQuantity: 12 },
  { kind: "resource", resourceId: "stone", minQuantity: 3, maxQuantity: 9 },
  { kind: "resource", resourceId: "food", minQuantity: 2, maxQuantity: 7 },
] as const;
