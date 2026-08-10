import {
  buildWalkableOverpassQuery,
  parseWalkableCandidates,
  parseWalkablePaths,
} from "@/lib/geo/walkable-candidates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const overpassUrls = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const overpassTimeoutMs = 4_500;

async function fetchOverpassData(overpassUrl: string, query: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), overpassTimeoutMs);

  try {
    const response = await fetch(overpassUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        "user-agent": "Runhold MVP walkable spawn candidates",
      },
      body: new URLSearchParams({ data: query }),
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) return null;

    return response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseNumber(value: string | null): number | null {
  if (!value) return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const lat = parseNumber(url.searchParams.get("lat"));
  const lng = parseNumber(url.searchParams.get("lng"));
  const radiusM = Math.min(
    5000,
    Math.max(250, parseNumber(url.searchParams.get("radiusM")) ?? 2000),
  );

  if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return Response.json({ candidates: [] }, { status: 400 });
  }

  const center = { lat, lng };
  const queryRadiiM = Array.from(
    new Set([radiusM, Math.min(radiusM, 2000), Math.min(radiusM, 1200)]),
  ).filter((nextRadiusM) => nextRadiusM >= 250 && nextRadiusM <= radiusM);
  const queryModes = ["strict", "public-road"] as const;
  const debugRoadResults = await Promise.all(
    overpassUrls.map((overpassUrl) =>
      fetchOverpassData(
        overpassUrl,
        buildWalkableOverpassQuery(center, radiusM, "debug-all-roads"),
      ),
    ),
  );
  const debugPaths = debugRoadResults.flatMap((data) =>
    data ? parseWalkablePaths(data, center, radiusM) : [],
  );

  for (const queryRadiusM of queryRadiiM) {
    for (const queryMode of queryModes) {
      const query = buildWalkableOverpassQuery(center, queryRadiusM, queryMode);
      const results = await Promise.all(
        overpassUrls.map((overpassUrl) => fetchOverpassData(overpassUrl, query)),
      );

      for (const data of results) {
        if (!data) continue;

        const candidates = parseWalkableCandidates(data, center, queryRadiusM);
        const paths = parseWalkablePaths(data, center, queryRadiusM);

        if (candidates.length > 0) {
          return Response.json({
            candidates,
            paths: debugPaths.length > 0 ? debugPaths : paths,
            radiusM: queryRadiusM,
            source: `openstreetmap-overpass-${queryMode}`,
          });
        }
      }
    }
  }

  return Response.json({ candidates: [], paths: [], radiusM, source: "overpass-empty" });
}
