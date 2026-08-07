import {
  buildWalkableOverpassQuery,
  parseWalkableCandidates,
} from "@/lib/geo/walkable-candidates";

export const runtime = "nodejs";

const overpassUrl = "https://overpass-api.de/api/interpreter";

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
  const query = buildWalkableOverpassQuery(center, radiusM);

  try {
    const response = await fetch(overpassUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        "user-agent": "Runhold MVP walkable spawn candidates",
      },
      body: new URLSearchParams({ data: query }),
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      return Response.json({ candidates: [], source: "overpass-unavailable" });
    }

    const data = await response.json();
    const candidates = parseWalkableCandidates(data, center, radiusM);

    return Response.json({
      candidates,
      source: "openstreetmap-overpass",
    });
  } catch {
    return Response.json({ candidates: [], source: "overpass-unavailable" });
  }
}
