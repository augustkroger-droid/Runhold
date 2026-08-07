"use client";

import { useCallback, useState } from "react";
import { MAP_OBJECT_CONFIG } from "@/lib/game/definitions/map-objects";
import type { Coordinate } from "@/lib/game/gps/position";
import type { WalkableCandidate } from "@/lib/geo/walkable-candidates";
import {
  type PlayerMapObject,
  type PlayerMapObjectRow,
  mapPlayerMapObjectRows,
} from "@/lib/game/state/map-objects";
import { getSupabaseClient } from "@/lib/supabase/client";

type WalkableCandidateResponse = {
  candidates: WalkableCandidate[];
  source: string;
  radiusM: number;
};

const walkableCandidateTimeoutMs = 12_000;

function mapObjectErrorMessage(message: string): string {
  if (/MAP_OBJECT_NOT_FOUND/i.test(message)) {
    return "Fyndet finns inte längre.";
  }

  if (/MAP_OBJECT_TOO_FAR/i.test(message)) {
    return "Du är för långt bort.";
  }

  if (/MAP_OBJECT_ALREADY_COLLECTED/i.test(message)) {
    return "Fyndet är redan hämtat.";
  }

  if (/permission denied/i.test(message)) {
    return "Saknar rättigheter för kartobjekt. Kör senaste SQL-migrationen.";
  }

  return message;
}

async function fetchWalkableCandidates({
  center,
  radiusM,
}: {
  center: Coordinate;
  radiusM: number;
}): Promise<WalkableCandidateResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), walkableCandidateTimeoutMs);
  const params = new URLSearchParams({
    lat: String(center.lat),
    lng: String(center.lng),
    radiusM: String(Math.round(radiusM)),
  });

  try {
    const response = await fetch(`/api/walkable-candidates?${params.toString()}`, {
      signal: controller.signal,
    });

    if (!response.ok) {
      return { candidates: [], source: "walkable-api-error", radiusM };
    }

    const data = (await response.json()) as {
      candidates?: WalkableCandidate[];
      source?: string;
      radiusM?: number;
    };

    return {
      candidates: (data.candidates ?? []).filter(
        (candidate) =>
          Number.isFinite(candidate.lat) &&
          Number.isFinite(candidate.lng) &&
          Math.abs(candidate.lat) <= 90 &&
          Math.abs(candidate.lng) <= 180,
      ),
      source: data.source ?? "unknown",
      radiusM: data.radiusM ?? radiusM,
    };
  } catch {
    return { candidates: [], source: "walkable-api-error", radiusM };
  } finally {
    clearTimeout(timeoutId);
  }
}

function mergeWalkableCandidates(
  primary: WalkableCandidate[],
  secondary: WalkableCandidate[],
): WalkableCandidate[] {
  const merged: WalkableCandidate[] = [];
  const seen = new Set<string>();

  for (const candidate of [...primary, ...secondary]) {
    const key = `${candidate.lat.toFixed(5)}:${candidate.lng.toFixed(5)}`;
    if (seen.has(key)) continue;

    seen.add(key);
    merged.push(candidate);
  }

  return merged;
}

export function useMapObjects() {
  const [objects, setObjects] = useState<PlayerMapObject[]>([]);
  const [scanning, setScanning] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scanObjects = useCallback(
    async ({
      center,
      scanRadiusM,
    }: {
      center: Coordinate;
      scanRadiusM: number;
    }) => {
      setScanning(true);
      setError(null);

      const supabase = getSupabaseClient();
      const visibleCandidates = await fetchWalkableCandidates({
        center,
        radiusM: scanRadiusM,
      });
      const widerCandidates =
        visibleCandidates.candidates.length === 0 ||
        visibleCandidates.candidates.length >= 24
          ? {
              candidates: [],
              source:
                visibleCandidates.candidates.length === 0
                  ? "visible-candidates-empty"
                  : "visible-candidates-enough",
              radiusM: scanRadiusM,
            }
          : await fetchWalkableCandidates({
              center,
              radiusM: MAP_OBJECT_CONFIG.spawnRadiusM,
            });
      const walkableCandidates = mergeWalkableCandidates(
        visibleCandidates.candidates,
        widerCandidates.candidates,
      );

      if (walkableCandidates.length === 0) {
        const message =
          "Inga säkra fyndplatser hittades i närheten. Testa att scanna igen om en stund.";
        setError(message);
        setScanning(false);
        throw new Error(message);
      }

      const { data, error: scanError } = await supabase.rpc("scan_player_map_objects", {
        input_lat: center.lat,
        input_lng: center.lng,
        input_scan_radius_m: Math.round(scanRadiusM),
        input_spawn_radius_m: MAP_OBJECT_CONFIG.spawnRadiusM,
        input_walkable_candidates: walkableCandidates,
      });

      if (scanError) {
        const message = mapObjectErrorMessage(scanError.message);
        setError(message);
        setScanning(false);
        throw new Error(message);
      }

      const nextObjects = mapPlayerMapObjectRows((data ?? []) as PlayerMapObjectRow[]);
      setObjects(nextObjects);
      setScanning(false);
      return nextObjects;
    },
    [],
  );

  const collectObject = useCallback(
    async ({
      objectId,
      position,
      expeditionId,
    }: {
      objectId: string;
      position: Coordinate;
      expeditionId: string;
    }): Promise<{
      objectKind: "resource" | "chest";
      resourceId: string;
      quantity: number;
      itemId: string;
      itemQuantity: number;
    }> => {
      setCollecting(true);
      setError(null);

      const supabase = getSupabaseClient();
      const { data, error: collectError } = await supabase.rpc(
        "collect_player_map_object",
        {
          input_expedition_id: expeditionId,
          input_object_id: objectId,
          input_lat: position.lat,
          input_lng: position.lng,
          input_collect_radius_m: MAP_OBJECT_CONFIG.collectRadiusM,
        },
      );

      if (collectError) {
        const message = mapObjectErrorMessage(collectError.message);
        setError(message);
        setCollecting(false);
        throw new Error(message);
      }

      const row = (Array.isArray(data) ? data[0] : data) as
        | {
            object_kind?: string;
            resource_id?: string | null;
            quantity?: number;
            item_id?: string | null;
            item_quantity?: number;
          }
        | null;
      setObjects((current) => current.filter((object) => object.id !== objectId));
      setCollecting(false);
      return {
        objectKind: row?.object_kind === "chest" ? "chest" : "resource",
        resourceId: row?.resource_id ?? "",
        quantity: Number(row?.quantity) || 0,
        itemId: row?.item_id ?? "",
        itemQuantity: Number(row?.item_quantity) || 0,
      };
    },
    [],
  );

  return {
    objects,
    scanning,
    collecting,
    error,
    scanObjects,
    collectObject,
  };
}
