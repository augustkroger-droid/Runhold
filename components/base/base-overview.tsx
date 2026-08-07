"use client";

import { Flame, Home, Shield, Tent } from "lucide-react";
import { useState } from "react";
import {
  BUILDING_DEFINITIONS,
  type BuildingId,
} from "@/lib/game/definitions/buildings";
import { usePlayerBuildings } from "@/hooks/use-player-buildings";

const buildingIcons: Record<BuildingId, typeof Tent> = {
  tent: Tent,
  campfire: Flame,
  wall: Shield,
};

const stateLabels = {
  active: "Aktiv",
  not_built: "Inte byggd",
  damaged: "Skadad",
  destroyed: "Utslagen",
} as const;

export function BaseOverview({ userId }: { userId: string }) {
  const { buildings, loading, error } = usePlayerBuildings(userId);
  const [selectedBuildingId, setSelectedBuildingId] = useState<BuildingId>("tent");

  const selectedBuilding =
    buildings.find((building) => building.buildingId === selectedBuildingId) ??
    buildings[0];
  const selectedDefinition = BUILDING_DEFINITIONS.find(
    (definition) => definition.id === selectedBuilding?.buildingId,
  );

  return (
    <section className="rounded-lg border border-white/10 bg-[#18232d] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-black text-white">
          <Home aria-hidden="true" size={19} />
          Bas
        </div>
        {loading ? (
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#aeb9b6]">
            Laddar
          </span>
        ) : null}
      </div>

      <div className="mt-3 grid gap-3">
        {BUILDING_DEFINITIONS.map((definition) => {
          const building = buildings.find(
            (playerBuilding) => playerBuilding.buildingId === definition.id,
          );
          const Icon = buildingIcons[definition.id];
          const selected = selectedBuildingId === definition.id;
          const level = building?.level ?? definition.initialLevel;
          const currentHp = building?.currentHp ?? 0;
          const maxHp = building?.maxHp ?? definition.baseMaxHp;
          const hpPercent = maxHp > 0 ? Math.round((currentHp / maxHp) * 100) : 0;
          const state = building?.state ?? definition.initialState;
          const statusText = definition.usesHp
            ? `${currentHp}/${maxHp} HP`
            : "Timer";

          return (
            <button
              key={definition.id}
              type="button"
              className={`rounded-md border p-3 text-left transition ${
                selected
                  ? "border-[#43d9ad] bg-[#14342d]"
                  : "border-white/10 bg-[#101820]"
              }`}
              onClick={() => setSelectedBuildingId(definition.id)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-md bg-[#22303b] text-[#f5b84b]">
                    <Icon aria-hidden="true" size={21} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-black text-white">{definition.name}</h3>
                    <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-[#aeb9b6]">
                      Nivå {level} · {stateLabels[state]}
                    </p>
                  </div>
                </div>
                <span className="rounded-md bg-black/20 px-2 py-1 text-xs font-bold text-[#c9d4d0]">
                  {statusText}
                </span>
              </div>
              {definition.usesHp ? (
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/30">
                  <div
                    className="h-full rounded-full bg-[#43d9ad]"
                    style={{ width: `${Math.max(0, Math.min(100, hpPercent))}%` }}
                  />
                </div>
              ) : null}
            </button>
          );
        })}
      </div>

      {selectedBuilding && selectedDefinition ? (
        <div className="mt-3 rounded-md bg-[#101820] p-3 text-sm leading-6 text-[#c9d4d0]">
          <p className="font-bold text-white">{selectedDefinition.name}</p>
          <p className="mt-1">{selectedDefinition.description}</p>
          <p className="mt-2 text-[#aeb9b6]">
            State: {stateLabels[selectedBuilding.state]} · Level:{" "}
            {selectedBuilding.level}
            {selectedDefinition.usesHp
              ? ` · HP: ${selectedBuilding.currentHp}/${selectedBuilding.maxHp}`
              : " · Ingen HP i nuvarande version"}
          </p>
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-md border border-red-400/30 bg-red-950/40 p-3 text-sm leading-6 text-red-100">
          {error}
        </p>
      ) : null}
    </section>
  );
}
