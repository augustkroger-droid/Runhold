"use client";

import { LogOut, User } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { TRAINING_LEVELS } from "@/lib/game/definitions/training-levels";
import type { PlayerGameProfile } from "@/lib/game/state/player-profile";
import { type Language, LANGUAGES } from "@/lib/i18n";

export function ProfileOverview({
  profile,
  username,
  onSignOut,
  onLanguageChange,
}: {
  profile: PlayerGameProfile;
  username: string;
  onSignOut: () => void;
  onLanguageChange: (language: Language) => Promise<PlayerGameProfile>;
}) {
  const { t } = useI18n();
  const [savingLanguage, setSavingLanguage] = useState(false);
  const trainingLevel = TRAINING_LEVELS.find(
    (level) => level.id === profile.selectedTrainingLevel,
  );

  return (
    <div className="grid gap-4">
      <section className="rounded-lg border border-white/10 bg-[#18232d] p-4">
        <div className="flex items-center gap-2 font-black text-white">
          <User aria-hidden="true" size={19} />
          {t("nav.profile")}
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-md bg-[#101820] p-3">
            <dt className="text-[#aeb9b6]">{t("profile.player")}</dt>
            <dd className="mt-1 font-black text-white">{username}</dd>
          </div>
          <div className="rounded-md bg-[#101820] p-3">
            <dt className="text-[#aeb9b6]">{t("profile.training")}</dt>
            <dd className="mt-1 font-black text-white">
              {trainingLevel?.name ?? profile.selectedTrainingLevel}
            </dd>
          </div>
          <div className="rounded-md bg-[#101820] p-3">
            <dt className="text-[#aeb9b6]">{t("profile.character")}</dt>
            <dd className="mt-1 font-black text-white">Level {profile.characterLevel}</dd>
          </div>
          <div className="rounded-md bg-[#101820] p-3">
            <dt className="text-[#aeb9b6]">XP</dt>
            <dd className="mt-1 font-black text-white">{profile.xp}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border border-white/10 bg-[#18232d] p-4">
        <div className="font-black text-white">{t("common.language")}</div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {LANGUAGES.map((language) => (
            <button
              key={language}
              type="button"
              className={`min-h-11 rounded-md px-3 font-black ${
                profile.language === language
                  ? "bg-[#14342d] text-[#43d9ad]"
                  : "bg-[#101820] text-[#c9d4d0]"
              } disabled:cursor-wait disabled:opacity-60`}
              disabled={savingLanguage}
              onClick={async () => {
                setSavingLanguage(true);
                await onLanguageChange(language);
                setSavingLanguage(false);
              }}
            >
              {language === "sv" ? t("common.swedish") : t("common.english")}
            </button>
          ))}
        </div>
      </section>

      <button
        type="button"
        className="flex min-h-12 items-center justify-center gap-2 rounded-md bg-[#22303b] px-4 font-black text-white"
        onClick={onSignOut}
      >
        <LogOut aria-hidden="true" size={19} />
        {t("app.signOut")}
      </button>
    </div>
  );
}
