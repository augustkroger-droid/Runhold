export type PlayerExpedition = {
  id: string;
  startedAt: string;
  endedAt: string;
  distanceM: number;
  durationSeconds: number;
  xpEarned: number;
};

export type PlayerExpeditionRow = {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string;
  distance_m: number;
  duration_seconds: number;
  xp_earned: number;
};

export function mapPlayerExpeditionRow(row: PlayerExpeditionRow): PlayerExpedition {
  return {
    id: row.id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    distanceM: row.distance_m,
    durationSeconds: row.duration_seconds,
    xpEarned: row.xp_earned,
  };
}
