"use client";

import { LogOut, Satellite, Sparkles } from "lucide-react";
import { useState } from "react";
import { AppBottomNav, type AppTabId } from "@/components/app-bottom-nav";
import { BaseOverview } from "@/components/base/base-overview";
import { ExpeditionView } from "@/components/expedition/expedition-view";
import { I18nProvider, useI18n } from "@/components/i18n-provider";
import { ResourceInventory } from "@/components/inventory/resource-inventory";
import { ProfileOverview } from "@/components/profile/profile-overview";
import { TechOverview } from "@/components/tech/tech-overview";
import type { PlayerGameProfile } from "@/lib/game/state/player-profile";
import type { Language } from "@/lib/i18n";

function MissionAppContent({
  gameProfile,
  userId,
  username,
  onSignOut,
  onLanguageChange,
  onProfileChanged,
}: {
  gameProfile: PlayerGameProfile;
  userId: string;
  username: string;
  onSignOut: () => void;
  onLanguageChange: (language: Language) => Promise<PlayerGameProfile>;
  onProfileChanged: () => Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<AppTabId>("base");
  const { t } = useI18n();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-4 px-4 pb-24 pt-5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#43d9ad]">
            {username}
          </p>
          <h1 className="text-3xl font-black text-white">Runhold</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-md border border-[#f5b84b]/40 bg-[#2b2414] px-3 py-2 text-right">
            <div className="flex items-center gap-1 text-xs font-bold uppercase tracking-[0.12em] text-[#f5b84b]">
              <Sparkles aria-hidden="true" size={14} />
              XP
            </div>
            <p className="text-lg font-black text-white">{gameProfile.xp}</p>
          </div>
          <div className="grid size-11 place-items-center rounded-full bg-[#22303b] text-[#43d9ad]">
            <Satellite aria-hidden="true" size={24} />
          </div>
          <button
            type="button"
            className="grid size-11 place-items-center rounded-full bg-[#22303b] text-[#c9d4d0]"
            aria-label={t("app.signOut")}
            onClick={onSignOut}
          >
            <LogOut aria-hidden="true" size={20} />
          </button>
        </div>
      </header>

      {activeTab === "base" ? <BaseOverview userId={userId} /> : null}
      {activeTab === "expedition" ? (
        <ExpeditionView userId={userId} onProfileChanged={onProfileChanged} />
      ) : null}
      {activeTab === "tech" ? (
        <TechOverview
          userId={userId}
          xp={gameProfile.xp}
          onChanged={onProfileChanged}
        />
      ) : null}
      {activeTab === "inventory" ? <ResourceInventory userId={userId} /> : null}
      {activeTab === "profile" ? (
        <ProfileOverview
          profile={gameProfile}
          username={username}
          onSignOut={onSignOut}
          onLanguageChange={onLanguageChange}
        />
      ) : null}

      <AppBottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </main>
  );
}

export function MissionApp({
  gameProfile,
  userId,
  username,
  onSignOut,
  onLanguageChange,
  onProfileChanged,
}: {
  gameProfile: PlayerGameProfile;
  userId: string;
  username: string;
  onSignOut: () => void;
  onLanguageChange: (language: Language) => Promise<PlayerGameProfile>;
  onProfileChanged: () => Promise<void>;
}) {
  return (
    <I18nProvider language={gameProfile.language}>
      <MissionAppContent
        gameProfile={gameProfile}
        userId={userId}
        username={username}
        onSignOut={onSignOut}
        onLanguageChange={onLanguageChange}
        onProfileChanged={onProfileChanged}
      />
    </I18nProvider>
  );
}
