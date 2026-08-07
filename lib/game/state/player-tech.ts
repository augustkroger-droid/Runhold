import {
  TECH_DEFINITIONS,
  type TechId,
  isTechId,
} from "@/lib/game/definitions/tech";

export type PlayerTech = {
  techId: TechId;
  unlockedAt: string;
};

export type PlayerTechRow = {
  user_id: string;
  tech_id: string;
  unlocked_at: string;
};

export function mapPlayerTechRows(rows: readonly PlayerTechRow[]): PlayerTech[] {
  return rows
    .filter((row): row is PlayerTechRow & { tech_id: TechId } =>
      isTechId(row.tech_id),
    )
    .map((row) => ({
      techId: row.tech_id,
      unlockedAt: row.unlocked_at,
    }));
}

export function createUnlockedTechSet(unlocks: readonly PlayerTech[]): Set<TechId> {
  return new Set(unlocks.map((unlock) => unlock.techId));
}

export function isTechAvailable(
  techId: TechId,
  unlockedTechIds: ReadonlySet<TechId>,
): boolean {
  const definition = TECH_DEFINITIONS.find((tech) => tech.id === techId);

  if (!definition || unlockedTechIds.has(techId)) return false;

  return definition.prerequisites.every((prerequisite) =>
    unlockedTechIds.has(prerequisite),
  );
}
