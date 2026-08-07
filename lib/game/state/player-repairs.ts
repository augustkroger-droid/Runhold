import {
  type BuildingId,
  isBuildingId,
} from "@/lib/game/definitions/buildings";

export type RepairStatus = "active" | "completed" | "cancelled";

export type PlayerRepair = {
  id: string;
  buildingId: BuildingId;
  status: RepairStatus;
  startsAt: string;
  completesAt: string;
  repairedHp: number;
  cost: Record<string, number>;
};

export type PlayerRepairRow = {
  id: string;
  user_id: string;
  building_id: string;
  status: RepairStatus;
  starts_at: string;
  completes_at: string;
  repaired_hp: number;
  cost: Record<string, number>;
};

export function mapPlayerRepairRows(rows: readonly PlayerRepairRow[]): PlayerRepair[] {
  return rows
    .filter((row): row is PlayerRepairRow & { building_id: BuildingId } =>
      isBuildingId(row.building_id),
    )
    .map((row) => ({
      id: row.id,
      buildingId: row.building_id,
      status: row.status,
      startsAt: row.starts_at,
      completesAt: row.completes_at,
      repairedHp: row.repaired_hp,
      cost: row.cost ?? {},
    }));
}
