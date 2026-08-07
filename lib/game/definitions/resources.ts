export const RESOURCE_IDS = ["wood", "stone", "food"] as const;

export type ResourceId = (typeof RESOURCE_IDS)[number];

export type ResourceRarity = "common" | "uncommon" | "rare";

export type ResourceDefinition = {
  id: ResourceId;
  name: string;
  icon: string;
  rarity: ResourceRarity;
  spawnWeight: number;
  minUnlockLevel: number;
  requiredTech: string | null;
  inventoryBehavior: "stackable";
};

export const RESOURCE_DEFINITIONS: readonly ResourceDefinition[] = [
  {
    id: "wood",
    name: "Trä",
    icon: "W",
    rarity: "common",
    spawnWeight: 45,
    minUnlockLevel: 1,
    requiredTech: null,
    inventoryBehavior: "stackable",
  },
  {
    id: "stone",
    name: "Sten",
    icon: "S",
    rarity: "common",
    spawnWeight: 35,
    minUnlockLevel: 1,
    requiredTech: null,
    inventoryBehavior: "stackable",
  },
  {
    id: "food",
    name: "Mat",
    icon: "F",
    rarity: "common",
    spawnWeight: 25,
    minUnlockLevel: 1,
    requiredTech: null,
    inventoryBehavior: "stackable",
  },
] as const;

export function isResourceId(value: string): value is ResourceId {
  return RESOURCE_IDS.includes(value as ResourceId);
}
