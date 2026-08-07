import {
  type ConstructionId,
  CONSTRUCTION_DEFINITIONS,
} from "@/lib/game/definitions/construction";
import type { BuildingId } from "@/lib/game/definitions/buildings";

export type ConstructionStatus = "active" | "completed" | "cancelled";

export type PlayerConstruction = {
  id: string;
  constructionId: ConstructionId;
  targetBuildingId: BuildingId;
  status: ConstructionStatus;
  startsAt: string;
  completesAt: string;
  completedAt: string | null;
};

export type PlayerConstructionRow = {
  id: string;
  user_id: string;
  construction_id: string;
  target_building_id: string;
  status: ConstructionStatus;
  starts_at: string;
  completes_at: string;
  completed_at: string | null;
  cost: Record<string, number>;
  created_at: string;
  updated_at: string;
};

export function mapPlayerConstructionRows(
  rows: readonly PlayerConstructionRow[],
): PlayerConstruction[] {
  const knownIds = new Set(CONSTRUCTION_DEFINITIONS.map((definition) => definition.id));

  return rows
    .filter((row) => knownIds.has(row.construction_id as ConstructionId))
    .map((row) => ({
      id: row.id,
      constructionId: row.construction_id as ConstructionId,
      targetBuildingId: row.target_building_id as BuildingId,
      status: row.status,
      startsAt: row.starts_at,
      completesAt: row.completes_at,
      completedAt: row.completed_at,
    }));
}
