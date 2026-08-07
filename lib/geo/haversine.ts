import type { Coordinate } from "@/lib/game/gps/position";

const EARTH_RADIUS_M = 6_371_000;

export function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

export function haversineDistanceMeters(from: Coordinate, to: Coordinate): number {
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const deltaLat = toRadians(to.lat - from.lat);
  const deltaLng = toRadians(to.lng - from.lng);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_M * c;
}

export function isPointReached({
  current,
  target,
  accuracyM,
  radiusM = 20,
  maxAccuracyM = 40,
}: {
  current: Coordinate;
  target: Coordinate;
  accuracyM: number;
  radiusM?: number;
  maxAccuracyM?: number;
}): boolean {
  return (
    Number.isFinite(accuracyM) &&
    accuracyM <= maxAccuracyM &&
    haversineDistanceMeters(current, target) <= radiusM
  );
}

export function updateReachStreak({
  previousStreak,
  current,
  target,
  accuracyM,
  radiusM = 20,
  maxAccuracyM = 40,
  requiredStreak = 2,
}: {
  previousStreak: number;
  current: Coordinate;
  target: Coordinate;
  accuracyM: number;
  radiusM?: number;
  maxAccuracyM?: number;
  requiredStreak?: number;
}): { streak: number; reached: boolean } {
  const streak = isPointReached({ current, target, accuracyM, radiusM, maxAccuracyM })
    ? previousStreak + 1
    : 0;

  return {
    streak,
    reached: streak >= requiredStreak,
  };
}
