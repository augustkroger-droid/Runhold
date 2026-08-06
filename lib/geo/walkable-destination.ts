import { destinationPoint } from "@/lib/geo/destination-point";
import { haversineDistanceMeters } from "@/lib/geo/haversine";
import type { Coordinate } from "@/lib/types/mission";

type OverpassGeometryPoint = {
  lat: number;
  lon: number;
};

type OverpassWay = {
  type: "way";
  tags?: Record<string, string>;
  geometry?: OverpassGeometryPoint[];
};

type OverpassResponse = {
  elements?: OverpassWay[];
};

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const MIN_TARGET_DISTANCE_M = 430;
const MAX_TARGET_DISTANCE_M = 570;

function fallbackDestination(start: Coordinate): Coordinate {
  return destinationPoint(start, Math.random() * 360, 500);
}

function wayPriority(tags?: Record<string, string>): number {
  const highway = tags?.highway;

  if (highway === "footway" || highway === "pedestrian" || highway === "path") {
    return 0;
  }

  if (highway === "cycleway" || highway === "living_street") {
    return 15;
  }

  if (highway === "residential" || highway === "service" || highway === "track") {
    return 30;
  }

  return 60;
}

export async function createWalkableDestination(start: Coordinate): Promise<{
  destination: Coordinate;
  source: "osm-walkable" | "fallback";
}> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8_000);

  const query = `
    [out:json][timeout:7];
    way(around:720,${start.lat},${start.lng})
      ["highway"~"footway|path|pedestrian|cycleway|living_street|residential|service|track"]
      ["access"!~"private|no"];
    out geom;
  `;

  try {
    const response = await fetch(OVERPASS_URL, {
      method: "POST",
      body: new URLSearchParams({ data: query }),
      signal: controller.signal,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
    });

    if (!response.ok) {
      throw new Error("Overpass svarade inte OK.");
    }

    const data = (await response.json()) as OverpassResponse;
    const candidates =
      data.elements
        ?.flatMap((way) =>
          (way.geometry ?? []).map((point) => {
            const candidate = { lat: point.lat, lng: point.lon };
            const distance = haversineDistanceMeters(start, candidate);

            return {
              point: candidate,
              score: Math.abs(distance - 500) + wayPriority(way.tags),
              distance,
            };
          }),
        )
        .filter(
          (candidate) =>
            candidate.distance >= MIN_TARGET_DISTANCE_M &&
            candidate.distance <= MAX_TARGET_DISTANCE_M,
        )
        .sort((a, b) => a.score - b.score) ?? [];

    if (candidates.length === 0) {
      throw new Error("Hittade ingen gångbar OSM-punkt runt 500 meter.");
    }

    const shortlist = candidates.slice(0, Math.min(12, candidates.length));
    const selected = shortlist[Math.floor(Math.random() * shortlist.length)];

    return {
      destination: selected.point,
      source: "osm-walkable",
    };
  } catch {
    return {
      destination: fallbackDestination(start),
      source: "fallback",
    };
  } finally {
    window.clearTimeout(timeout);
  }
}
