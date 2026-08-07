export type PlayerCampfire = {
  burnUntil: string | null;
  lastFueledAt: string | null;
  totalWoodBurned: number;
};

export type PlayerCampfireRow = {
  user_id: string;
  burn_until: string | null;
  last_fueled_at: string | null;
  total_wood_burned: number;
  created_at: string;
  updated_at: string;
};

export function mapPlayerCampfireRow(
  row: PlayerCampfireRow | null,
): PlayerCampfire {
  return {
    burnUntil: row?.burn_until ?? null,
    lastFueledAt: row?.last_fueled_at ?? null,
    totalWoodBurned: row?.total_wood_burned ?? 0,
  };
}
