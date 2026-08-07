import type { Coordinate } from "@/lib/game/gps/position";

export type ExpeditionRoutePoint = Coordinate & {
  timestamp: number;
  accuracyM: number;
};

export type PlayerExpedition = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  distanceM: number;
  durationSeconds: number;
  xpEarned: number;
  resourceHaul: Record<string, number>;
  itemHaul: Record<string, number>;
  routePoints: ExpeditionRoutePoint[];
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
  item_haul?: Record<string, number> | null;
  route_points?: ExpeditionRoutePoint[] | null;
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
    itemHaul: row.item_haul ?? {},
    routePoints: Array.isArray(row.route_points) ? row.route_points : [],
  };
}
