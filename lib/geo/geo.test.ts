import { describe, expect, it } from "vitest";
import { destinationPoint } from "@/lib/geo/destination-point";
import {
  haversineDistanceMeters,
  isPointReached,
  updateReachStreak,
} from "@/lib/geo/haversine";

const stockholm = { lat: 59.3293, lng: 18.0686 };

describe("geo helpers", () => {
  it("returns 0 meters for the same point", () => {
    expect(haversineDistanceMeters(stockholm, stockholm)).toBeCloseTo(0, 5);
  });

  it("returns a known approximate distance between Stockholm and Gothenburg", () => {
    const gothenburg = { lat: 57.7089, lng: 11.9746 };

    expect(haversineDistanceMeters(stockholm, gothenburg)).toBeGreaterThan(395_000);
    expect(haversineDistanceMeters(stockholm, gothenburg)).toBeLessThan(405_000);
  });

  it("generates a destination about 500 meters from the origin", () => {
    const destination = destinationPoint(stockholm, 123, 500);
    const distance = haversineDistanceMeters(stockholm, destination);

    expect(distance).toBeGreaterThan(499);
    expect(distance).toBeLessThan(501);
  });

  it("counts 19 meters as reached", () => {
    const target = destinationPoint(stockholm, 0, 19);

    expect(
      isPointReached({
        current: stockholm,
        target,
        accuracyM: 20,
      }),
    ).toBe(true);
  });

  it("does not count 21 meters as reached", () => {
    const target = destinationPoint(stockholm, 0, 21);

    expect(
      isPointReached({
        current: stockholm,
        target,
        accuracyM: 20,
      }),
    ).toBe(false);
  });

  it("requires two consecutive in-range readings", () => {
    const first = updateReachStreak({
      previousStreak: 0,
      current: stockholm,
      target: destinationPoint(stockholm, 90, 10),
      accuracyM: 15,
    });

    const second = updateReachStreak({
      previousStreak: first.streak,
      current: stockholm,
      target: destinationPoint(stockholm, 90, 10),
      accuracyM: 15,
    });

    expect(first.reached).toBe(false);
    expect(second.reached).toBe(true);
  });

  it("resets the confirmation streak after a bad reading", () => {
    const near = destinationPoint(stockholm, 90, 10);
    const far = destinationPoint(stockholm, 90, 100);
    const first = updateReachStreak({
      previousStreak: 0,
      current: stockholm,
      target: near,
      accuracyM: 15,
    });

    const second = updateReachStreak({
      previousStreak: first.streak,
      current: stockholm,
      target: far,
      accuracyM: 15,
    });

    expect(second.streak).toBe(0);
    expect(second.reached).toBe(false);
  });
});
