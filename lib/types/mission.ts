export type { Coordinate } from "@/lib/game/gps/position";

export type MissionStatus =
  | "idle"
  | "locating"
  | "selecting_destination"
  | "ready"
  | "outbound"
  | "destination_reached"
  | "returning"
  | "completed"
  | "cancelled"
  | "error";

export type PersistedMissionStatus =
  | "outbound"
  | "destination_reached"
  | "returning"
  | "completed"
  | "cancelled";

export type MissionRow = {
  id: string;
  user_id: string;
  status: PersistedMissionStatus;
  start_lat: number;
  start_lng: number;
  destination_lat: number;
  destination_lng: number;
  planned_distance_m: number | null;
  started_at: string | null;
  destination_reached_at: string | null;
  returned_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  destination_accuracy_m: number | null;
  return_accuracy_m: number | null;
  created_at: string;
  updated_at: string;
};
