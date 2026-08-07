"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type PlayerBuilding,
  type PlayerBuildingRow,
  mapPlayerBuildingRows,
} from "@/lib/game/state/player-buildings";
import { getSupabaseClient } from "@/lib/supabase/client";

type PlayerBuildingsState = {
  loadedUserId: string | null;
  buildings: PlayerBuilding[];
  loading: boolean;
  error: string | null;
};

function buildingErrorMessage(message: string): string {
  if (/permission denied/i.test(message)) {
    return "Supabase saknar rättigheter för bastabellerna. Kör senaste SQL-migrationen.";
  }

  return message;
}

export function usePlayerBuildings(userId: string | null) {
  const [state, setState] = useState<PlayerBuildingsState>({
    loadedUserId: null,
    buildings: mapPlayerBuildingRows([]),
    loading: Boolean(userId),
    error: null,
  });

  const loadBuildings = useCallback(async () => {
    if (!userId) {
      setState({
        loadedUserId: null,
        buildings: mapPlayerBuildingRows([]),
        loading: false,
        error: null,
      });
      return;
    }

    const supabase = getSupabaseClient();
    const { error: initError } = await supabase.rpc("initialize_player_base");

    if (initError) {
      setState((current) => ({
        ...current,
        loadedUserId: userId,
        loading: false,
        error: buildingErrorMessage(initError.message),
      }));
      return;
    }

    const { data, error } = await supabase
      .from("player_buildings")
      .select("*")
      .eq("user_id", userId);

    if (error) {
      setState((current) => ({
        ...current,
        loadedUserId: userId,
        loading: false,
        error: buildingErrorMessage(error.message),
      }));
      return;
    }

    setState({
      loadedUserId: userId,
      buildings: mapPlayerBuildingRows((data ?? []) as PlayerBuildingRow[]),
      loading: false,
      error: null,
    });
  }, [userId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadBuildings();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadBuildings]);

  const loading = state.loading || (Boolean(userId) && state.loadedUserId !== userId);

  return {
    ...state,
    loading,
    reloadBuildings: loadBuildings,
  };
}
