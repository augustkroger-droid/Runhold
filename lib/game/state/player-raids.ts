export type RaidStatus = "scheduled" | "active" | "resolved";

export type RaidDamageReport = {
  incomingDamage: number;
  blockedDamage: number;
  wallDamage: number;
  tentDamage: number;
  enemyCount: number;
  enemyType: string;
  fireProtected: boolean;
  rewardXp: number;
  outcome: "held" | "damaged" | "breached";
};

export type PlayerRaid = {
  id: string;
  userId: string;
  status: RaidStatus;
  threatLevel: number;
  scheduledAt: string;
  startedAt: string | null;
  resolvedAt: string | null;
  damageReport: Partial<RaidDamageReport>;
  enemyType: string;
  enemyCount: number;
  totalDamage: number;
  reward: Record<string, number>;
};

export type PlayerRaidRow = {
  id: string;
  user_id: string;
  status: RaidStatus;
  threat_level: number;
  scheduled_at: string;
  started_at: string | null;
  resolved_at: string | null;
  damage_report?: Partial<RaidDamageReport> | null;
  enemy_type?: string | null;
  enemy_count?: number | null;
  total_damage?: number | null;
  reward?: Record<string, number> | null;
};

export function mapPlayerRaidRow(row: PlayerRaidRow): PlayerRaid {
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    threatLevel: row.threat_level,
    scheduledAt: row.scheduled_at,
    startedAt: row.started_at,
    resolvedAt: row.resolved_at,
    damageReport: row.damage_report ?? {},
    enemyType: row.enemy_type ?? "raiders",
    enemyCount: row.enemy_count ?? 0,
    totalDamage: row.total_damage ?? 0,
    reward: row.reward ?? {},
  };
}
