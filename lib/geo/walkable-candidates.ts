import { haversineDistanceMeters } from "@/lib/geo/haversine";
import type { Coordinate } from "@/lib/game/gps/position";

export type WalkableCandidate = Coordinate;
export type WalkablePath = {
  id: string;
  highway: string;
  points: Coordinate[];
};

type OverpassElement = {
  type: string;
  id: number;
  tags?: Record<string, string>;
  geometry?: OverpassGeometryPoint[];
};

export type OverpassResponse = {
  elements?: OverpassElement[];
};

type OverpassGeometryPoint = {
  lat: number;
  lon?: number;
  lng?: number;
};

export type WalkableOverpassMode = "strict" | "public-road" | "debug-all-roads";

const allowedHighways = [
  "footway",
  "path",
  "pedestrian",
  "living_street",
  "residential",
  "service",
  "unclassified",
  "tertiary",
  "track",
  "cycleway",
  "steps",
] as const;

const blockedHighwayPattern =
  "^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|construction|raceway)$";
const blockedAccessValues = new Set(["private", "no"]);
const blockedServiceValues = new Set(["driveway", "parking_aisle"]);
const sampleSpacingM = 70;
const nearestCandidateReserve = 60;

export function boundingBoxForRadius(center: Coordinate, radiusM: number) {
  const latDelta = radiusM / 111_320;
  const lngDelta = radiusM / (111_320 * Math.cos((center.lat * Math.PI) / 180));

  return {
    south: center.lat - latDelta,
    west: center.lng - lngDelta,
    north: center.lat + latDelta,
    east: center.lng + lngDelta,
  };
}

export function buildWalkableOverpassQuery(
  center: Coordinate,
  radiusM: number,
  mode: WalkableOverpassMode = "strict",
): string {
  const highways = allowedHighways.join("|");
  const roundedRadiusM = Math.round(radiusM);
  const highwayFilter =
    mode === "strict"
      ? `["highway"~"^(${highways})$"]`
      : mode === "public-road"
        ? `["highway"]["highway"!~"${blockedHighwayPattern}"]`
        : `["highway"]`;

  return `
[out:json][timeout:6];
(
  way
    ${highwayFilter}
    (around:${roundedRadiusM},${center.lat},${center.lng});
);
out body geom;
`.trim();
}

function interpolatePoint(start: Coordinate, end: Coordinate, fraction: number): Coordinate {
  return {
    lat: start.lat + (end.lat - start.lat) * fraction,
    lng: start.lng + (end.lng - start.lng) * fraction,
  };
}

function candidateKey(point: Coordinate): string {
  return `${point.lat.toFixed(5)}:${point.lng.toFixed(5)}`;
}

function normalizeCoordinate(point: OverpassGeometryPoint): Coordinate | null {
  const lng = point.lng ?? point.lon;

  if (
    lng === undefined ||
    !Number.isFinite(point.lat) ||
    !Number.isFinite(lng) ||
    Math.abs(point.lat) > 90 ||
    Math.abs(lng) > 180
  ) {
    return null;
  }

  return {
    lat: point.lat,
    lng,
  };
}

function isValidCoordinate(point: Coordinate): boolean {
  return (
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lng) <= 180
  );
}

function isSpawnSafeElement(element: OverpassElement): boolean {
  const highway = element.tags?.highway;
  if (!highway) return false;

  if (new RegExp(blockedHighwayPattern).test(highway)) return false;
  if (blockedAccessValues.has(element.tags?.access ?? "")) return false;
  if (blockedAccessValues.has(element.tags?.foot ?? "")) return false;
  if (blockedServiceValues.has(element.tags?.service ?? "")) return false;
  if (element.tags?.area === "yes") return false;

  return true;
}

export function parseWalkableCandidates(
  data: OverpassResponse,
  center: Coordinate,
  radiusM: number,
  maxCandidates = 900,
): WalkableCandidate[] {
  const candidates: WalkableCandidate[] = [];
  const seen = new Set<string>();

  for (const element of data.elements ?? []) {
    if (element.type !== "way" || !element.geometry || element.geometry.length < 2) {
      continue;
    }
    if (!isSpawnSafeElement(element)) continue;

    for (let index = 1; index < element.geometry.length; index += 1) {
      const start = normalizeCoordinate(element.geometry[index - 1]);
      const end = normalizeCoordinate(element.geometry[index]);
      if (!start || !end) continue;

      const segmentLengthM = haversineDistanceMeters(start, end);
      const sampleCount = Math.max(1, Math.floor(segmentLengthM / sampleSpacingM));

      for (let sampleIndex = 0; sampleIndex <= sampleCount; sampleIndex += 1) {
        const point = interpolatePoint(start, end, sampleIndex / sampleCount);
        if (!isValidCoordinate(point)) continue;
        if (haversineDistanceMeters(center, point) > radiusM) continue;

        const key = candidateKey(point);
        if (seen.has(key)) continue;

        seen.add(key);
        candidates.push(point);
      }
    }
  }

  const sortedCandidates = candidates
    .map((point) => ({
      point,
      distanceM: haversineDistanceMeters(center, point),
    }))
    .sort((left, right) => left.distanceM - right.distanceM);

  if (sortedCandidates.length <= maxCandidates) {
    return sortedCandidates.map(({ point }) => point);
  }

  const reservedCount = Math.min(
    nearestCandidateReserve,
    Math.max(1, Math.floor(maxCandidates * 0.4)),
  );
  const reserved = sortedCandidates.slice(0, reservedCount);
  const spreadSource = sortedCandidates.slice(reservedCount);
  const spreadCount = maxCandidates - reserved.length;
  const step = spreadSource.length / spreadCount;
  const spread = Array.from({ length: spreadCount }, (_, index) => {
    return spreadSource[Math.floor(index * step)];
  }).filter((candidate): candidate is (typeof sortedCandidates)[number] => Boolean(candidate));

  return [...reserved, ...spread].map(({ point }) => point);
}

export function parseWalkablePaths(
  data: OverpassResponse,
  center: Coordinate,
  radiusM: number,
  maxPaths = 260,
): WalkablePath[] {
  return (data.elements ?? [])
    .filter(
      (element) =>
        element.type === "way" &&
        Array.isArray(element.geometry) &&
        element.geometry.length >= 2,
    )
    .map((element) => {
      const points = (element.geometry ?? []).flatMap((point) => {
        const coordinate = normalizeCoordinate(point);
        return coordinate && isValidCoordinate(coordinate) ? [coordinate] : [];
      });
      const nearestDistanceM = Math.min(
        ...points.map((point) => haversineDistanceMeters(center, point)),
      );
      const displayPoints = points.filter(
        (point) => haversineDistanceMeters(center, point) <= radiusM + 160,
      );

      return {
        path: {
          id: String(element.id),
          highway: element.tags?.highway ?? "path",
          points: displayPoints.length >= 2 ? displayPoints : points.slice(0, 60),
        },
        nearestDistanceM,
      };
    })
    .filter(({ path, nearestDistanceM }) => {
      return path.points.length >= 2 && nearestDistanceM <= radiusM + 160;
    })
    .sort((left, right) => left.nearestDistanceM - right.nearestDistanceM)
    .slice(0, maxPaths)
    .map(({ path }) => path);
}
