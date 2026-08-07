-- One-time reset requested during MVP testing.
-- Clears all per-player map objects and generated sector state so the next
-- expedition scan creates a fresh distribution from current walkable candidates.

delete from public.player_map_objects;
delete from public.player_map_sectors;
