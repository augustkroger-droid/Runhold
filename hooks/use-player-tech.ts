"use client";

import { useCallback, useEffect, useState } from "react";
import type { TechId } from "@/lib/game/definitions/tech";
import {
  type PlayerTech,
  type PlayerTechRow,
  createUnlockedTechSet,
  mapPlayerTechRows,
} from "@/lib/game/state/player-tech";
import { getSupabaseClient } from "@/lib/supabase/client";

type PlayerTechState = {
  loadedUserId: string | null;
  unlocks: PlayerTech[];
  unlockedTechIds: Set<TechId>;
  loading: boolean;
  error: string | null;
  unlocking: TechId | null;
};

function techErrorMessage(message: string): string {
  if (/INSUFFICIENT_XP/i.test(message)) {
    return "Du behöver mer XP.";
  }

  if (/PREREQUISITE_MISSING/i.test(message)) {
    return "Du behöver låsa upp tidigare kunskap först.";
  }

  if (/TECH_ALREADY_UNLOCKED/i.test(message)) {
    return "Detta är redan upplåst.";
  }

  if (/permission denied/i.test(message)) {
    return "Saknar rättigheter för tech tree. Kör senaste SQL-migrationen.";
  }

  return message;
}

export function usePlayerTech(userId: string | null) {
  const [state, setState] = useState<PlayerTechState>({
    loadedUserId: null,
    unlocks: [],
    unlockedTechIds: new Set(),
    loading: Boolean(userId),
    error: null,
    unlocking: null,
  });

  const loadTech = useCallback(async () => {
    if (!userId) {
      setState({
        loadedUserId: null,
        unlocks: [],
        unlockedTechIds: new Set(),
        loading: false,
        error: null,
        unlocking: null,
      });
      return;
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("player_tech")
      .select("*")
      .eq("user_id", userId);

    if (error) {
      setState((current) => ({
        ...current,
        loadedUserId: userId,
        loading: false,
        error: techErrorMessage(error.message),
      }));
      return;
    }

    const unlocks = mapPlayerTechRows((data ?? []) as PlayerTechRow[]);
    setState((current) => ({
      ...current,
      loadedUserId: userId,
      unlocks,
      unlockedTechIds: createUnlockedTechSet(unlocks),
      loading: false,
      error: null,
    }));
  }, [userId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadTech();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadTech]);

  const unlockTech = useCallback(
    async (techId: TechId) => {
      if (!userId) {
        throw new Error("Du behöver vara inloggad.");
      }

      setState((current) => ({ ...current, unlocking: techId, error: null }));

      const supabase = getSupabaseClient();
      const { error } = await supabase.rpc("unlock_player_tech", {
        input_tech_id: techId,
      });

      if (error) {
        const message = techErrorMessage(error.message);
        setState((current) => ({ ...current, unlocking: null, error: message }));
        throw new Error(message);
      }

      setState((current) => ({ ...current, unlocking: null }));
      await loadTech();
    },
    [loadTech, userId],
  );

  const loading = state.loading || (Boolean(userId) && state.loadedUserId !== userId);

  return {
    ...state,
    loading,
    reloadTech: loadTech,
    unlockTech,
  };
}
