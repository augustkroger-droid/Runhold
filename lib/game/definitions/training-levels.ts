export const TRAINING_LEVEL_IDS = ["low", "normal", "high", "very_high"] as const;

export type TrainingLevelId = (typeof TRAINING_LEVEL_IDS)[number];

export type TrainingLevelDefinition = {
  id: TrainingLevelId;
  name: string;
  description: string;
  weeklyRunsTarget: number;
};

export const TRAINING_LEVELS: readonly TrainingLevelDefinition[] = [
  {
    id: "low",
    name: "Låg",
    description: "För dig som vill spela rimligt med ungefär två pass i veckan.",
    weeklyRunsTarget: 2,
  },
  {
    id: "normal",
    name: "Normal",
    description: "En balanserad start för ungefär tre pass i veckan.",
    weeklyRunsTarget: 3,
  },
  {
    id: "high",
    name: "Hög",
    description: "För dig som ofta tränar och vill ha lite högre tempo.",
    weeklyRunsTarget: 4,
  },
  {
    id: "very_high",
    name: "Mycket hög",
    description: "För dig som springer mycket och vill att spelet förväntar sig det.",
    weeklyRunsTarget: 5,
  },
] as const;

export function isTrainingLevelId(value: string): value is TrainingLevelId {
  return TRAINING_LEVEL_IDS.includes(value as TrainingLevelId);
}
