"use client";

import { Backpack, Home, Map, Network, User } from "lucide-react";

export type AppTabId = "base" | "expedition" | "tech" | "inventory" | "profile";

const tabs: readonly {
  id: AppTabId;
  label: string;
  disabled?: boolean;
  Icon: typeof Home;
}[] = [
  { id: "base", label: "Bas", Icon: Home },
  { id: "expedition", label: "Expedition", Icon: Map },
  { id: "tech", label: "Tech", Icon: Network },
  { id: "inventory", label: "Förråd", Icon: Backpack },
  { id: "profile", label: "Profil", Icon: User },
] as const;

export function AppBottomNav({
  activeTab,
  onTabChange,
}: {
  activeTab: AppTabId;
  onTabChange: (tabId: AppTabId) => void;
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-[1000] border-t border-white/10 bg-[#0c1116]/95 px-2 pb-[max(0.55rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur">
      <div className="mx-auto grid max-w-3xl grid-cols-5 gap-1">
        {tabs.map(({ id, label, disabled, Icon }) => {
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
              <span className="mt-1">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
