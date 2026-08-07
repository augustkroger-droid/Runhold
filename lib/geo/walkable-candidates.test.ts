import { describe, expect, it } from "vitest";
import {
  boundingBoxForRadius,
  buildWalkableOverpassQuery,
  parseWalkableCandidates,
  parseWalkablePaths,
} from "@/lib/geo/walkable-candidates";

describe("walkable candidates", () => {
  it("builds a small bounding box around the center", () => {
    const box = boundingBoxForRadius({ lat: 57.78, lng: 14.16 }, 1000);

    expect(box.south).toBeLessThan(57.78);
    expect(box.north).toBeGreaterThan(57.78);
    expect(box.west).toBeLessThan(14.16);
    expect(box.east).toBeGreaterThan(14.16);
  });

  it("excludes large roads and private access in the Overpass query", () => {
    const query = buildWalkableOverpassQuery({ lat: 57.78, lng: 14.16 }, 1000);

    expect(query).toContain("footway");
    expect(query).toContain("residential");
    expect(query).not.toContain("motorway");
    expect(query).not.toContain("trunk");
    expect(query).toContain('"access"!~"^(private|no)$"');
    expect(query).toContain('"foot"!~"^(private|no)$"');
  });

  it("can broaden to public roads without allowing major unsafe roads", () => {
    const query = buildWalkableOverpassQuery(
      { lat: 57.78, lng: 14.16 },
      1000,
      "public-road",
    );

    expect(query).toContain('["highway"]');
    expect(query).toContain("motorway");
    expect(query).toContain("primary");
    expect(query).toContain('"access"!~"^(private|no)$"');
    expect(query).not.toContain('"highway"~"^(footway');
  });

  it("samples points from Overpass way geometry", () => {
    const candidates = parseWalkableCandidates(
      {
        elements: [
          {
            type: "way",
            id: 1,
            geometry: [
              { lat: 57.78, lon: 14.16 },
              { lat: 57.781, lon: 14.16 },
            ],
          },
        ],
      },
      { lat: 57.78, lng: 14.16 },
      500,
    );

    expect(candidates.length).toBeGreaterThan(1);
    expect(candidates[0]).toEqual({ lat: 57.78, lng: 14.16 });
  });

  it("extracts walkable path lines for the map overlay", () => {
    const paths = parseWalkablePaths(
      {
        elements: [
          {
            type: "way",
            id: 42,
            tags: { highway: "footway" },
            geometry: [
              { lat: 57.78, lon: 14.16 },
              { lat: 57.781, lon: 14.16 },
            ],
          },
        ],
      },
      { lat: 57.78, lng: 14.16 },
      500,
    );

    expect(paths).toEqual([
      {
        id: "42",
        highway: "footway",
        points: [
          { lat: 57.78, lng: 14.16 },
          { lat: 57.781, lng: 14.16 },
        ],
      },
    ]);
  });

  it("normalizes Overpass lon coordinates into internal lng coordinates", () => {
    const candidates = parseWalkableCandidates(
      {
        elements: [
          {
            type: "way",
            id: 7,
            geometry: [
              { lat: 57.78, lon: 14.16 },
              { lat: 57.7805, lon: 14.1605 },
            ],
          },
        ],
      },
      { lat: 57.78, lng: 14.16 },
      200,
    );

    expect(candidates[0]).toEqual({ lat: 57.78, lng: 14.16 });
  });

  it("prioritizes nearby candidates before distant ones", () => {
    const candidates = parseWalkableCandidates(
      {
        elements: [
          {
            type: "way",
            id: 1,
            geometry: [
              { lat: 57.82, lon: 14.16 },
              { lat: 57.821, lon: 14.16 },
            ],
          },
          {
            type: "way",
            id: 2,
            geometry: [
              { lat: 57.78, lon: 14.16 },
              { lat: 57.781, lon: 14.16 },
            ],
          },
        ],
      },
      { lat: 57.78, lng: 14.16 },
      5000,
      3,
    );

    expect(candidates[0]).toEqual({ lat: 57.78, lng: 14.16 });
  });
});
