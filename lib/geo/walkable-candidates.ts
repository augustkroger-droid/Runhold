import { haversineDistanceMeters } from "@/lib/geo/haversine";
import type { Coordinate } from "@/lib/game/gps/position";

export type WalkableCandidate = Coordinate;

type OverpassElement = {
  type: string;
  id: number;
  tags?: Record<string, string>;
  geometry?: Coordinate[];
};

type OverpassResponse = {
  elements?: OverpassElement[];
};

type WalkableOverpassMode = "strict" | "public-road";

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
const blockedAccessPattern = "^(private|no)$";
const blockedServicePattern = "^(driveway|parking_aisle)$";
const sampleSpacingM = 90;

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
      : `["highway"]["highway"!~"${blockedHighwayPattern}"]`;

  return `
[out:json][timeout:6];
(
  way
    ${highwayFilter}
    ["access"!~"${blockedAccessPattern}"]
    ["foot"!~"${blockedAccessPattern}"]
    ["service"!~"${blockedServicePattern}"]
    ["area"!~"^yes$"]
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

export function parseWalkableCandidates(
  data: OverpassResponse,
  center: Coordinate,
  radiusM: number,
  maxCandidates = 360,
): WalkableCandidate[] {
  const candidates: WalkableCandidate[] = [];
  const seen = new Set<string>();

  for (const element of data.elements ?? []) {
    if (element.type !== "way" || !element.geometry || element.geometry.length < 2) {
      continue;
    }

    for (let index = 1; index < element.geometry.length; index += 1) {
      const start = element.geometry[index - 1];
      const end = element.geometry[index];
      const segmentLengthM = haversineDistanceMeters(start, end);
      const sampleCount = Math.max(1, Math.floor(segmentLengthM / sampleSpacingM));

      for (let sampleIndex = 0; sampleIndex <= sampleCount; sampleIndex += 1) {
        const point = interpolatePoint(start, end, sampleIndex / sampleCount);
        if (haversineDistanceMeters(center, point) > radiusM) continue;

        const key = candidateKey(point);
        if (seen.has(key)) continue;

        seen.add(key);
        candidates.push(point);
      }
    }
  }

  return candidates
    .map((point) => ({
      point,
      distanceM: haversineDistanceMeters(center, point),
    }))
    .sort((left, right) => left.distanceM - right.distanceM)
    .slice(0, maxCandidates)
    .map(({ point }) => point);
}
