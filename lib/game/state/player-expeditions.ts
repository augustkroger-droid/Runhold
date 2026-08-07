export type PlayerExpedition = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  distanceM: number;
  durationSeconds: number;
  xpEarned: number;
  resourceHaul: Record<string, number>;
};

export type PlayerExpeditionRow = {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  distance_m: number;
  duration_seconds: number;
  xp_earned: number;
  resource_haul?: Record<string, number> | null;
};

export function mapPlayerExpeditionRow(row: PlayerExpeditionRow): PlayerExpedition {
  return {
    id: row.id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    distanceM: row.distance_m,
    durationSeconds: row.duration_seconds,
    xpEarned: row.xp_earned,
    resourceHaul: row.resource_haul ?? {},
  };
}
