"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type PlayerCampfire,
  type PlayerCampfireRow,
  mapPlayerCampfireRow,
} from "@/lib/game/state/player-campfire";
import { getSupabaseClient } from "@/lib/supabase/client";

type PlayerCampfireState = {
  loadedUserId: string | null;
  campfire: PlayerCampfire;
  loading: boolean;
  error: string | null;
  fueling: boolean;
};

function campfireErrorMessage(message: string): string {
  if (/INSUFFICIENT_RESOURCES/i.test(message)) {
    return "Du har inte tillräckligt med trä.";
  }

  if (/INVALID_FUEL_AMOUNT/i.test(message)) {
    return "Välj en giltig mängd trä.";
  }

  if (/permission denied/i.test(message)) {
    return "Supabase saknar rättigheter för lägerelden. Kör senaste SQL-migrationen.";
  }

  return message;
}

export function usePlayerCampfire(userId: string | null) {
  const [state, setState] = useState<PlayerCampfireState>({
    loadedUserId: null,
    campfire: mapPlayerCampfireRow(null),
    loading: Boolean(userId),
    error: null,
    fueling: false,
  });

  const loadCampfire = useCallback(async () => {
    if (!userId) {
      setState({
        loadedUserId: null,
        campfire: mapPlayerCampfireRow(null),
        loading: false,
        error: null,
        fueling: false,
      });
      return;
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("player_campfires")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      setState((current) => ({
        ...current,
        loadedUserId: userId,
        loading: false,
        error: campfireErrorMessage(error.message),
      }));
      return;
    }

    setState((current) => ({
      ...current,
      loadedUserId: userId,
      campfire: mapPlayerCampfireRow(data as PlayerCampfireRow | null),
      loading: false,
      error: null,
    }));
  }, [userId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadCampfire();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadCampfire]);

  const fuelCampfire = useCallback(
    async (woodAmount: number) => {
      if (!userId) {
        throw new Error("Du behöver vara inloggad för att fylla på elden.");
      }

      setState((current) => ({
        ...current,
        fueling: true,
        error: null,
      }));

      const supabase = getSupabaseClient();
      const { data, error } = await supabase.rpc("fuel_player_campfire", {
        input_wood: woodAmount,
      });

      if (error) {
        const message = campfireErrorMessage(error.message);
        setState((current) => ({
          ...current,
          fueling: false,
          error: message,
        }));
        throw new Error(message);
      }

      const row = Array.isArray(data) ? data[0] : null;

      setState((current) => ({
        ...current,
        campfire: {
          burnUntil: typeof row?.burn_until === "string" ? row.burn_until : null,
          lastFueledAt:
            typeof row?.last_fueled_at === "string" ? row.last_fueled_at : null,
          totalWoodBurned: Number(row?.total_wood_burned) || 0,
        },
        fueling: false,
        error: null,
      }));
    },
    [userId],
  );

  const loading = state.loading || (Boolean(userId) && state.loadedUserId !== userId);

  return {
    ...state,
    loading,
    fuelCampfire,
    reloadCampfire: loadCampfire,
  };
}
