"use client";

import { useCallback, useEffect, useState } from "react";
import type { ConstructionId } from "@/lib/game/definitions/construction";
import {
  type PlayerConstruction,
  type PlayerConstructionRow,
  mapPlayerConstructionRows,
} from "@/lib/game/state/player-constructions";
import { getSupabaseClient } from "@/lib/supabase/client";

type PlayerConstructionsState = {
  loadedUserId: string | null;
  constructions: PlayerConstruction[];
  loading: boolean;
  error: string | null;
  starting: ConstructionId | null;
};

function constructionErrorMessage(message: string): string {
  if (/INSUFFICIENT_RESOURCES/i.test(message)) {
    return "Du saknar resurser för byggnationen.";
  }

  if (/CONSTRUCTION_ALREADY_ACTIVE/i.test(message)) {
    return "En byggnation pågår redan för detta objekt.";
  }

  if (/TARGET_ALREADY_BUILT/i.test(message)) {
    return "Detta är redan byggt.";
  }

  if (/TECH_REQUIRED/i.test(message)) {
    return "Du behöver låsa upp detta i tech tree först.";
  }

  if (/permission denied/i.test(message)) {
    return "Supabase saknar rättigheter för byggnation. Kör senaste SQL-migrationen.";
  }

  return message;
}

export function usePlayerConstructions(userId: string | null) {
  const [state, setState] = useState<PlayerConstructionsState>({
    loadedUserId: null,
    constructions: [],
    loading: Boolean(userId),
    error: null,
    starting: null,
  });

  const loadConstructions = useCallback(async () => {
    if (!userId) {
      setState({
        loadedUserId: null,
        constructions: [],
        loading: false,
        error: null,
        starting: null,
      });
      return;
    }

    const supabase = getSupabaseClient();
    await supabase.rpc("complete_ready_constructions");

    const { data, error } = await supabase
      .from("player_constructions")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active");

    if (error) {
      setState((current) => ({
        ...current,
        loadedUserId: userId,
        loading: false,
        error: constructionErrorMessage(error.message),
      }));
      return;
    }

    setState((current) => ({
      ...current,
      loadedUserId: userId,
      constructions: mapPlayerConstructionRows((data ?? []) as PlayerConstructionRow[]),
      loading: false,
      error: null,
    }));
  }, [userId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadConstructions();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadConstructions]);

  const startConstruction = useCallback(
    async (constructionId: ConstructionId) => {
      if (!userId) {
        throw new Error("Du behöver vara inloggad för att bygga.");
      }

      setState((current) => ({
        ...current,
        starting: constructionId,
        error: null,
      }));

      const supabase = getSupabaseClient();
      const { error } = await supabase.rpc("start_player_construction", {
        input_construction_id: constructionId,
      });

      if (error) {
        const message = constructionErrorMessage(error.message);
        setState((current) => ({
          ...current,
          starting: null,
          error: message,
        }));
        throw new Error(message);
      }

      setState((current) => ({
        ...current,
        starting: null,
      }));
      await loadConstructions();
    },
    [loadConstructions, userId],
  );

  const loading = state.loading || (Boolean(userId) && state.loadedUserId !== userId);

  return {
    ...state,
    loading,
    startConstruction,
    reloadConstructions: loadConstructions,
  };
}
