import type { PlayerCampfire } from "@/lib/game/state/player-campfire";
import { CAMPFIRE_CONFIG } from "@/lib/game/definitions/campfire";
import {
  type TimerSnapshot,
  getTimerSnapshot,
} from "@/lib/game/systems/timers";

export type CampfireSnapshot = {
  isBurning: boolean;
  timer: TimerSnapshot | null;
};

export function getCampfireSnapshot(
  campfire: Pick<PlayerCampfire, "burnUntil" | "lastFueledAt">,
  now: string,
): CampfireSnapshot {
  if (!campfire.burnUntil || Date.parse(campfire.burnUntil) <= Date.parse(now)) {
    return {
      isBurning: false,
      timer: null,
    };
  }

  return {
    isBurning: true,
    timer: getTimerSnapshot(
      {
        startsAt: campfire.lastFueledAt ?? now,
        completesAt: campfire.burnUntil,
      },
      now,
    ),
  };
}

export function getCampfireCapacitySnapshot(
  campfire: Pick<PlayerCampfire, "burnUntil">,
  now: string,
): {
  remainingMs: number;
  maxMs: number;
  fillRatio: number;
  woodNeededToFill: number;
} {
  const nowMs = Date.parse(now);
  const burnUntilMs = campfire.burnUntil ? Date.parse(campfire.burnUntil) : nowMs;
  const remainingMs = Math.max(0, burnUntilMs - nowMs);
  const maxMs = CAMPFIRE_CONFIG.maxBurnHours * 60 * 60 * 1000;
  const woodMs = CAMPFIRE_CONFIG.burnMinutesPerWood * 60 * 1000;

  return {
    remainingMs,
    maxMs,
    fillRatio: maxMs > 0 ? Math.min(1, remainingMs / maxMs) : 0,
    woodNeededToFill: Math.max(0, Math.ceil((maxMs - remainingMs) / woodMs)),
  };
}

export function formatCampfireRemaining(milliseconds: number): string {
  const totalMinutes = Math.max(0, Math.ceil(milliseconds / 60_000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  }

  return `${minutes}m`;
}
