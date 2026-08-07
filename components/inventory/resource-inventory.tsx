"use client";

import { Minus, Package, Plus } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { RESOURCE_DEFINITIONS } from "@/lib/game/definitions/resources";
import type { ResourceId } from "@/lib/game/definitions/resources";
import { usePlayerResources } from "@/hooks/use-player-resources";
import { resourceName } from "@/lib/i18n";

export function ResourceInventory({ userId }: { userId: string }) {
  const { language, t } = useI18n();
  const { balances, loading, error, busyResourceId, adjustResource } =
    usePlayerResources(userId);
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleAdjust(resourceId: ResourceId, delta: number) {
    setLocalError(null);

    try {
      await adjustResource(resourceId, delta);
    } catch (adjustError) {
      setLocalError(
        adjustError instanceof Error
          ? adjustError.message
          : t("inventory.error"),
      );
    }
  }

  return (
    <section className="rounded-lg border border-white/10 bg-[#18232d] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-black text-white">
          <Package aria-hidden="true" size={19} />
          {t("inventory.title")}
        </div>
        {loading ? (
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#aeb9b6]">
            {t("common.loading")}
          </span>
        ) : null}
      </div>

      <div className="mt-3 grid gap-3">
        {RESOURCE_DEFINITIONS.map((resource) => {
          const busy = busyResourceId === resource.id;

          return (
            <div
              key={resource.id}
              className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-md bg-[#101820] p-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span aria-hidden="true" className="text-lg">
                    {resource.icon}
                  </span>
                  <h3 className="font-black text-white">
                    {resourceName(language, resource.id)}
                  </h3>
                </div>
                <p className="mt-1 text-2xl font-black text-[#43d9ad]">
                  {balances[resource.id]}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="grid size-10 place-items-center rounded-md bg-[#22303b] text-white disabled:opacity-50"
                  aria-label={t("inventory.remove", {
                    resource: resourceName(language, resource.id),
                  })}
                  disabled={loading || busy}
                  onClick={() => handleAdjust(resource.id, -5)}
                >
                  <Minus aria-hidden="true" size={18} />
                </button>
                <button
                  type="button"
                  className="grid size-10 place-items-center rounded-md bg-[#315f36] text-white disabled:opacity-50"
                  aria-label={t("inventory.add", {
                    resource: resourceName(language, resource.id),
                  })}
                  disabled={loading || busy}
                  onClick={() => handleAdjust(resource.id, 10)}
                >
                  <Plus aria-hidden="true" size={18} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {error || localError ? (
        <p className="mt-3 rounded-md border border-red-400/30 bg-red-950/40 p-3 text-sm leading-6 text-red-100">
          {localError ?? error}
        </p>
      ) : null}
    </section>
  );
}
