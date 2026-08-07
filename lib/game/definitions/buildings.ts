import type { TechId } from "@/lib/game/definitions/tech";

export const BUILDING_IDS = ["tent", "campfire", "wall"] as const;

export type BuildingId = (typeof BUILDING_IDS)[number];

export type BuildingState = "active" | "not_built" | "damaged" | "destroyed";

export type BuildingDefinition = {
  id: BuildingId;
  name: string;
  description: string;
  categoryId: "camp" | "defense";
  baseMaxHp: number;
  usesHp: boolean;
  requiredTech: TechId | null;
  initialLevel: number;
  initialState: BuildingState;
  sortOrder: number;
};

export const BUILDING_DEFINITIONS: readonly BuildingDefinition[] = [
  {
    id: "tent",
    name: "Tält",
    description: "Första lägret och basens enkla centrum.",
    categoryId: "camp",
    baseMaxHp: 80,
    usesHp: true,
    requiredTech: null,
    initialLevel: 1,
    initialState: "active",
    sortOrder: 10,
  },
  {
    id: "campfire",
    name: "Lägereld",
    description: "Håller mörkret borta och behöver fyllas med trä.",
    categoryId: "camp",
    baseMaxHp: 0,
    usesHp: false,
    requiredTech: null,
    initialLevel: 1,
    initialState: "active",
    sortOrder: 20,
  },
  {
    id: "wall",
    name: "Mur",
    description: "Första försvarslinjen runt lägret.",
    categoryId: "defense",
    baseMaxHp: 100,
    usesHp: true,
    requiredTech: "basic_wall",
    initialLevel: 0,
    initialState: "not_built",
    sortOrder: 30,
  },
] as const;

export function isBuildingId(value: string): value is BuildingId {
  return BUILDING_IDS.includes(value as BuildingId);
}
