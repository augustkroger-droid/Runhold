export type GameTimer = {
  id: string;
  startsAt: string;
  completesAt: string;
};

export type TimerStatus = "pending" | "active" | "completed";

export type TimerSnapshot = {
  status: TimerStatus;
  totalMs: number;
  elapsedMs: number;
  remainingMs: number;
  progress: number;
};

function timeValue(isoTimestamp: string): number {
  const value = Date.parse(isoTimestamp);

  if (!Number.isFinite(value)) {
    throw new Error(`Invalid timer timestamp: ${isoTimestamp}`);
  }

  return value;
}

export function createTimer({
  id,
  startsAt,
  durationMs,
}: {
  id: string;
  startsAt: string;
  durationMs: number;
}): GameTimer {
  if (durationMs < 0) {
    throw new Error("Timer duration must be positive.");
  }

  return {
    id,
    startsAt,
    completesAt: new Date(timeValue(startsAt) + durationMs).toISOString(),
  };
}

export function getTimerSnapshot(
  timer: Pick<GameTimer, "startsAt" | "completesAt">,
  now: string,
): TimerSnapshot {
  const startsAtMs = timeValue(timer.startsAt);
  const completesAtMs = timeValue(timer.completesAt);
  const nowMs = timeValue(now);
  const totalMs = Math.max(0, completesAtMs - startsAtMs);

  if (nowMs < startsAtMs) {
    return {
      status: "pending",
      totalMs,
      elapsedMs: 0,
      remainingMs: totalMs,
      progress: 0,
    };
  }

  if (nowMs >= completesAtMs || totalMs === 0) {
    return {
      status: "completed",
      totalMs,
      elapsedMs: totalMs,
      remainingMs: 0,
      progress: 1,
    };
  }

  const elapsedMs = nowMs - startsAtMs;

  return {
    status: "active",
    totalMs,
    elapsedMs,
    remainingMs: completesAtMs - nowMs,
    progress: elapsedMs / totalMs,
  };
}

export function formatRemainingDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
  }

  return `${seconds}s`;
}
