import type { BuildingId } from "@/lib/game/definitions/buildings";
import type { ResourceId } from "@/lib/game/definitions/resources";

export const TECH_IDS = [
  "basic_wall",
  "improved_scanner",
  "iron_discovery",
] as const;

export type TechId = (typeof TECH_IDS)[number];

export type TechUnlock =
  | { type: "building"; targetId: BuildingId }
  | { type: "scanner"; targetId: "scanner_radius" }
  | { type: "resource"; targetId: string };

export type TechDefinition = {
  id: TechId;
  name: string;
  description: string;
  xpCost: number;
  resourceCost: Partial<Record<ResourceId, number>>;
  prerequisites: readonly TechId[];
  unlock: TechUnlock;
  sortOrder: number;
};

export const TECH_DEFINITIONS: readonly TechDefinition[] = [
  {
    id: "basic_wall",
    name: "Enkel mur",
    description: "Lär lägret att resa en första skyddande mur.",
    xpCost: 50,
    resourceCost: {},
    prerequisites: [],
    unlock: { type: "building", targetId: "wall" },
    sortOrder: 10,
  },
  {
    id: "improved_scanner",
    name: "Förbättrad scanner",
    description: "Förbereder längre scanner-radie för framtida expeditioner.",
    xpCost: 100,
    resourceCost: {},
    prerequisites: ["basic_wall"],
    unlock: { type: "scanner", targetId: "scanner_radius" },
    sortOrder: 20,
  },
  {
    id: "iron_discovery",
    name: "Järnfynd",
    description: "Gör lägret redo att upptäcka järn senare.",
    xpCost: 150,
    resourceCost: {},
    prerequisites: ["basic_wall"],
    unlock: { type: "resource", targetId: "iron" },
    sortOrder: 30,
  },
] as const;

export function isTechId(value: string): value is TechId {
  return TECH_IDS.includes(value as TechId);
}

export function getTechDefinition(techId: TechId): TechDefinition {
  const definition = TECH_DEFINITIONS.find((tech) => tech.id === techId);

  if (!definition) {
    throw new Error(`Unknown tech definition: ${techId}`);
  }

  return definition;
}
