export type Coordinate = {
  lat: number;
  lng: number;
};

export type PositionSource = "live-gps" | "imported-route";

export type PositionSample = {
  position: Coordinate;
  accuracyM: number | null;
  recordedAt: string;
  source: PositionSource;
};
