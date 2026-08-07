export const BUILDING_IDS = ["tent", "campfire", "wall"] as const;

export type BuildingId = (typeof BUILDING_IDS)[number];

export type BuildingState = "active" | "not_built" | "damaged" | "destroyed";

export type BuildingDefinition = {
  id: BuildingId;
  name: string;
  description: string;
  baseMaxHp: number;
  usesHp: boolean;
  initialLevel: number;
  initialState: BuildingState;
  sortOrder: number;
};

export const BUILDING_DEFINITIONS: readonly BuildingDefinition[] = [
  {
    id: "tent",
    name: "Tält",
    description: "Första lägret och basens enkla centrum.",
    baseMaxHp: 80,
    usesHp: true,
    initialLevel: 1,
    initialState: "active",
    sortOrder: 10,
  },
  {
    id: "campfire",
    name: "Lägereld",
    description: "Håller mörkret borta. Kan fyllas med trä men har ingen HP just nu.",
    baseMaxHp: 0,
    usesHp: false,
    initialLevel: 1,
    initialState: "active",
    sortOrder: 20,
  },
  {
    id: "wall",
    name: "Mur",
    description: "En framtida första försvarslinje mot raids.",
    baseMaxHp: 100,
    usesHp: true,
    initialLevel: 0,
    initialState: "not_built",
    sortOrder: 30,
  },
] as const;

export function isBuildingId(value: string): value is BuildingId {
  return BUILDING_IDS.includes(value as BuildingId);
}
