import type { PlayerCampfire } from "@/lib/game/state/player-campfire";
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
