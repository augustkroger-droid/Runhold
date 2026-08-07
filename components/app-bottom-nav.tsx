"use client";

import { Backpack, Home, Map, Network, User } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";

export type AppTabId = "base" | "expedition" | "tech" | "inventory" | "profile";

const tabs: readonly {
  id: AppTabId;
  labelKey: "nav.base" | "nav.expedition" | "nav.tech" | "nav.inventory" | "nav.profile";
  disabled?: boolean;
  Icon: typeof Home;
}[] = [
  { id: "base", labelKey: "nav.base", Icon: Home },
  { id: "expedition", labelKey: "nav.expedition", Icon: Map },
  { id: "tech", labelKey: "nav.tech", Icon: Network },
  { id: "inventory", labelKey: "nav.inventory", Icon: Backpack },
  { id: "profile", labelKey: "nav.profile", Icon: User },
] as const;

export function AppBottomNav({
  activeTab,
  onTabChange,
}: {
  activeTab: AppTabId;
  onTabChange: (tabId: AppTabId) => void;
}) {
  const { t } = useI18n();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-[1000] border-t border-white/10 bg-[#0c1116]/95 px-2 pb-[max(0.55rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur">
      <div className="mx-auto grid max-w-3xl grid-cols-5 gap-1">
        {tabs.map(({ id, labelKey, disabled, Icon }) => {
          const active = activeTab === id;

          return (
            <button
              key={id}
              type="button"
              className={`grid min-h-14 place-items-center rounded-md px-1 text-[0.68rem] font-black ${
                active
                  ? "bg-[#14342d] text-[#43d9ad]"
                  : "text-[#aeb9b6]"
              } disabled:opacity-35`}
              disabled={disabled}
              onClick={() => onTabChange(id)}
            >
              <Icon aria-hidden="true" size={20} />
              <span className="mt-1">{t(labelKey)}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
