"use client";

import { ChevronDown, Flame, Folder, Home, Shield, Tent } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CampfirePanel } from "@/components/base/campfire-panel";
import { ConstructionPanel } from "@/components/base/construction-panel";
import { RepairPanel } from "@/components/base/repair-panel";
import {
  BUILDING_DEFINITIONS,
  type BuildingId,
} from "@/lib/game/definitions/buildings";
import {
  formatCampfireRemaining,
  getCampfireCapacitySnapshot,
} from "@/lib/game/systems/campfire";
import { usePlayerBuildings } from "@/hooks/use-player-buildings";
import { usePlayerCampfire } from "@/hooks/use-player-campfire";
import { usePlayerRepairs } from "@/hooks/use-player-repairs";
import { usePlayerTech } from "@/hooks/use-player-tech";

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

const baseCategories = [
  { id: "camp", name: "Läger", Icon: Tent },
  { id: "defense", name: "Försvar", Icon: Shield },
] as const;

export function BaseOverview({ userId }: { userId: string }) {
  const { buildings, loading, error, reloadBuildings } = usePlayerBuildings(userId);
  const campfireState = usePlayerCampfire(userId);
  const repairState = usePlayerRepairs(userId);
  const { unlockedTechIds } = usePlayerTech(userId);
  const [selectedBuildingId, setSelectedBuildingId] = useState<BuildingId>("tent");
  const [openCategoryId, setOpenCategoryId] = useState<"camp" | "defense">("camp");
  const [now, setNow] = useState(() => new Date().toISOString());

  const visibleDefinitions = useMemo(
    () =>
      BUILDING_DEFINITIONS.filter(
        (definition) =>
          !definition.requiredTech || unlockedTechIds.has(definition.requiredTech),
      ),
    [unlockedTechIds],
  );
  const activeSelectedBuildingId = visibleDefinitions.some(
    (definition) => definition.id === selectedBuildingId,
  )
    ? selectedBuildingId
    : (visibleDefinitions[0]?.id ?? selectedBuildingId);

  const selectedBuilding = buildings.find(
    (building) => building.buildingId === activeSelectedBuildingId,
  );
  const selectedDefinition = BUILDING_DEFINITIONS.find(
    (definition) => definition.id === selectedBuilding?.buildingId,
  );
  const selectedRepair =
    repairState.repairs.find((repair) => repair.buildingId === activeSelectedBuildingId) ??
    null;

  const repairError = repairState.error;

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(new Date().toISOString());
    }, 60_000);

    return () => window.clearInterval(interval);
  }, []);

  async function handleBaseChanged() {
    await Promise.all([reloadBuildings(), repairState.reloadRepairs()]);
  }

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
        {baseCategories.map((category) => {
          const categoryDefinitions = visibleDefinitions.filter(
            (definition) => definition.categoryId === category.id,
          );

          if (categoryDefinitions.length === 0) return null;

          const CategoryIcon = category.Icon;
          const open = openCategoryId === category.id;

          return (
            <div key={category.id} className="rounded-md border border-white/10 bg-[#101820]">
              <button
                type="button"
                className="flex min-h-12 w-full items-center justify-between gap-3 px-3 text-left"
                onClick={() => setOpenCategoryId(open ? "camp" : category.id)}
              >
                <span className="flex items-center gap-2 font-black text-white">
                  <Folder aria-hidden="true" size={19} className="text-[#f5b84b]" />
                  <CategoryIcon aria-hidden="true" size={18} className="text-[#aeb9b6]" />
                  {category.name}
                </span>
                <ChevronDown
                  aria-hidden="true"
                  size={19}
                  className={`text-[#aeb9b6] transition ${open ? "rotate-180" : ""}`}
                />
              </button>

              {open ? (
                <div className="grid gap-2 border-t border-white/10 p-2">
                  {categoryDefinitions.map((definition) => {
                    const building = buildings.find(
                      (playerBuilding) => playerBuilding.buildingId === definition.id,
                    );
                    const Icon = buildingIcons[definition.id];
                    const selected = activeSelectedBuildingId === definition.id;
                    const level = building?.level ?? definition.initialLevel;
                    const currentHp = building?.currentHp ?? 0;
                    const maxHp = building?.maxHp ?? definition.baseMaxHp;
                    const hpPercent =
                      maxHp > 0 ? Math.round((currentHp / maxHp) * 100) : 0;
                    const state = building?.state ?? definition.initialState;
                    const campfireCapacity =
                      definition.id === "campfire"
                        ? getCampfireCapacitySnapshot(campfireState.campfire, now)
                        : null;
                    const statusText = definition.usesHp
                      ? `${currentHp}/${maxHp} HP`
                      : formatCampfireRemaining(campfireCapacity?.remainingMs ?? 0);

                    return (
                      <button
                        key={definition.id}
                        type="button"
                        className={`rounded-md border p-3 text-left transition ${
                          selected
                            ? "border-[#43d9ad] bg-[#14342d]"
                            : "border-white/10 bg-[#18232d]"
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
                              style={{
                                width: `${Math.max(0, Math.min(100, hpPercent))}%`,
                              }}
                            />
                          </div>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {selectedBuilding && selectedDefinition ? (
        <div className="mt-3 rounded-md bg-[#101820] p-3 text-sm leading-6 text-[#c9d4d0]">
          <p className="font-bold text-white">{selectedDefinition.name}</p>
          <p className="mt-1">{selectedDefinition.description}</p>
          <p className="mt-2 text-[#aeb9b6]">
            Status: {stateLabels[selectedBuilding.state]} · Nivå{" "}
            {selectedBuilding.level}
            {selectedDefinition.usesHp
              ? ` · HP: ${selectedBuilding.currentHp}/${selectedBuilding.maxHp}`
              : ""}
          </p>
        </div>
      ) : null}

      {activeSelectedBuildingId === "campfire" ? (
        <div className="mt-3">
          <CampfirePanel
            campfire={campfireState.campfire}
            loading={campfireState.loading}
            error={campfireState.error}
            fueling={campfireState.fueling}
            fuelCampfire={campfireState.fuelCampfire}
          />
        </div>
      ) : null}

      {activeSelectedBuildingId === "wall" && selectedBuilding ? (
        <div className="mt-3">
          <ConstructionPanel
            userId={userId}
            constructionId="wall_level_1"
            isBuilt={selectedBuilding.level > 0 && selectedBuilding.state !== "not_built"}
            onChanged={reloadBuildings}
          />
        </div>
      ) : null}

      {selectedBuilding && selectedDefinition?.usesHp ? (
        <div className="mt-3">
          <RepairPanel
            building={selectedBuilding}
            definition={selectedDefinition}
            activeRepair={selectedRepair}
            repairing={repairState.repairing === selectedBuilding.buildingId}
            damaging={repairState.damaging === selectedBuilding.buildingId}
            onRepair={async () => {
              await repairState.startRepair(selectedBuilding.buildingId);
              await handleBaseChanged();
            }}
            onDamage={async () => {
              await repairState.damageBuilding(selectedBuilding.buildingId, 25);
              await handleBaseChanged();
            }}
            onChanged={() => {
              void handleBaseChanged();
            }}
          />
        </div>
      ) : null}

      {error || repairError ? (
        <p className="mt-3 rounded-md border border-red-400/30 bg-red-950/40 p-3 text-sm leading-6 text-red-100">
          {error ?? repairError}
        </p>
      ) : null}
    </section>
  );
}
