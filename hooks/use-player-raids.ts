"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type PlayerRaid,
  type PlayerRaidRow,
  mapPlayerRaidRow,
} from "@/lib/game/state/player-raids";
import { getSupabaseClient } from "@/lib/supabase/client";

type PlayerRaidsState = {
  loadedUserId: string | null;
  raids: PlayerRaid[];
  loading: boolean;
  error: string | null;
};

function raidErrorMessage(message: string): string {
  if (/RAID_NOT_ACTIVE/i.test(message)) {
    return "Raiden \u00e4r inte aktiv l\u00e4ngre.";
  }

  if (/permission denied/i.test(message)) {
    return "Saknar r\u00e4ttigheter f\u00f6r raids. K\u00f6r senaste SQL-migrationen.";
  }

  return message;
}

export function usePlayerRaids(userId: string | null) {
  const [state, setState] = useState<PlayerRaidsState>({
    loadedUserId: null,
    raids: [],
    loading: Boolean(userId),
    error: null,
  });

  const loadRaids = useCallback(async () => {
    if (!userId) {
      setState({
        loadedUserId: null,
        raids: [],
        loading: false,
        error: null,
      });
      return;
    }

    const { data, error } = await getSupabaseClient().rpc("get_player_raid_state");

    if (error) {
      setState((current) => ({
        ...current,
        loadedUserId: userId,
        loading: false,
        error: raidErrorMessage(error.message),
      }));
      return;
    }

    setState((current) => ({
      ...current,
      loadedUserId: userId,
      raids: ((data ?? []) as PlayerRaidRow[]).map(mapPlayerRaidRow),
      loading: false,
      error: null,
    }));
  }, [userId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadRaids();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadRaids]);

  const scheduledRaid = useMemo(
    () => state.raids.find((raid) => raid.status === "scheduled") ?? null,
    [state.raids],
  );
  const latestResolvedRaid = useMemo(
    () => state.raids.find((raid) => raid.status === "resolved") ?? null,
    [state.raids],
  );
  const loading = state.loading || (Boolean(userId) && state.loadedUserId !== userId);

  return {
    ...state,
    scheduledRaid,
    latestResolvedRaid,
    loading,
    loadRaids,
  };
}
