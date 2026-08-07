"use client";

import { useCallback, useState } from "react";
import { MAP_OBJECT_CONFIG } from "@/lib/game/definitions/map-objects";
import type { Coordinate } from "@/lib/game/gps/position";
import {
  type PlayerMapObject,
  type PlayerMapObjectRow,
  mapPlayerMapObjectRows,
} from "@/lib/game/state/map-objects";
import { getSupabaseClient } from "@/lib/supabase/client";

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
      const { data, error: scanError } = await supabase.rpc("scan_player_map_objects", {
        input_lat: center.lat,
        input_lng: center.lng,
        input_scan_radius_m: Math.round(scanRadiusM),
        input_spawn_radius_m: MAP_OBJECT_CONFIG.spawnRadiusM,
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
    }): Promise<{ resourceId: string; quantity: number }> => {
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
        | { resource_id?: string; quantity?: number }
        | null;
      setObjects((current) => current.filter((object) => object.id !== objectId));
      setCollecting(false);
      return {
        resourceId: row?.resource_id ?? "",
        quantity: Number(row?.quantity) || 0,
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
