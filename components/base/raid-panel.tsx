"use client";

import { Moon, ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { usePlayerRaids } from "@/hooks/use-player-raids";
import type { PlayerRaid } from "@/lib/game/state/player-raids";
import { formatRemainingDuration, getTimerSnapshot } from "@/lib/game/systems/timers";
import type { TranslationKey } from "@/lib/i18n";

function formatRaidDate(value: string | null, language: string): string {
  if (!value) return "--";

  return new Intl.DateTimeFormat(language === "en" ? "en-US" : "sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function raidCountdownStart(scheduledAt: string): string {
  return new Date(Date.parse(scheduledAt) - 8 * 60 * 60 * 1000).toISOString();
}

function raidOutcomeText(
  raid: PlayerRaid,
  t: (key: TranslationKey) => string,
): string {
  const outcome = raid.damageReport.outcome;

  if (outcome === "held") return t("raid.outcome.held");
  if (outcome === "breached") return t("raid.outcome.breached");
  if (outcome === "damaged") return t("raid.outcome.damaged");

  return "";
}

export function RaidPanel({
  userId,
  onChanged,
}: {
  userId: string;
  onChanged?: () => Promise<void>;
}) {
  const { language, t } = useI18n();
  const {
    scheduledRaid,
    latestResolvedRaid,
    loading,
    error,
    loadRaids,
  } = usePlayerRaids(userId);
  const [now, setNow] = useState(() => new Date().toISOString());
  const scheduledSnapshot = useMemo(() => {
    if (!scheduledRaid) return null;

    return getTimerSnapshot(
      {
        startsAt: raidCountdownStart(scheduledRaid.scheduledAt),
        completesAt: scheduledRaid.scheduledAt,
      },
      now,
    );
  }, [now, scheduledRaid]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(new Date().toISOString());
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (scheduledSnapshot?.status !== "completed") return;

    const timeout = window.setTimeout(() => {
      void loadRaids();
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [loadRaids, scheduledSnapshot?.status]);

  const latestResolvedRaidId = latestResolvedRaid?.id ?? null;

  useEffect(() => {
    if (!latestResolvedRaidId) return;
    void onChanged?.();
  }, [latestResolvedRaidId, onChanged]);

  return (
    <section className="rounded-lg border border-[#f5b84b]/25 bg-[#151d24] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-black text-white">
          <ShieldAlert aria-hidden="true" size={19} className="text-[#f5b84b]" />
          {t("raid.title")}
        </div>
        {loading ? (
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#aeb9b6]">
            {t("common.loading")}
          </span>
        ) : null}
      </div>

      <div className="mt-3 grid gap-3">
        {scheduledRaid ? (
          <div className="rounded-md bg-[#101820] p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="flex items-center gap-1 text-xs font-bold uppercase tracking-[0.12em] text-[#aeb9b6]">
                  <Moon aria-hidden="true" size={14} />
                  {t("raid.next")}
                </p>
                <h3 className="mt-1 text-xl font-black text-white">
                  {scheduledSnapshot
                    ? formatRemainingDuration(scheduledSnapshot.remainingMs)
                    : formatRaidDate(scheduledRaid.scheduledAt, language)}
                </h3>
              </div>
              <div className="rounded-md bg-[#2b2414] px-3 py-2 text-right">
                <p className="text-xs font-black text-[#f5b84b]">
                  {t("raid.threatLevel")}
                </p>
                <p className="font-black text-white">{scheduledRaid.threatLevel}</p>
              </div>
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
              <div className="rounded-md bg-[#18232d] p-2">
                <dt className="text-[#a9cfc3]">{t("raid.enemies")}</dt>
                <dd className="font-black text-white">{scheduledRaid.enemyCount}</dd>
              </div>
              <div className="rounded-md bg-[#18232d] p-2">
                <dt className="text-[#a9cfc3]">{t("raid.damage")}</dt>
                <dd className="font-black text-white">{scheduledRaid.totalDamage}</dd>
              </div>
              <div className="rounded-md bg-[#18232d] p-2">
                <dt className="text-[#a9cfc3]">XP</dt>
                <dd className="font-black text-white">
                  +{scheduledRaid.reward.xp ?? 0}
                </dd>
              </div>
            </dl>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/30">
              <div
                className="h-full rounded-full bg-[#f5b84b]"
                style={{
                  width: `${Math.round((scheduledSnapshot?.progress ?? 0) * 100)}%`,
                }}
              />
            </div>
            <p className="mt-3 text-sm font-bold text-[#c9d4d0]">
              {t("raid.nightOnly")}
            </p>
          </div>
        ) : null}

        {latestResolvedRaid ? (
          <div className="rounded-md bg-[#101820] p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="font-black text-white">{t("raid.latest")}</p>
              <span className="text-xs font-bold text-[#aeb9b6]">
                {formatRaidDate(latestResolvedRaid.resolvedAt, language)}
              </span>
            </div>
            <p className="mt-2 text-sm font-bold text-[#c9d4d0]">
              {raidOutcomeText(latestResolvedRaid, t)}
            </p>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
              <div className="rounded-md bg-[#18232d] p-2">
                <dt className="text-[#a9cfc3]">{t("raid.wallDamage")}</dt>
                <dd className="font-black text-white">
                  {latestResolvedRaid.damageReport.wallDamage ?? 0}
                </dd>
              </div>
              <div className="rounded-md bg-[#18232d] p-2">
                <dt className="text-[#a9cfc3]">{t("raid.tentDamage")}</dt>
                <dd className="font-black text-white">
                  {latestResolvedRaid.damageReport.tentDamage ?? 0}
                </dd>
              </div>
              <div className="rounded-md bg-[#18232d] p-2">
                <dt className="text-[#a9cfc3]">{t("raid.blockedDamage")}</dt>
                <dd className="font-black text-white">
                  {latestResolvedRaid.damageReport.blockedDamage ?? 0}
                </dd>
              </div>
            </dl>
            <div className="mt-2 flex flex-wrap gap-2 text-xs font-black">
              {latestResolvedRaid.damageReport.fireProtected ? (
                <span className="rounded-full bg-[#2b2414] px-3 py-1 text-[#ffe5ad]">
                  {t("raid.fireProtected")}
                </span>
              ) : null}
              {(latestResolvedRaid.damageReport.rewardXp ?? 0) > 0 ? (
                <span className="rounded-full bg-[#14342d] px-3 py-1 text-[#d7fff0]">
                  +{latestResolvedRaid.damageReport.rewardXp} XP
                </span>
              ) : null}
              <span className="rounded-full bg-[#18232d] px-3 py-1 text-[#c9d4d0]">
                {t("raid.enemies")} {latestResolvedRaid.damageReport.enemyCount ?? 0}
              </span>
            </div>
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="mt-3 rounded-md border border-red-400/30 bg-red-950/40 p-3 text-sm leading-6 text-red-100">
          {error}
        </p>
      ) : null}
    </section>
  );
}
