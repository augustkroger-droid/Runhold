import type { TrainingLevelId } from "@/lib/game/definitions/training-levels";

export type PlayerSettings = Record<string, unknown>;

export type PlayerGameProfile = {
  userId: string;
  gameStartedAt: string;
  selectedTrainingLevel: TrainingLevelId;
  characterLevel: number;
  xp: number;
  settings: PlayerSettings;
};

export type PlayerGameProfileRow = {
  user_id: string;
  game_started_at: string;
  selected_training_level: TrainingLevelId;
  character_level: number;
  xp: number;
  settings: PlayerSettings;
  created_at: string;
  updated_at: string;
};

export function mapPlayerGameProfileRow(
  row: PlayerGameProfileRow,
): PlayerGameProfile {
  return {
    userId: row.user_id,
    gameStartedAt: row.game_started_at,
    selectedTrainingLevel: row.selected_training_level,
    characterLevel: row.character_level,
    xp: row.xp,
    settings: row.settings ?? {},
  };
}
