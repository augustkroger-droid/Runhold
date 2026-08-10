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
    expect(query).not.toContain('"access"!~');
    expect(query).not.toContain('"foot"!~');
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
    expect(query).not.toContain('"access"!~');
    expect(query).not.toContain('"highway"~"^(footway');
  });

  it("can query all roads for the debug overlay", () => {
    const query = buildWalkableOverpassQuery(
      { lat: 57.78, lng: 14.16 },
      1000,
      "debug-all-roads",
    );

    expect(query).toContain('["highway"]');
    expect(query).not.toContain('"highway"!~');
    expect(query).not.toContain('"access"!~');
  });

  it("samples points from Overpass way geometry", () => {
    const candidates = parseWalkableCandidates(
      {
        elements: [
          {
            type: "way",
            id: 1,
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

  it("does not extract unsafe path lines for the map overlay", () => {
    const paths = parseWalkablePaths(
      {
        elements: [
          {
            type: "way",
            id: 42,
            tags: { highway: "footway", access: "private" },
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

    expect(paths).toEqual([]);
  });

  it("normalizes Overpass lon coordinates into internal lng coordinates", () => {
    const candidates = parseWalkableCandidates(
      {
        elements: [
          {
            type: "way",
            id: 7,
            tags: { highway: "residential" },
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

  it("filters unsafe road types and private access in the parser", () => {
    const candidates = parseWalkableCandidates(
      {
        elements: [
          {
            type: "way",
            id: 1,
            tags: { highway: "motorway" },
            geometry: [
              { lat: 57.78, lon: 14.16 },
              { lat: 57.781, lon: 14.16 },
            ],
          },
          {
            type: "way",
            id: 2,
            tags: { highway: "service", service: "driveway" },
            geometry: [
              { lat: 57.78, lon: 14.161 },
              { lat: 57.781, lon: 14.161 },
            ],
          },
          {
            type: "way",
            id: 3,
            tags: { highway: "residential" },
            geometry: [
              { lat: 57.78, lon: 14.162 },
              { lat: 57.781, lon: 14.162 },
            ],
          },
        ],
      },
      { lat: 57.78, lng: 14.16 },
      500,
    );

    expect(candidates).toContainEqual({ lat: 57.78, lng: 14.162 });
    expect(candidates).not.toContainEqual({ lat: 57.78, lng: 14.16 });
    expect(candidates).not.toContainEqual({ lat: 57.78, lng: 14.161 });
  });

  it("prioritizes nearby candidates before distant ones", () => {
    const candidates = parseWalkableCandidates(
      {
        elements: [
          {
            type: "way",
            id: 1,
            tags: { highway: "residential" },
            geometry: [
              { lat: 57.82, lon: 14.16 },
              { lat: 57.821, lon: 14.16 },
            ],
          },
          {
            type: "way",
            id: 2,
            tags: { highway: "residential" },
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

  it("keeps candidates across the full scan radius when dense roads are nearby", () => {
    const center = { lat: 57.78, lng: 14.16 };
    const nearWays = Array.from({ length: 80 }, (_, index) => ({
      type: "way",
      id: index + 1,
      tags: { highway: "residential" },
      geometry: [
        { lat: 57.78 + index * 0.00001, lon: 14.16 },
        { lat: 57.78 + index * 0.00001, lon: 14.1605 },
      ],
    }));
    const farWays = Array.from({ length: 20 }, (_, index) => ({
      type: "way",
      id: index + 100,
      tags: { highway: "residential" },
      geometry: [
        { lat: 57.795 + index * 0.00001, lon: 14.16 },
        { lat: 57.795 + index * 0.00001, lon: 14.1605 },
      ],
    }));

    const candidates = parseWalkableCandidates(
      { elements: [...nearWays, ...farWays] },
      center,
      2500,
      60,
    );

    expect(candidates[0]).toEqual(center);
    expect(candidates.some((candidate) => candidate.lat > 57.794)).toBe(true);
  });
});
