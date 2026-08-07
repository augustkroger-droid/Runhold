import {
  RESOURCE_DEFINITIONS,
  type ResourceId,
  isResourceId,
} from "@/lib/game/definitions/resources";

export type ResourceBalanceMap = Record<ResourceId, number>;

export type PlayerResourceRow = {
  user_id: string;
  resource_id: string;
  quantity: number;
  created_at: string;
  updated_at: string;
};

export function createEmptyResourceBalanceMap(): ResourceBalanceMap {
  return Object.fromEntries(
    RESOURCE_DEFINITIONS.map((resource) => [resource.id, 0]),
  ) as ResourceBalanceMap;
}

export function mapPlayerResourceRows(
  rows: readonly Pick<PlayerResourceRow, "resource_id" | "quantity">[],
): ResourceBalanceMap {
  const balances = createEmptyResourceBalanceMap();

  for (const row of rows) {
    if (isResourceId(row.resource_id)) {
      balances[row.resource_id] = Math.max(0, row.quantity);
    }
  }

  return balances;
}
