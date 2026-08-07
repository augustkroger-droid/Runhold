"use client";

import { useCallback, useEffect, useState } from "react";
import type { ResourceId } from "@/lib/game/definitions/resources";
import {
  type PlayerResourceRow,
  type ResourceBalanceMap,
  createEmptyResourceBalanceMap,
  mapPlayerResourceRows,
} from "@/lib/game/state/player-resources";
import { getSupabaseClient } from "@/lib/supabase/client";

type PlayerResourcesState = {
  loadedUserId: string | null;
  balances: ResourceBalanceMap;
  loading: boolean;
  error: string | null;
  busyResourceId: ResourceId | null;
};

function resourceErrorMessage(message: string): string {
  if (/INSUFFICIENT_RESOURCES/i.test(message)) {
    return "Du har inte tillräckligt mycket av den resursen.";
  }

  if (/UNKNOWN_RESOURCE/i.test(message)) {
    return "Resurstypen finns inte i spelets definitioner.";
  }

  if (/permission denied/i.test(message)) {
    return "Supabase saknar rättigheter för resurstabellerna. Kör senaste SQL-migrationen.";
  }

  return message;
}

export function usePlayerResources(userId: string | null) {
  const [state, setState] = useState<PlayerResourcesState>({
    loadedUserId: null,
    balances: createEmptyResourceBalanceMap(),
    loading: Boolean(userId),
    error: null,
    busyResourceId: null,
  });

  const loadResources = useCallback(async () => {
    if (!userId) {
      setState({
        loadedUserId: null,
        balances: createEmptyResourceBalanceMap(),
        loading: false,
        error: null,
        busyResourceId: null,
      });
      return;
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("player_resources")
      .select("*")
      .eq("user_id", userId);

    if (error) {
      setState((current) => ({
        ...current,
        loadedUserId: userId,
        loading: false,
        error: resourceErrorMessage(error.message),
      }));
      return;
    }

    setState((current) => ({
      ...current,
      loadedUserId: userId,
      balances: mapPlayerResourceRows((data ?? []) as PlayerResourceRow[]),
      loading: false,
      error: null,
    }));
  }, [userId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadResources();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadResources]);

  const adjustResource = useCallback(
    async (resourceId: ResourceId, delta: number) => {
      if (!userId) {
        throw new Error("Du behöver vara inloggad för att ändra resurser.");
      }

      setState((current) => ({
        ...current,
        busyResourceId: resourceId,
        error: null,
      }));

      const supabase = getSupabaseClient();
      const { data, error } = await supabase.rpc("adjust_player_resource", {
        input_delta: delta,
        input_resource_id: resourceId,
      });

      if (error) {
        const message = resourceErrorMessage(error.message);
        setState((current) => ({
          ...current,
          busyResourceId: null,
          error: message,
        }));
        throw new Error(message);
      }

      const updatedRow = Array.isArray(data) ? data[0] : null;
      const quantity = Number(updatedRow?.quantity);

      setState((current) => ({
        ...current,
        balances: {
          ...current.balances,
          [resourceId]: Number.isFinite(quantity)
            ? quantity
            : Math.max(0, current.balances[resourceId] + delta),
        },
        busyResourceId: null,
        error: null,
      }));
    },
    [userId],
  );

  const loading = state.loading || (Boolean(userId) && state.loadedUserId !== userId);

  return {
    ...state,
    loading,
    adjustResource,
    reloadResources: loadResources,
  };
}
