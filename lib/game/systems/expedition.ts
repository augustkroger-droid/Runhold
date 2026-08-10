import type { Coordinate } from "@/lib/game/gps/position";
import { haversineDistanceMeters } from "@/lib/geo/haversine";

export const EXPEDITION_CONFIG = {
  scannerRadiusM: 2000,
  maxAccurateReadingM: 60,
  minMovementM: 8,
  minRoutePointDistanceM: 10,
  maxRouteSegmentM: 300,
} as const;

export function calculateExpeditionXp({
  distanceM,
  pickupXp = 0,
}: {
  distanceM: number;
  durationSeconds: number;
  pickupXp?: number;
}): number {
  return Math.floor(Math.max(0, distanceM) / 50) + Math.max(0, pickupXp);
}

export function calculateRouteDistanceMeters(
  points: readonly Coordinate[],
): number {
  if (points.length < 2) return 0;

  let distanceM = 0;

  for (let index = 1; index < points.length; index += 1) {
    const segmentM = haversineDistanceMeters(points[index - 1], points[index]);

    if (segmentM > 0 && segmentM <= EXPEDITION_CONFIG.maxRouteSegmentM) {
      distanceM += segmentM;
    }
  }

  return distanceM;
}
