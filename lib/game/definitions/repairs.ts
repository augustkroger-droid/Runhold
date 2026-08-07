import type { BuildingId } from "@/lib/game/definitions/buildings";
import type { ResourceId } from "@/lib/game/definitions/resources";

export type RepairDefinition = {
  buildingId: BuildingId;
  costPer10Hp: Partial<Record<ResourceId, number>>;
  secondsPer10Hp: number;
};

export const REPAIR_DEFINITIONS: readonly RepairDefinition[] = [
  {
    buildingId: "tent",
    costPer10Hp: { wood: 1 },
    secondsPer10Hp: 15,
  },
  {
    buildingId: "wall",
    costPer10Hp: { wood: 1, stone: 1 },
    secondsPer10Hp: 20,
  },
] as const;

export function getRepairDefinition(buildingId: BuildingId): RepairDefinition | null {
  return REPAIR_DEFINITIONS.find((definition) => definition.buildingId === buildingId) ?? null;
}
