"use client";

import { Clock, LogOut, User } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { TRAINING_LEVELS } from "@/lib/game/definitions/training-levels";
import type { PlayerGameProfile } from "@/lib/game/state/player-profile";
import {
  createTimer,
  formatRemainingDuration,
  getTimerSnapshot,
} from "@/lib/game/systems/timers";

export function ProfileOverview({
  profile,
  username,
  onSignOut,
}: {
  profile: PlayerGameProfile;
  username: string;
  onSignOut: () => void;
}) {
  const [now, setNow] = useState(() => new Date().toISOString());
  const trainingLevel = TRAINING_LEVELS.find(
    (level) => level.id === profile.selectedTrainingLevel,
  );
  const timer = useMemo(
    () =>
      createTimer({
        id: "profile-timer-demo",
        startsAt: profile.gameStartedAt,
        durationMs: 10 * 60 * 1000,
      }),
    [profile.gameStartedAt],
  );
  const timerSnapshot = getTimerSnapshot(timer, now);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(new Date().toISOString());
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="grid gap-4">
      <section className="rounded-lg border border-white/10 bg-[#18232d] p-4">
        <div className="flex items-center gap-2 font-black text-white">
          <User aria-hidden="true" size={19} />
          Profil
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-md bg-[#101820] p-3">
            <dt className="text-[#aeb9b6]">Spelare</dt>
            <dd className="mt-1 font-black text-white">{username}</dd>
          </div>
          <div className="rounded-md bg-[#101820] p-3">
            <dt className="text-[#aeb9b6]">Träningsnivå</dt>
            <dd className="mt-1 font-black text-white">
              {trainingLevel?.name ?? profile.selectedTrainingLevel}
            </dd>
          </div>
          <div className="rounded-md bg-[#101820] p-3">
            <dt className="text-[#aeb9b6]">Karaktär</dt>
            <dd className="mt-1 font-black text-white">Level {profile.characterLevel}</dd>
          </div>
          <div className="rounded-md bg-[#101820] p-3">
            <dt className="text-[#aeb9b6]">XP</dt>
            <dd className="mt-1 font-black text-white">{profile.xp}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border border-white/10 bg-[#18232d] p-4">
        <div className="flex items-center gap-2 font-black text-white">
          <Clock aria-hidden="true" size={19} />
          Timersystem
        </div>
        <p className="mt-2 text-sm leading-6 text-[#c9d4d0]">
          Steg 5 är ett generellt timestamp-baserat system. Det här är bara en
          läsbar kontrollvy, inte en eld eller byggnation ännu.
        </p>
        <div className="mt-3 rounded-md bg-[#101820] p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-bold text-[#aeb9b6]">
              Demo från spelstart
            </span>
            <span className="text-sm font-black text-white">
              {timerSnapshot.status === "completed"
                ? "Klar"
                : formatRemainingDuration(timerSnapshot.remainingMs)}
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/30">
            <div
              className="h-full rounded-full bg-[#43d9ad]"
              style={{ width: `${Math.round(timerSnapshot.progress * 100)}%` }}
            />
          </div>
        </div>
      </section>

      <button
        type="button"
        className="flex min-h-12 items-center justify-center gap-2 rounded-md bg-[#22303b] px-4 font-black text-white"
        onClick={onSignOut}
      >
        <LogOut aria-hidden="true" size={19} />
        Logga ut
      </button>
    </div>
  );
}
