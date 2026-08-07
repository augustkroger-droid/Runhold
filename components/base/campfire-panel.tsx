"use client";

import { Flame, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { CAMPFIRE_CONFIG } from "@/lib/game/definitions/campfire";
import {
  formatCampfireRemaining,
  getCampfireCapacitySnapshot,
  getCampfireSnapshot,
} from "@/lib/game/systems/campfire";
import type { PlayerCampfire } from "@/lib/game/state/player-campfire";

export function CampfirePanel({
  campfire,
  loading,
  error,
  fueling,
  fuelCampfire,
}: {
  campfire: PlayerCampfire;
  loading: boolean;
  error: string | null;
  fueling: boolean;
  fuelCampfire: (woodAmount: number) => Promise<void>;
}) {
  const { t } = useI18n();
  const [now, setNow] = useState(() => new Date().toISOString());
  const [localError, setLocalError] = useState<string | null>(null);
  const snapshot = getCampfireSnapshot(campfire, now);
  const capacity = getCampfireCapacitySnapshot(campfire, now);

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
          : t("campfire.fuelError"),
      );
    }
  }

  return (
    <section className="rounded-lg border border-[#f5b84b]/25 bg-[#201914] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-black text-white">
          <Flame aria-hidden="true" size={20} className="text-[#f5b84b]" />
          {t("campfire.title")}
        </div>
        <span
          className={`rounded-md px-2 py-1 text-xs font-black ${
            snapshot.isBurning
              ? "bg-[#16342d] text-[#43d9ad]"
              : "bg-black/25 text-[#f5b84b]"
          }`}
        >
          {snapshot.isBurning ? t("campfire.burning") : t("campfire.out")}
        </span>
      </div>

      <div className="mt-3 rounded-md bg-[#101820] p-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-bold text-[#aeb9b6]">
            {t("campfire.remaining")}
          </span>
          <span className="text-lg font-black text-white">
            {formatCampfireRemaining(capacity.remainingMs, {
              includeSeconds: CAMPFIRE_CONFIG.showSecondsInDetail,
            })}
          </span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/30">
          <div
            className="h-full rounded-full bg-[#f5b84b]"
            style={{ width: `${Math.round(capacity.fillRatio * 100)}%` }}
          />
        </div>
        <p className="mt-2 text-xs leading-5 text-[#aeb9b6]">
          {t("campfire.balance", {
            minutes: CAMPFIRE_CONFIG.burnMinutesPerWood,
            hours: CAMPFIRE_CONFIG.maxBurnHours,
          })}
        </p>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {CAMPFIRE_CONFIG.quickFuelOptions.map((woodAmount) => (
          <button
            key={woodAmount}
            type="button"
            className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#315f36] px-3 font-black text-white disabled:cursor-wait disabled:opacity-60"
            disabled={loading || fueling}
            onClick={() => handleFuel(woodAmount)}
          >
            <Plus aria-hidden="true" size={18} />
            {woodAmount} {t("resource.wood").toLowerCase()}
          </button>
        ))}
        <button
          type="button"
          className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#5f4b24] px-3 font-black text-white disabled:cursor-wait disabled:opacity-60"
          disabled={loading || fueling || capacity.woodNeededToFill <= 0}
          onClick={() => handleFuel(capacity.woodNeededToFill)}
        >
          <Plus aria-hidden="true" size={18} />
          {t("campfire.full")}
        </button>
      </div>

      {error || localError ? (
        <p className="mt-3 rounded-md border border-red-400/30 bg-red-950/40 p-3 text-sm leading-6 text-red-100">
          {localError ?? error}
        </p>
      ) : null}
    </section>
  );
}
