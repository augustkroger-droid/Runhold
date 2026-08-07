"use client";

import { useCallback, useState } from "react";
import {
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

  if (/permission denied/i.test(message)) {
    return "Saknar rättigheter för expeditioner. Kör senaste SQL-migrationen.";
  }

  return message;
}

export function usePlayerExpeditions(userId: string | null) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const completeExpedition = useCallback(
    async ({
      distanceM,
      durationSeconds,
    }: {
      distanceM: number;
      durationSeconds: number;
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
          input_distance_m: Math.max(0, Math.round(distanceM)),
          input_duration_seconds: Math.max(0, Math.round(durationSeconds)),
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
      return {
        expedition: mapPlayerExpeditionRow(row),
        totalXp: row.total_xp,
      };
    },
    [userId],
  );

  return {
    saving,
    error,
    completeExpedition,
  };
}
