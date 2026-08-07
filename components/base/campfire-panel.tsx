"use client";

import { Flame, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { CAMPFIRE_CONFIG } from "@/lib/game/definitions/campfire";
import { getCampfireSnapshot } from "@/lib/game/systems/campfire";
import { formatRemainingDuration } from "@/lib/game/systems/timers";
import { usePlayerCampfire } from "@/hooks/use-player-campfire";

export function CampfirePanel({ userId }: { userId: string }) {
  const { campfire, loading, error, fueling, fuelCampfire } =
    usePlayerCampfire(userId);
  const [now, setNow] = useState(() => new Date().toISOString());
  const [localError, setLocalError] = useState<string | null>(null);
  const snapshot = getCampfireSnapshot(campfire, now);
  const remainingMs = snapshot.timer?.remainingMs ?? 0;
  const progress = snapshot.timer?.progress ?? 0;

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(new Date().toISOString());
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  async function handleFuel(woodAmount: number) {
    setLocalError(null);

    try {
      await fuelCampfire(woodAmount);
      setNow(new Date().toISOString());
    } catch (fuelError) {
      setLocalError(
        fuelError instanceof Error
          ? fuelError.message
          : "Kunde inte fylla på elden just nu.",
      );
    }
  }

  return (
    <section className="rounded-lg border border-[#f5b84b]/25 bg-[#201914] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-black text-white">
          <Flame aria-hidden="true" size={20} className="text-[#f5b84b]" />
          Lägereld
        </div>
        <span
          className={`rounded-md px-2 py-1 text-xs font-black ${
            snapshot.isBurning
              ? "bg-[#16342d] text-[#43d9ad]"
              : "bg-black/25 text-[#f5b84b]"
          }`}
        >
          {snapshot.isBurning ? "Brinner" : "Slocknad"}
        </span>
      </div>

      <div className="mt-3 rounded-md bg-[#101820] p-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-bold text-[#aeb9b6]">Återstående tid</span>
          <span className="text-lg font-black text-white">
            {snapshot.isBurning ? formatRemainingDuration(remainingMs) : "0s"}
          </span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/30">
          <div
            className="h-full rounded-full bg-[#f5b84b]"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        <p className="mt-2 text-xs leading-5 text-[#aeb9b6]">
          1 trä ger {CAMPFIRE_CONFIG.burnMinutesPerWood} minuter brinntid.
          Elden kan inte skadas i nuvarande version.
        </p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {CAMPFIRE_CONFIG.quickFuelOptions.map((woodAmount) => (
          <button
            key={woodAmount}
            type="button"
            className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#315f36] px-3 font-black text-white disabled:cursor-wait disabled:opacity-60"
            disabled={loading || fueling}
            onClick={() => handleFuel(woodAmount)}
          >
            <Plus aria-hidden="true" size={18} />
            {woodAmount} trä
          </button>
        ))}
      </div>

      {error || localError ? (
        <p className="mt-3 rounded-md border border-red-400/30 bg-red-950/40 p-3 text-sm leading-6 text-red-100">
          {localError ?? error}
        </p>
      ) : null}
    </section>
  );
}
