"use client";

import type { Coordinate } from "@/lib/game/gps/position";
import type { MissionRow, PersistedMissionStatus } from "@/lib/types/mission";
import { getSupabaseClient } from "@/lib/supabase/client";

type MissionInsert = {
  user_id: string;
  status: PersistedMissionStatus;
  start_lat: number;
  start_lng: number;
  destination_lat: number;
  destination_lng: number;
  planned_distance_m: number;
  started_at: string;
};

export function useMissionPersistence(userId: string | null) {
  async function createMission({
    start,
    destination,
    plannedDistanceM,
  }: {
    start: Coordinate;
    destination: Coordinate;
    plannedDistanceM: number;
  }): Promise<MissionRow> {
    if (!userId) {
      throw new Error("Anonym Supabase-session saknas.");
    }

    const supabase = getSupabaseClient();
    const payload: MissionInsert = {
      user_id: userId,
      status: "outbound",
      start_lat: start.lat,
      start_lng: start.lng,
      destination_lat: destination.lat,
      destination_lng: destination.lng,
      planned_distance_m: Math.round(plannedDistanceM),
      started_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("missions")
      .insert(payload)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data as MissionRow;
  }

  async function updateMission(
    missionId: string,
    values: Partial<MissionRow>,
  ): Promise<void> {
    const supabase = getSupabaseClient();
    const { error } = await supabase.from("missions").update(values).eq("id", missionId);

    if (error) {
      throw error;
    }
  }

  return { createMission, updateMission };
}
