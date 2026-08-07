import {
  BUILDING_DEFINITIONS,
  type BuildingId,
  type BuildingState,
  isBuildingId,
} from "@/lib/game/definitions/buildings";

export type PlayerBuilding = {
  buildingId: BuildingId;
  level: number;
  currentHp: number;
  maxHp: number;
  state: BuildingState;
};

export type PlayerBuildingRow = {
  user_id: string;
  building_id: string;
  level: number;
  current_hp: number;
  max_hp: number;
  state: BuildingState;
  created_at: string;
  updated_at: string;
};

export function mapPlayerBuildingRows(
  rows: readonly PlayerBuildingRow[],
): PlayerBuilding[] {
  const byId = new Map<string, PlayerBuildingRow>();

  for (const row of rows) {
    byId.set(row.building_id, row);
  }

  return BUILDING_DEFINITIONS.map((definition) => {
    const row = byId.get(definition.id);

    if (!row || !isBuildingId(row.building_id)) {
      return {
        buildingId: definition.id,
        level: definition.initialLevel,
        currentHp:
          definition.usesHp && definition.initialState !== "not_built"
            ? definition.baseMaxHp
            : 0,
        maxHp: definition.baseMaxHp,
        state: definition.initialState,
      };
    }

    return {
      buildingId: row.building_id,
      level: row.level,
      currentHp: row.current_hp,
      maxHp: row.max_hp,
      state: row.state,
    };
  });
}
