"use client";

import { Axe, LogOut, Package, User } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { usePlayerItems } from "@/hooks/use-player-items";
import { TRAINING_LEVELS } from "@/lib/game/definitions/training-levels";
import type { PlayerGameProfile } from "@/lib/game/state/player-profile";
import { type Language, LANGUAGES, itemName } from "@/lib/i18n";

export function ProfileOverview({
  profile,
  userId,
  username,
  onSignOut,
  onLanguageChange,
}: {
  profile: PlayerGameProfile;
  userId: string;
  username: string;
  onSignOut: () => void;
  onLanguageChange: (language: Language) => Promise<PlayerGameProfile>;
}) {
  const { language, t } = useI18n();
  const [savingLanguage, setSavingLanguage] = useState(false);
  const [itemActionError, setItemActionError] = useState<string | null>(null);
  const {
    definitionsById,
    equipmentBySlot,
    items,
    loading: loadingItems,
    busySlotId,
    error: itemError,
    equipItem,
  } = usePlayerItems(userId);
  const trainingLevel = TRAINING_LEVELS.find(
    (level) => level.id === profile.selectedTrainingLevel,
  );
  const equippedTool = equipmentBySlot.get("tool")?.itemId ?? null;
  const currentLevelStartXp = Math.max(0, (profile.characterLevel - 1) * 250);
  const nextLevelXp = profile.characterLevel * 250;
  const xpInCurrentLevel = Math.max(0, profile.xp - currentLevelStartXp);
  const xpForNextLevel = Math.max(1, nextLevelXp - currentLevelStartXp);
  const levelProgress = Math.min(100, (xpInCurrentLevel / xpForNextLevel) * 100);

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
        <div className="mt-3 rounded-md bg-[#101820] p-3">
          <div className="flex items-center justify-between text-sm font-bold">
            <span className="text-[#aeb9b6]">{t("profile.levelProgress")}</span>
            <span className="text-white">
              {xpInCurrentLevel}/{xpForNextLevel} XP
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#22303b]">
            <div
              className="h-full rounded-full bg-[#43d9ad]"
              style={{ width: `${levelProgress}%` }}
            />
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-white/10 bg-[#18232d] p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-black text-white">
            <Axe aria-hidden="true" size={19} />
            {t("profile.leader")}
          </div>
          {loadingItems ? (
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#aeb9b6]">
              {t("common.loading")}
            </span>
          ) : null}
        </div>

        <div className="mt-3 grid gap-3">
          <div className="grid grid-cols-[auto_1fr] items-center gap-3 rounded-md bg-[#101820] p-3">
            <div className="grid size-11 place-items-center rounded-md bg-[#22303b] text-[#43d9ad]">
              <Axe aria-hidden="true" size={22} />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#aeb9b6]">
                {t("profile.tool")}
              </p>
              <p className="mt-1 font-black text-white">
                {equippedTool ? itemName(language, equippedTool) : t("profile.noTool")}
              </p>
            </div>
          </div>

          <div className="rounded-md bg-[#101820] p-3">
            <div className="flex items-center gap-2 font-black text-white">
              <Package aria-hidden="true" size={18} />
              {t("profile.inventory")}
            </div>
            {items.length > 0 ? (
              <div className="mt-3 grid gap-2">
                {items.map((item) => {
                  const definition = definitionsById.get(item.itemId);
                  const isEquipped = equippedTool === item.itemId;
                  const canEquip = definition?.itemKind === "tool";

                  return (
                    <div
                      key={item.itemId}
                      className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-md bg-[#18232d] p-3"
                    >
                      <div>
                        <p className="font-black text-white">
                          {itemName(language, item.itemId)}
                        </p>
                        <p className="mt-1 text-sm font-bold text-[#aeb9b6]">
                          x{item.quantity}
                        </p>
                      </div>
                      {canEquip ? (
                        <button
                          type="button"
                          className={`min-h-10 rounded-md px-3 text-sm font-black ${
                            isEquipped
                              ? "bg-[#14342d] text-[#43d9ad]"
                              : "bg-[#315f36] text-white"
                          } disabled:cursor-wait disabled:opacity-60`}
                          disabled={isEquipped || busySlotId === "tool"}
                          onClick={async () => {
                            setItemActionError(null);
                            try {
                              await equipItem("tool", item.itemId);
                            } catch (error) {
                              setItemActionError(
                                error instanceof Error
                                  ? error.message
                                  : "Kunde inte utrusta itemet.",
                              );
                            }
                          }}
                        >
                          {isEquipped ? t("profile.equipped") : t("profile.equip")}
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-3 rounded-md bg-[#18232d] p-3 text-sm text-[#aeb9b6]">
                {t("profile.itemsEmpty")}
              </p>
            )}
          </div>
        </div>

        {itemActionError || itemError ? (
          <p className="mt-3 rounded-md border border-red-400/30 bg-red-950/40 p-3 text-sm leading-6 text-red-100">
            {itemActionError ?? itemError}
          </p>
        ) : null}
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
