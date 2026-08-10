"use client";

import { useCallback, useState } from "react";
import { MAP_OBJECT_CONFIG } from "@/lib/game/definitions/map-objects";
import type { Coordinate } from "@/lib/game/gps/position";
import {
  buildWalkableOverpassQuery,
  parseWalkableCandidates,
  parseWalkablePaths,
  type OverpassResponse,
  type WalkableCandidate,
  type WalkableOverpassMode,
  type WalkablePath,
} from "@/lib/geo/walkable-candidates";
import {
  type PlayerMapObject,
  type PlayerMapObjectRow,
  mapPlayerMapObjectRows,
} from "@/lib/game/state/map-objects";
import { getSupabaseClient } from "@/lib/supabase/client";

type WalkableCandidateResponse = {
  candidates: WalkableCandidate[];
  paths: WalkablePath[];
  source: string;
  radiusM: number;
};

const walkableCandidateTimeoutMs = 12_000;
const directOverpassTimeoutMs = 6_000;
const directOverpassUrls = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const directOverpassModes: readonly WalkableOverpassMode[] = [
  "strict",
  "public-road",
];

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

function cleanWalkableCandidates(candidates: WalkableCandidate[]): WalkableCandidate[] {
  return candidates.filter(
    (candidate) =>
      Number.isFinite(candidate.lat) &&
      Number.isFinite(candidate.lng) &&
      Math.abs(candidate.lat) <= 90 &&
      Math.abs(candidate.lng) <= 180,
  );
}

function cleanWalkablePaths(paths: WalkablePath[]): WalkablePath[] {
  return paths.filter((path) => path.points.length >= 2);
}

async function fetchDirectOverpassData(
  overpassUrl: string,
  query: string,
): Promise<OverpassResponse | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), directOverpassTimeoutMs);

  try {
    const response = await fetch(overpassUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ data: query }),
      signal: controller.signal,
    });

    if (!response.ok) return null;

    return response.json() as Promise<OverpassResponse>;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchDirectWalkableCandidates({
  center,
  radiusM,
}: {
  center: Coordinate;
  radiusM: number;
}): Promise<WalkableCandidateResponse> {
  const queryRadiiM = Array.from(
    new Set([radiusM, Math.min(radiusM, 2000), Math.min(radiusM, 1200)]),
  ).filter((nextRadiusM) => nextRadiusM >= 250 && nextRadiusM <= radiusM);

  for (const queryRadiusM of queryRadiiM) {
    for (const queryMode of directOverpassModes) {
      const query = buildWalkableOverpassQuery(center, queryRadiusM, queryMode);
      const results = await Promise.all(
        directOverpassUrls.map((overpassUrl) =>
          fetchDirectOverpassData(overpassUrl, query),
        ),
      );

      for (const data of results) {
        if (!data) continue;

        const candidates = cleanWalkableCandidates(
          parseWalkableCandidates(data, center, queryRadiusM),
        );

        if (candidates.length === 0) continue;

        return {
          candidates,
          paths: cleanWalkablePaths(parseWalkablePaths(data, center, queryRadiusM)),
          source: `direct-overpass-${queryMode}`,
          radiusM: queryRadiusM,
        };
      }
    }
  }

  return { candidates: [], paths: [], source: "direct-overpass-empty", radiusM };
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
      return { candidates: [], paths: [], source: "walkable-api-error", radiusM };
    }

    const data = (await response.json()) as {
      candidates?: WalkableCandidate[];
      paths?: WalkablePath[];
      source?: string;
      radiusM?: number;
    };

    const apiResult = {
      candidates: cleanWalkableCandidates(data.candidates ?? []),
      paths: cleanWalkablePaths(data.paths ?? []),
      source: data.source ?? "unknown",
      radiusM: data.radiusM ?? radiusM,
    };

    if (apiResult.candidates.length > 0) {
      return apiResult;
    }

    return fetchDirectWalkableCandidates({ center, radiusM });
  } catch {
    return fetchDirectWalkableCandidates({ center, radiusM });
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

function mergeWalkablePaths(
  primary: WalkablePath[],
  secondary: WalkablePath[],
): WalkablePath[] {
  const merged: WalkablePath[] = [];
  const seen = new Set<string>();

  for (const path of [...primary, ...secondary]) {
    if (seen.has(path.id)) continue;

    seen.add(path.id);
    merged.push(path);
  }

  return merged;
}

export function useMapObjects() {
  const [objects, setObjects] = useState<PlayerMapObject[]>([]);
  const [walkablePaths, setWalkablePaths] = useState<WalkablePath[]>([]);
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
              paths: [],
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
      const nextWalkablePaths = mergeWalkablePaths(
        visibleCandidates.paths,
        [],
      );
      setWalkablePaths(nextWalkablePaths);

      if (walkableCandidates.length === 0) {
        const message =
          "Inga säkra fyndplatser hittades i närheten. Testa att scanna igen om en stund.";
        setError(message);
        setScanning(false);
        throw new Error(message);
      }

      const scanArgs = {
        input_lat: center.lat,
        input_lng: center.lng,
        input_scan_radius_m: Math.round(scanRadiusM),
        input_spawn_radius_m: MAP_OBJECT_CONFIG.spawnRadiusM,
        input_walkable_candidates: walkableCandidates,
      };
      let { data, error: scanError } = await supabase.rpc(
        "scan_visible_walkable_map_objects",
        scanArgs,
      );

      if (scanError && scanError.code === "PGRST202") {
        const fallbackResult = await supabase.rpc("scan_player_map_objects", scanArgs);
        data = fallbackResult.data;
        scanError = fallbackResult.error;
      }

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
    walkablePaths,
    scanning,
    collecting,
    error,
    scanObjects,
    collectObject,
  };
}
