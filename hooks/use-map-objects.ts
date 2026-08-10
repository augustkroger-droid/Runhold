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
import { haversineDistanceMeters } from "@/lib/geo/haversine";
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
const objectCacheMaxAgeMs = 60 * 60 * 1000;
const heavyRefreshCooldownMs = 4 * 60 * 60 * 1000;

type CachedMapObjects = {
  userId: string;
  center: Coordinate;
  scanRadiusM: number;
  cachedAt: number;
  fullScannedAt: number;
  objects: PlayerMapObject[];
};

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

function mapObjectCacheKey(userId: string): string {
  return `runhold.mapObjects.${userId}`;
}

function isValidCoordinate(
  position: Partial<Coordinate> | null | undefined,
): position is Coordinate {
  if (!position) return false;

  return (
    typeof position.lat === "number" &&
    typeof position.lng === "number" &&
    Number.isFinite(position.lat) &&
    Number.isFinite(position.lng) &&
    Math.abs(position.lat) <= 90 &&
    Math.abs(position.lng) <= 180
  );
}

function recalculateObjectDistances({
  objects,
  center,
  scanRadiusM,
}: {
  objects: PlayerMapObject[];
  center: Coordinate;
  scanRadiusM: number;
}): PlayerMapObject[] {
  return objects
    .filter((object) => typeof object.id === "string" && isValidCoordinate(object.position))
    .map((object) => ({
      ...object,
      distanceM: haversineDistanceMeters(center, object.position),
    }))
    .filter((object) => object.distanceM <= scanRadiusM)
    .sort((first, second) => first.distanceM - second.distanceM)
    .slice(0, 250);
}

function readMapObjectCache({
  userId,
  center,
  scanRadiusM,
}: {
  userId: string;
  center: Coordinate;
  scanRadiusM: number;
}): CachedMapObjects | null {
  if (typeof window === "undefined") return null;

  const stored = window.localStorage.getItem(mapObjectCacheKey(userId));
  if (!stored) return null;

  try {
    const parsed = JSON.parse(stored) as Partial<CachedMapObjects>;
    if (
      parsed.userId !== userId ||
      !isValidCoordinate(parsed.center) ||
      !Array.isArray(parsed.objects) ||
      typeof parsed.cachedAt !== "number" ||
      Date.now() - parsed.cachedAt > objectCacheMaxAgeMs
    ) {
      return null;
    }

    const cachedRadiusM =
      typeof parsed.scanRadiusM === "number" && Number.isFinite(parsed.scanRadiusM)
        ? parsed.scanRadiusM
        : scanRadiusM;
    const centerDistanceM = haversineDistanceMeters(center, parsed.center);
    if (centerDistanceM > Math.min(scanRadiusM, cachedRadiusM)) {
      return null;
    }

    return {
      userId,
      center,
      scanRadiusM,
      cachedAt: parsed.cachedAt,
      fullScannedAt:
        typeof parsed.fullScannedAt === "number" && Number.isFinite(parsed.fullScannedAt)
          ? parsed.fullScannedAt
          : 0,
      objects: recalculateObjectDistances({
        objects: parsed.objects,
        center,
        scanRadiusM,
      }),
    };
  } catch {
    return null;
  }
}

function writeMapObjectCache({
  userId,
  center,
  scanRadiusM,
  objects,
  fullScannedAt,
}: {
  userId: string;
  center: Coordinate;
  scanRadiusM: number;
  objects: PlayerMapObject[];
  fullScannedAt: number;
}) {
  if (typeof window === "undefined") return;

  const cache: CachedMapObjects = {
    userId,
    center,
    scanRadiusM,
    cachedAt: Date.now(),
    fullScannedAt,
    objects: recalculateObjectDistances({ objects, center, scanRadiusM }),
  };

  window.localStorage.setItem(mapObjectCacheKey(userId), JSON.stringify(cache));
}

function removeCachedMapObject(userId: string, objectId: string) {
  if (typeof window === "undefined") return;

  const stored = window.localStorage.getItem(mapObjectCacheKey(userId));
  if (!stored) return;

  try {
    const parsed = JSON.parse(stored) as CachedMapObjects;
    if (parsed.userId !== userId || !Array.isArray(parsed.objects)) return;

    window.localStorage.setItem(
      mapObjectCacheKey(userId),
      JSON.stringify({
        ...parsed,
        cachedAt: Date.now(),
        objects: parsed.objects.filter((object) => object.id !== objectId),
      }),
    );
  } catch {
    window.localStorage.removeItem(mapObjectCacheKey(userId));
  }
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
  const debugRoadResults = await Promise.all(
    directOverpassUrls.map((overpassUrl) =>
      fetchDirectOverpassData(
        overpassUrl,
        buildWalkableOverpassQuery(center, radiusM, "debug-all-roads"),
      ),
    ),
  );
  const debugPaths = debugRoadResults.flatMap((data) =>
    data ? parseWalkablePaths(data, center, radiusM) : [],
  );
  const debugCandidates = cleanWalkableCandidates(
    debugRoadResults.flatMap((data) =>
      data ? parseWalkableCandidates(data, center, radiusM) : [],
    ),
  );

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
          paths:
            debugPaths.length > 0
              ? cleanWalkablePaths(debugPaths)
              : cleanWalkablePaths(parseWalkablePaths(data, center, queryRadiusM)),
          source: `direct-overpass-${queryMode}`,
          radiusM: queryRadiusM,
        };
      }
    }
  }

  if (debugCandidates.length > 0) {
    return {
      candidates: debugCandidates,
      paths: cleanWalkablePaths(debugPaths),
      source: "direct-overpass-debug-safe",
      radiusM,
    };
  }

  return {
    candidates: [],
    paths: cleanWalkablePaths(debugPaths),
    source: "direct-overpass-empty",
    radiusM,
  };
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

