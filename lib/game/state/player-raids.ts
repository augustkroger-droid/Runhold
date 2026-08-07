export type RaidStatus = "scheduled" | "active" | "resolved";

export type RaidDamageReport = {
  incomingDamage: number;
  blockedDamage: number;
  wallDamage: number;
  tentDamage: number;
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
  };
}
