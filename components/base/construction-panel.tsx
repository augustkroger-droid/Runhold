"use client";

import { Hammer } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import {
  type ConstructionId,
  getConstructionDefinition,
} from "@/lib/game/definitions/construction";
import { formatRemainingDuration, getTimerSnapshot } from "@/lib/game/systems/timers";
import { usePlayerConstructions } from "@/hooks/use-player-constructions";
import { buildingDescription, buildingName, resourceName } from "@/lib/i18n";

export function ConstructionPanel({
  userId,
  constructionId,
  isBuilt,
  onChanged,
}: {
  userId: string;
  constructionId: ConstructionId;
  isBuilt: boolean;
  onChanged: () => void;
}) {
  const { language, t } = useI18n();
  const {
    constructions,
    loading,
    error,
    starting,
    startConstruction,
    reloadConstructions,
  } = usePlayerConstructions(userId);
  const definition = getConstructionDefinition(constructionId);
  const [now, setNow] = useState(() => new Date().toISOString());
  const activeConstruction = constructions.find(
    (construction) => construction.constructionId === constructionId,
  );
  const snapshot = activeConstruction
    ? getTimerSnapshot(
        {
          startsAt: activeConstruction.startsAt,
          completesAt: activeConstruction.completesAt,
        },
        now,
      )
    : null;
  const costText = useMemo(
    () =>
      Object.entries(definition.cost)
        .map(([resourceId, amount]) => {
          return `${amount} ${resourceName(language, resourceId)}`;
        })
        .join(" · "),
    [definition.cost, language],
  );

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(new Date().toISOString());
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (snapshot?.status !== "completed") return;

    const timeout = window.setTimeout(() => {
      void reloadConstructions().then(onChanged);
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [onChanged, reloadConstructions, snapshot?.status]);

  async function handleStart() {
    await startConstruction(constructionId);
    onChanged();
  }

  if (isBuilt) {
    return (
      <section className="rounded-lg border border-[#43d9ad]/25 bg-[#14342d] p-4">
        <div className="flex items-center gap-2 font-black text-white">
          <Hammer aria-hidden="true" size={19} />
          {t("construction.built.wall")}
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-white/10 bg-[#18232d] p-4">
      <div className="flex items-center gap-2 font-black text-white">
        <Hammer aria-hidden="true" size={19} />
        {buildingName(language, definition.targetBuildingId)}
      </div>
      <p className="mt-2 text-sm leading-6 text-[#c9d4d0]">
        {buildingDescription(language, definition.targetBuildingId)}
      </p>

      {activeConstruction && snapshot ? (
        <div className="mt-3 rounded-md bg-[#101820] p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-bold text-[#aeb9b6]">
              {t("construction.active")}
            </span>
            <span className="text-sm font-black text-white">
              {snapshot.status === "completed"
                ? t("common.ready")
                : formatRemainingDuration(snapshot.remainingMs)}
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/30">
            <div
              className="h-full rounded-full bg-[#43d9ad]"
              style={{ width: `${Math.round(snapshot.progress * 100)}%` }}
            />
          </div>
        </div>
      ) : (
        <>
          <p className="mt-3 rounded-md bg-[#101820] p-3 text-sm font-bold text-[#c9d4d0]">
            {t("common.cost")}: {costText}
          </p>
          <button
            type="button"
            className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-[#315f36] px-3 font-black text-white disabled:cursor-wait disabled:opacity-60"
            disabled={loading || starting === constructionId}
            onClick={handleStart}
          >
            <Hammer aria-hidden="true" size={18} />
            {t("construction.start")}
          </button>
        </>
      )}

      {error ? (
        <p className="mt-3 rounded-md border border-red-400/30 bg-red-950/40 p-3 text-sm leading-6 text-red-100">
          {error}
        </p>
      ) : null}
    </section>
  );
}
