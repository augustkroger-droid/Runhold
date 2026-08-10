import {
  createApproximateRoutedPath,
  type RoutedPath,
} from "@/lib/game/systems/route-planner";
import type { Coordinate } from "@/lib/game/gps/position";

type OsrmRouteResponse = {
  code?: string;
  routes?: Array<{
    distance?: number;
    duration?: number;
    geometry?: {
      coordinates?: Array<[number, number]>;
    };
  }>;
};

const osrmEndpoints = [
  {
    source: "osrm-foot" as const,
    url: "https://routing.openstreetmap.de/routed-foot/route/v1/foot/",
  },
  {
    source: "osrm-foot" as const,
    url: "https://router.project-osrm.org/route/v1/foot/",
  },
];

function isCoordinate(value: unknown): value is Coordinate {
  if (!value || typeof value !== "object") return false;

  const point = value as Partial<Coordinate>;
  return (
    typeof point.lat === "number" &&
    typeof point.lng === "number" &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lng) <= 180
  );
}

function normalizeWaypoints(value: unknown): Coordinate[] {
  if (!Array.isArray(value)) return [];

  return value.filter(isCoordinate).slice(0, 12);
}

async function fetchOsrmRoute(waypoints: readonly Coordinate[]): Promise<RoutedPath | null> {
  const coordinates = waypoints
    .map((point) => `${point.lng.toFixed(6)},${point.lat.toFixed(6)}`)
    .join(";");

  for (const endpoint of osrmEndpoints) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 9_000);

    try {
      const response = await fetch(
        `${endpoint.url}${coordinates}?overview=full&geometries=geojson&steps=false&generate_hints=false`,
        {
          headers: {
            "user-agent": "Runhold MVP route planner",
          },
          signal: controller.signal,
        },
      );

      if (!response.ok) continue;

      const data = (await response.json()) as OsrmRouteResponse;
      const route = data.routes?.[0];
      const geometry = route?.geometry?.coordinates;

      if (
        data.code !== "Ok" ||
        !route ||
        !Array.isArray(geometry) ||
        geometry.length < 2 ||
        typeof route.distance !== "number" ||
        typeof route.duration !== "number"
      ) {
        continue;
      }

      return {
        points: geometry.map(([lng, lat]) => ({ lat, lng })),
        distanceM: route.distance,
        durationSeconds: Math.round(route.duration),
        source: endpoint.source,
      };
    } catch {
      continue;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return null;
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const waypoints = normalizeWaypoints(
    typeof body === "object" && body ? (body as { waypoints?: unknown }).waypoints : null,
  );

  if (waypoints.length < 2) {
    return Response.json({ error: "ROUTE_REQUIRES_WAYPOINTS" }, { status: 400 });
  }

  const routedPath = await fetchOsrmRoute(waypoints);

  return Response.json(routedPath ?? createApproximateRoutedPath(waypoints));
}
