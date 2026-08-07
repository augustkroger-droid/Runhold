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
  resolving: boolean;
  signaling: boolean;
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
    resolving: false,
    signaling: false,
    error: null,
  });

  const loadRaids = useCallback(async () => {
    if (!userId) {
      setState({
        loadedUserId: null,
        raids: [],
        loading: false,
        resolving: false,
        signaling: false,
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

  const lightSignal = useCallback(async () => {
    if (!userId) {
      throw new Error("Du beh\u00f6ver vara inloggad.");
    }

    setState((current) => ({ ...current, signaling: true, error: null }));

    const { data, error } = await getSupabaseClient().rpc("light_raid_signal");

    if (error) {
      const message = raidErrorMessage(error.message);
      setState((current) => ({
        ...current,
        signaling: false,
        error: message,
      }));
      throw new Error(message);
    }

    setState((current) => ({
      ...current,
      raids: ((data ?? []) as PlayerRaidRow[]).map(mapPlayerRaidRow),
      signaling: false,
      error: null,
    }));
  }, [userId]);

  const resolveRaid = useCallback(
    async (raidId: string) => {
      if (!userId) {
        throw new Error("Du beh\u00f6ver vara inloggad.");
      }

      setState((current) => ({ ...current, resolving: true, error: null }));

      const { data, error } = await getSupabaseClient().rpc("resolve_player_raid", {
        input_raid_id: raidId,
      });

      if (error) {
        const message = raidErrorMessage(error.message);
        setState((current) => ({
          ...current,
          resolving: false,
          error: message,
        }));
        throw new Error(message);
      }

      setState((current) => ({
        ...current,
        raids: ((data ?? []) as PlayerRaidRow[]).map(mapPlayerRaidRow),
        resolving: false,
        error: null,
      }));
    },
    [userId],
  );

  const activeRaid = useMemo(
    () => state.raids.find((raid) => raid.status === "active") ?? null,
    [state.raids],
  );
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
    activeRaid,
    scheduledRaid,
    latestResolvedRaid,
    loading,
    loadRaids,
    lightSignal,
    resolveRaid,
  };
}
