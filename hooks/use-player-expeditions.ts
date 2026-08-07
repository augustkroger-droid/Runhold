"use client";

import { useCallback, useState } from "react";
import {
  type ExpeditionRoutePoint,
  type PlayerExpedition,
  type PlayerExpeditionRow,
  mapPlayerExpeditionRow,
} from "@/lib/game/state/player-expeditions";
import { getSupabaseClient } from "@/lib/supabase/client";

type CompletedExpeditionRow = PlayerExpeditionRow & {
  total_xp: number;
};

function expeditionErrorMessage(message: string): string {
  if (/AUTH_REQUIRED/i.test(message)) {
    return "Du behöver vara inloggad.";
  }

  if (/INVALID_EXPEDITION_RESULT/i.test(message)) {
    return "Expeditionen kunde inte sparas.";
  }

  if (/EXPEDITION_ALREADY_ACTIVE/i.test(message)) {
    return "En expedition är redan igång.";
  }

  if (/EXPEDITION_NOT_ACTIVE/i.test(message)) {
    return "Expeditionen är inte aktiv längre.";
  }

  if (/permission denied/i.test(message)) {
    return "Saknar rättigheter för expeditioner. Kör senaste SQL-migrationen.";
  }

  return message;
}

export function usePlayerExpeditions(userId: string | null) {
  const [starting, setStarting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [history, setHistory] = useState<PlayerExpedition[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    if (!userId) {
      setHistory([]);
      return [];
    }

    setLoadingHistory(true);
    setError(null);

    const supabase = getSupabaseClient();
    const { data, error: historyError } = await supabase
      .from("player_expeditions")
      .select(
        "id,user_id,started_at,ended_at,distance_m,duration_seconds,xp_earned,resource_haul,item_haul,route_points",
      )
      .eq("user_id", userId)
      .eq("status", "completed")
      .order("ended_at", { ascending: false })
      .limit(12);

    if (historyError) {
      const message = expeditionErrorMessage(historyError.message);
      setLoadingHistory(false);
      setError(message);
      throw new Error(message);
    }

    const expeditions = ((data ?? []) as PlayerExpeditionRow[]).map(
      mapPlayerExpeditionRow,
    );
    setHistory(expeditions);
    setLoadingHistory(false);
    return expeditions;
  }, [userId]);

  const startExpedition = useCallback(async (): Promise<PlayerExpedition> => {
    if (!userId) {
      throw new Error("Du behöver vara inloggad.");
    }

    setStarting(true);
    setError(null);

    const supabase = getSupabaseClient();
    const { data, error: startError } = await supabase.rpc("start_player_expedition");

    if (startError) {
      const message = expeditionErrorMessage(startError.message);
      setStarting(false);
      setError(message);
      throw new Error(message);
    }

    const row = (Array.isArray(data) ? data[0] : data) as PlayerExpeditionRow | null;

    if (!row) {
      const message = "Expeditionen kunde inte startas.";
      setStarting(false);
      setError(message);
      throw new Error(message);
    }

    setStarting(false);
    return mapPlayerExpeditionRow(row);
  }, [userId]);

  const completeExpedition = useCallback(
    async ({
      expeditionId,
      distanceM,
      durationSeconds,
      routePoints,
    }: {
      expeditionId: string;
      distanceM: number;
      durationSeconds: number;
      routePoints: ExpeditionRoutePoint[];
    }): Promise<{ expedition: PlayerExpedition; totalXp: number }> => {
      if (!userId) {
        throw new Error("Du behöver vara inloggad.");
      }

      setSaving(true);
      setError(null);

      const supabase = getSupabaseClient();
      const { data, error: completeError } = await supabase.rpc(
        "complete_player_expedition",
        {
          input_expedition_id: expeditionId,
          input_distance_m: Math.max(0, Math.round(distanceM)),
          input_duration_seconds: Math.max(0, Math.round(durationSeconds)),
          input_route_points: routePoints,
        },
      );

      if (completeError) {
        const message = expeditionErrorMessage(completeError.message);
        setSaving(false);
        setError(message);
        throw new Error(message);
      }

      const row = (Array.isArray(data) ? data[0] : data) as
        | CompletedExpeditionRow
        | null;

      if (!row) {
        const message = "Expeditionen sparades inte.";
        setSaving(false);
        setError(message);
        throw new Error(message);
      }

      setSaving(false);
      void loadHistory().catch(() => undefined);
      return {
        expedition: mapPlayerExpeditionRow(row),
        totalXp: row.total_xp,
      };
    },
    [loadHistory, userId],
  );

  return {
    starting,
    saving,
    loadingHistory,
    history,
    error,
    loadHistory,
    startExpedition,
    completeExpedition,
  };
}
