import type { Coordinate } from "@/lib/game/gps/position";
import { toDegrees, toRadians } from "@/lib/geo/haversine";

const EARTH_RADIUS_M = 6_371_000;

export function destinationPoint(
  origin: Coordinate,
  bearingDegrees: number,
  distanceMeters: number,
): Coordinate {
  const angularDistance = distanceMeters / EARTH_RADIUS_M;
  const bearing = toRadians(bearingDegrees);
  const lat1 = toRadians(origin.lat);
  const lng1 = toRadians(origin.lng);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing),
  );

  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
    );

  return {
    lat: toDegrees(lat2),
    lng: ((toDegrees(lng2) + 540) % 360) - 180,
  };
}
