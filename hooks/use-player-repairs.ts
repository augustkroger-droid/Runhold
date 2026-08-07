"use client";

import { useCallback, useEffect, useState } from "react";
import type { BuildingId } from "@/lib/game/definitions/buildings";
import {
  type PlayerRepair,
  type PlayerRepairRow,
  mapPlayerRepairRows,
} from "@/lib/game/state/player-repairs";
import { getSupabaseClient } from "@/lib/supabase/client";

type PlayerRepairsState = {
  loadedUserId: string | null;
  repairs: PlayerRepair[];
  loading: boolean;
  error: string | null;
  repairing: BuildingId | null;
  damaging: BuildingId | null;
};

function repairErrorMessage(message: string): string {
  if (/INSUFFICIENT_RESOURCES/i.test(message)) {
    return "Du saknar resurser för reparationen.";
  }

  if (/REPAIR_ALREADY_ACTIVE/i.test(message)) {
    return "Reparationen är redan igång.";
  }

  if (/BUILDING_FULL_HP/i.test(message)) {
    return "Byggnaden behöver inte repareras.";
  }

  if (/BUILDING_NOT_FOUND/i.test(message)) {
    return "Byggnaden finns inte ännu.";
  }

  if (/permission denied/i.test(message)) {
    return "Saknar rättigheter för reparationer. Kör senaste SQL-migrationen.";
  }

  return message;
}

export function usePlayerRepairs(userId: string | null) {
  const [state, setState] = useState<PlayerRepairsState>({
    loadedUserId: null,
    repairs: [],
    loading: Boolean(userId),
    error: null,
    repairing: null,
    damaging: null,
  });

  const loadRepairs = useCallback(async () => {
    if (!userId) {
      setState({
        loadedUserId: null,
        repairs: [],
        loading: false,
        error: null,
        repairing: null,
        damaging: null,
      });
      return;
    }

    const supabase = getSupabaseClient();
    await supabase.rpc("complete_ready_repairs");

    const { data, error } = await supabase
      .from("player_repairs")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "active");

    if (error) {
      setState((current) => ({
        ...current,
        loadedUserId: userId,
        loading: false,
        error: repairErrorMessage(error.message),
      }));
      return;
    }

    setState((current) => ({
      ...current,
      loadedUserId: userId,
      repairs: mapPlayerRepairRows((data ?? []) as PlayerRepairRow[]),
      loading: false,
      error: null,
    }));
  }, [userId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadRepairs();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadRepairs]);

  const startRepair = useCallback(
    async (buildingId: BuildingId) => {
      if (!userId) {
        throw new Error("Du behöver vara inloggad.");
      }

      setState((current) => ({ ...current, repairing: buildingId, error: null }));

      const supabase = getSupabaseClient();
      const { error } = await supabase.rpc("start_player_building_repair", {
        input_building_id: buildingId,
      });

      if (error) {
        const message = repairErrorMessage(error.message);
        setState((current) => ({ ...current, repairing: null, error: message }));
        throw new Error(message);
      }

      setState((current) => ({ ...current, repairing: null }));
      await loadRepairs();
    },
    [loadRepairs, userId],
  );

  const damageBuilding = useCallback(
    async (buildingId: BuildingId, damage: number) => {
      if (!userId) {
        throw new Error("Du behöver vara inloggad.");
      }

      setState((current) => ({ ...current, damaging: buildingId, error: null }));

      const supabase = getSupabaseClient();
      const { error } = await supabase.rpc("damage_player_building", {
        input_building_id: buildingId,
        input_damage: damage,
      });

      if (error) {
        const message = repairErrorMessage(error.message);
        setState((current) => ({ ...current, damaging: null, error: message }));
        throw new Error(message);
      }

      setState((current) => ({ ...current, damaging: null }));
      await loadRepairs();
    },
    [loadRepairs, userId],
  );

  const loading = state.loading || (Boolean(userId) && state.loadedUserId !== userId);

  return {
    ...state,
    loading,
    reloadRepairs: loadRepairs,
    startRepair,
    damageBuilding,
  };
}
