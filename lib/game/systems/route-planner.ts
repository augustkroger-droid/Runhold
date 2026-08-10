import type { ResourceId } from "@/lib/game/definitions/resources";
import type { Coordinate } from "@/lib/game/gps/position";
import type { PlayerMapObject } from "@/lib/game/state/map-objects";
import { haversineDistanceMeters } from "@/lib/geo/haversine";

export type RouteFocus = "balanced" | ResourceId | "chest";

export type PlannedRouteStop = {
  objectId: string;
  objectKind: PlayerMapObject["objectKind"];
  resourceId: ResourceId | null;
  quantity: number;
  position: Coordinate;
};

export type PlannedRouteDraft = {
  stops: PlannedRouteStop[];
  waypointPositions: Coordinate[];
  estimatedDistanceM: number;
  resourceHaul: Record<string, number>;
  chestCount: number;
};

export type RoutedPath = {
  points: Coordinate[];
  distanceM: number;
  durationSeconds: number;
  source: "osrm-foot" | "approximate";
};

const maxAutoStops = 9;

function objectRouteValue(object: PlayerMapObject, focus: RouteFocus): number {
  if (object.objectKind === "chest") {
    return focus === "chest" ? 22 : 10;
  }

  if (!object.resourceId) return 0;

  const focusMultiplier =
    focus === "balanced" ? 1 : focus === object.resourceId ? 3.2 : 0.45;

  return Math.max(1, object.quantity) * focusMultiplier;
}

function routeDistance(points: readonly Coordinate[]): number {
  let distanceM = 0;

  for (let index = 1; index < points.length; index += 1) {
    distanceM += haversineDistanceMeters(points[index - 1], points[index]);
  }

  return distanceM;
}

export function orderStopsByNearestNeighbor(
  start: Coordinate,
  stops: readonly PlannedRouteStop[],
): PlannedRouteStop[] {
  const remaining = [...stops];
  const ordered: PlannedRouteStop[] = [];
  let cursor = start;

  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let index = 0; index < remaining.length; index += 1) {
      const distanceM = haversineDistanceMeters(cursor, remaining[index].position);
      if (distanceM < bestDistance) {
        bestDistance = distanceM;
        bestIndex = index;
      }
    }

    const [nextStop] = remaining.splice(bestIndex, 1);
    ordered.push(nextStop);
    cursor = nextStop.position;
  }

  return ordered;
}

function createDraft(start: Coordinate, stops: readonly PlannedRouteStop[]): PlannedRouteDraft {
  const orderedStops = orderStopsByNearestNeighbor(start, stops);
  const waypointPositions = [
    start,
    ...orderedStops.map((stop) => stop.position),
    start,
  ];
  const resourceHaul = orderedStops.reduce<Record<string, number>>((haul, stop) => {
    if (!stop.resourceId) return haul;

    haul[stop.resourceId] = (haul[stop.resourceId] ?? 0) + stop.quantity;
    return haul;
  }, {});

  return {
    stops: orderedStops,
    waypointPositions,
    estimatedDistanceM: routeDistance(waypointPositions),
    resourceHaul,
    chestCount: orderedStops.filter((stop) => stop.objectKind === "chest").length,
  };
}

function toRouteStop(object: PlayerMapObject): PlannedRouteStop {
  return {
    objectId: object.id,
    objectKind: object.objectKind,
    resourceId: object.resourceId,
    quantity: object.quantity,
    position: object.position,
  };
}

export function createManualRouteDraft({
  start,
  objects,
  selectedObjectIds,
}: {
  start: Coordinate;
  objects: readonly PlayerMapObject[];
  selectedObjectIds: ReadonlySet<string>;
}): PlannedRouteDraft {
  return createDraft(
    start,
    objects
      .filter((object) => selectedObjectIds.has(object.id))
      .map((object) => toRouteStop(object)),
  );
}

export function createSuggestedRouteDraft({
  start,
  objects,
  focus,
  targetDistanceM,
}: {
  start: Coordinate;
  objects: readonly PlayerMapObject[];
  focus: RouteFocus;
  targetDistanceM: number;
}): PlannedRouteDraft {
  const candidates = objects
    .filter((object) => {
      if (focus === "balanced") return true;
      if (focus === "chest") return object.objectKind === "chest";
      return object.resourceId === focus;
    })
    .map((object) => ({
      stop: toRouteStop(object),
      value: objectRouteValue(object, focus),
      distanceM: Math.max(1, haversineDistanceMeters(start, object.position)),
    }))
    .sort((left, right) => right.value / right.distanceM - left.value / left.distanceM);

  const selected: PlannedRouteStop[] = [];
  const softBudgetM = Math.max(500, targetDistanceM * 1.08);

  for (const candidate of candidates) {
    if (selected.length >= maxAutoStops) break;

    const nextDraft = createDraft(start, [...selected, candidate.stop]);
    if (nextDraft.estimatedDistanceM > softBudgetM && selected.length >= 2) {
      continue;
    }

    selected.push(candidate.stop);
  }

  if (selected.length === 0 && candidates[0]) {
    selected.push(candidates[0].stop);
  }

  return createDraft(start, selected);
}

export function createApproximateRoutedPath(
  waypointPositions: readonly Coordinate[],
): RoutedPath {
  return {
    points: [...waypointPositions],
    distanceM: routeDistance(waypointPositions),
    durationSeconds: Math.round(routeDistance(waypointPositions) / 1.35),
    source: "approximate",
  };
}