async function fetchExistingMapObjects({
  center,
  scanRadiusM,
}: {
  center: Coordinate;
  scanRadiusM: number;
}): Promise<PlayerMapObject[] | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("get_visible_player_map_objects", {
    input_lat: center.lat,
    input_lng: center.lng,
    input_scan_radius_m: Math.round(scanRadiusM),
  });

  if (error) {
    if (error.code === "PGRST202") return null;
    throw new Error(error.message);
  }

  return mapPlayerMapObjectRows((data ?? []) as PlayerMapObjectRow[]);
}

export function useMapObjects(userId: string) {
  const [objects, setObjects] = useState<PlayerMapObject[]>([]);
  const [walkablePaths, setWalkablePaths] = useState<WalkablePath[]>([]);
  const [scanning, setScanning] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scanObjects = useCallback(
    async ({
      center,
      scanRadiusM,
      forceRefresh = false,
    }: {
      center: Coordinate;
      scanRadiusM: number;
      forceRefresh?: boolean;
    }) => {
      setScanning(true);
      setError(null);

      const cached = readMapObjectCache({ userId, center, scanRadiusM });
      const cachedObjects = cached?.objects ?? [];
      let existingObjects: PlayerMapObject[] | null = null;
      let fullScannedAt = cached?.fullScannedAt ?? 0;

      if (cachedObjects.length > 0) {
        setObjects(cachedObjects);
      }

      try {
        existingObjects = await fetchExistingMapObjects({ center, scanRadiusM });

        if (existingObjects) {
          setObjects(existingObjects);
          writeMapObjectCache({
            userId,
            center,
            scanRadiusM,
            objects: existingObjects,
            fullScannedAt,
          });

          const refreshIsRecent = Date.now() - fullScannedAt < heavyRefreshCooldownMs;

          if (!forceRefresh && existingObjects.length > 0) {
            setScanning(false);
            return existingObjects;
          }

          if (!forceRefresh && refreshIsRecent) {
            setScanning(false);
            return existingObjects;
          }
        }
      } catch (fastScanError) {
        if (cachedObjects.length > 0 && !forceRefresh) {
          setScanning(false);
          return cachedObjects;
        }

        if (
          fastScanError instanceof Error &&
          /permission denied/i.test(fastScanError.message)
        ) {
          const message = mapObjectErrorMessage(fastScanError.message);
          setError(message);
          setScanning(false);
          throw new Error(message);
        }
      }

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
      const nextWalkablePaths = mergeWalkablePaths(visibleCandidates.paths, []);
      setWalkablePaths(nextWalkablePaths);

      if (walkableCandidates.length === 0) {
        if (existingObjects && existingObjects.length > 0) {
          setScanning(false);
          return existingObjects;
        }

        if (cachedObjects.length > 0) {
          setScanning(false);
          return cachedObjects;
        }

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
        "scan_player_map_objects",
        scanArgs,
      );

      if (scanError && scanError.code === "PGRST202") {
        const fallbackResult = await supabase.rpc(
          "scan_visible_walkable_map_objects",
          scanArgs,
        );
        data = fallbackResult.data;
        scanError = fallbackResult.error;
      }

      if (scanError) {
        if (existingObjects && existingObjects.length > 0) {
          setScanning(false);
          return existingObjects;
        }

        if (cachedObjects.length > 0) {
          setScanning(false);
          return cachedObjects;
        }

        const message = mapObjectErrorMessage(scanError.message);
        setError(message);
        setScanning(false);
        throw new Error(message);
      }

      const nextObjects = mapPlayerMapObjectRows((data ?? []) as PlayerMapObjectRow[]);
      fullScannedAt = Date.now();
      setObjects(nextObjects);
      writeMapObjectCache({
        userId,
        center,
        scanRadiusM,
        objects: nextObjects,
        fullScannedAt,
      });
      setScanning(false);
      return nextObjects;
    },
    [userId],
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
      removeCachedMapObject(userId, objectId);
      setCollecting(false);
      return {
        objectKind: row?.object_kind === "chest" ? "chest" : "resource",
        resourceId: row?.resource_id ?? "",
        quantity: Number(row?.quantity) || 0,
        itemId: row?.item_id ?? "",
        itemQuantity: Number(row?.item_quantity) || 0,
      };
    },
    [userId],
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
