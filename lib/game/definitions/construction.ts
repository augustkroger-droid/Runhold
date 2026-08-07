import type { ResourceId } from "@/lib/game/definitions/resources";
import type { BuildingId } from "@/lib/game/definitions/buildings";

export const CONSTRUCTION_IDS = ["wall_level_1"] as const;

export type ConstructionId = (typeof CONSTRUCTION_IDS)[number];

export type ConstructionCost = Partial<Record<ResourceId, number>>;

export type ConstructionDefinition = {
  id: ConstructionId;
  name: string;
  description: string;
  targetBuildingId: BuildingId;
  resultingLevel: number;
  cost: ConstructionCost;
  durationSeconds: number;
};

export const CONSTRUCTION_DEFINITIONS: readonly ConstructionDefinition[] = [
  {
    id: "wall_level_1",
    name: "Bygg mur",
    description: "Res en enkel mur runt lägret.",
    targetBuildingId: "wall",
    resultingLevel: 1,
    cost: {
      wood: 20,
      stone: 15,
    },
    durationSeconds: 120,
  },
] as const;

export function getConstructionDefinition(
  constructionId: ConstructionId,
): ConstructionDefinition {
  const definition = CONSTRUCTION_DEFINITIONS.find(
    (construction) => construction.id === constructionId,
  );

  if (!definition) {
    throw new Error(`Unknown construction definition: ${constructionId}`);
  }

  return definition;
}
