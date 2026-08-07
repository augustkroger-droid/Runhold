"use client";

import { Check, Lock, Network, Sparkles } from "lucide-react";
import { TECH_DEFINITIONS, type TechId } from "@/lib/game/definitions/tech";
import { isTechAvailable } from "@/lib/game/state/player-tech";
import { usePlayerTech } from "@/hooks/use-player-tech";

function prerequisiteText(prerequisites: readonly TechId[]): string {
  if (prerequisites.length === 0) return "Tillgänglig";

  return `Kräver ${prerequisites
    .map((techId) => TECH_DEFINITIONS.find((tech) => tech.id === techId)?.name ?? techId)
    .join(", ")}`;
}

export function TechOverview({
  userId,
  xp,
  onChanged,
}: {
  userId: string;
  xp: number;
  onChanged: () => Promise<void>;
}) {
  const { unlockedTechIds, loading, error, unlocking, unlockTech } =
    usePlayerTech(userId);

  async function handleUnlock(techId: TechId) {
    await unlockTech(techId);
    await onChanged();
  }

  return (
    <section className="rounded-lg border border-white/10 bg-[#18232d] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-black text-white">
          <Network aria-hidden="true" size={19} />
          Tech
        </div>
        <span className="rounded-md bg-[#101820] px-3 py-2 text-sm font-black text-[#43d9ad]">
          {xp} XP
        </span>
      </div>

      <div className="mt-3 grid gap-3">
        {TECH_DEFINITIONS.map((tech) => {
          const unlocked = unlockedTechIds.has(tech.id);
          const available = isTechAvailable(tech.id, unlockedTechIds);
          const canAfford = xp >= tech.xpCost;

          return (
            <div
              key={tech.id}
              className={`rounded-md border p-3 ${
                unlocked
                  ? "border-[#43d9ad]/35 bg-[#14342d]"
                  : available
                    ? "border-[#f5b84b]/35 bg-[#2b2414]"
                    : "border-white/10 bg-[#101820]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-black text-white">
                    {unlocked ? (
                      <Check aria-hidden="true" size={18} className="text-[#43d9ad]" />
                    ) : available ? (
                      <Sparkles aria-hidden="true" size={18} className="text-[#f5b84b]" />
                    ) : (
                      <Lock aria-hidden="true" size={18} className="text-[#aeb9b6]" />
                    )}
                    {tech.name}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[#c9d4d0]">
                    {tech.description}
                  </p>
                  <p className="mt-2 text-xs font-bold uppercase tracking-[0.12em] text-[#aeb9b6]">
                    {unlocked ? "Upplåst" : prerequisiteText(tech.prerequisites)}
                  </p>
                </div>
                <span className="shrink-0 rounded-md bg-black/20 px-2 py-1 text-xs font-black text-[#d7e1dd]">
                  {tech.xpCost} XP
                </span>
              </div>

              {!unlocked ? (
                <button
                  type="button"
                  className="mt-3 flex min-h-11 w-full items-center justify-center rounded-md bg-[#315f36] px-3 font-black text-white disabled:cursor-not-allowed disabled:opacity-45"
                  disabled={!available || !canAfford || loading || unlocking === tech.id}
                  onClick={() => handleUnlock(tech.id)}
                >
                  {unlocking === tech.id ? "Lär..." : "Lär dig"}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      {error ? (
        <p className="mt-3 rounded-md border border-red-400/30 bg-red-950/40 p-3 text-sm leading-6 text-red-100">
          {error}
        </p>
      ) : null}
    </section>
  );
}
