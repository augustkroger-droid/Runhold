export const EXPEDITION_CONFIG = {
  scannerRadiusM: 2000,
  maxAccurateReadingM: 60,
  minMovementM: 8,
  minRoutePointDistanceM: 10,
  minDistanceForXpM: 100,
} as const;

export function calculateExpeditionXp({
  distanceM,
  durationSeconds,
}: {
  distanceM: number;
  durationSeconds: number;
}): number {
  const distanceXp = Math.floor(Math.max(0, distanceM) / 50);

  if (distanceM < EXPEDITION_CONFIG.minDistanceForXpM) {
    return 0;
  }

  if (durationSeconds <= 0 || distanceM <= 0) {
    return Math.max(5, distanceXp);
  }

  const paceSecondsPerKm = durationSeconds / (distanceM / 1000);
  const paceBonus =
    paceSecondsPerKm >= 240 && paceSecondsPerKm <= 540
      ? Math.floor(distanceXp * 0.2)
      : 0;

  return Math.max(5, distanceXp + paceBonus);
}
