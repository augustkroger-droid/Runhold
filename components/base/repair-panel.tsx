"use client";

import { Hammer, ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import type { BuildingDefinition } from "@/lib/game/definitions/buildings";
import { getRepairDefinition } from "@/lib/game/definitions/repairs";
import type { PlayerBuilding } from "@/lib/game/state/player-buildings";
import type { PlayerRepair } from "@/lib/game/state/player-repairs";
import { formatRemainingDuration, getTimerSnapshot } from "@/lib/game/systems/timers";
import { type Language, resourceName } from "@/lib/i18n";

function formatRepairCost(cost: Record<string, number>, language: Language): string {
  return Object.entries(cost)
    .map(([resourceId, amount]) => `${amount} ${resourceName(language, resourceId)}`)
    .join(" · ");
}

function calculateRepairPreview(building: PlayerBuilding): {
  missingHp: number;
  cost: Record<string, number>;
} | null {
  const definition = getRepairDefinition(building.buildingId);
  const missingHp = Math.max(0, building.maxHp - building.currentHp);

  if (!definition || missingHp <= 0) return null;

  const units = Math.ceil(missingHp / 10);
  return {
    missingHp,
    cost: Object.fromEntries(
      Object.entries(definition.costPer10Hp).map(([resourceId, amount]) => [
        resourceId,
        (amount ?? 0) * units,
      ]),
    ),
  };
}

export function RepairPanel({
  building,
  definition,
  activeRepair,
  repairing,
  onRepair,
  onChanged,
}: {
  building: PlayerBuilding;
  definition: BuildingDefinition;
  activeRepair: PlayerRepair | null;
  repairing: boolean;
  onRepair: () => Promise<void>;
  onChanged: () => void;
}) {
  const { language, t } = useI18n();
  const [now, setNow] = useState(() => new Date().toISOString());
  const repairPreview = useMemo(() => calculateRepairPreview(building), [building]);
  const snapshot = activeRepair
    ? getTimerSnapshot(
        {
          startsAt: activeRepair.startsAt,
          completesAt: activeRepair.completesAt,
        },
        now,
      )
    : null;

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(new Date().toISOString());
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (snapshot?.status !== "completed") return;

    const timeout = window.setTimeout(onChanged, 250);
    return () => window.clearTimeout(timeout);
  }, [onChanged, snapshot?.status]);

  if (!definition.usesHp) return null;

  return (
    <section className="rounded-lg border border-white/10 bg-[#18232d] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-black text-white">
          <ShieldAlert aria-hidden="true" size={19} />
          {t("repair.title")}
        </div>
        <span className="text-sm font-black text-white">
          {building.currentHp}/{building.maxHp} HP
        </span>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/30">
        <div
          className="h-full rounded-full bg-[#43d9ad]"
          style={{
            width: `${Math.max(
              0,
              Math.min(100, Math.round((building.currentHp / building.maxHp) * 100)),
            )}%`,
          }}
        />
      </div>

      {activeRepair && snapshot ? (
        <div className="mt-3 rounded-md bg-[#101820] p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-bold text-[#aeb9b6]">{t("repair.repair")}</span>
            <span className="text-sm font-black text-white">
              {snapshot.status === "completed"
                ? t("common.ready")
                : formatRemainingDuration(snapshot.remainingMs)}
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/30">
            <div
              className="h-full rounded-full bg-[#f5b84b]"
              style={{ width: `${Math.round(snapshot.progress * 100)}%` }}
            />
          </div>
        </div>
      ) : repairPreview ? (
        <div className="mt-3 grid gap-2">
          <p className="rounded-md bg-[#101820] p-3 text-sm font-bold text-[#c9d4d0]">
            {t("repair.repair")}: {repairPreview.missingHp} {t("common.hp")} ·{" "}
            {formatRepairCost(repairPreview.cost, language)}
          </p>
          <button
            type="button"
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-[#315f36] px-3 font-black text-white disabled:cursor-wait disabled:opacity-60"
            disabled={repairing}
            onClick={onRepair}
          >
            <Hammer aria-hidden="true" size={18} />
            {t("repair.start")}
          </button>
        </div>
      ) : (
        <p className="mt-3 rounded-md bg-[#101820] p-3 text-sm font-bold text-[#c9d4d0]">
          {t("repair.good")}
        </p>
      )}
    </section>
  );
}
