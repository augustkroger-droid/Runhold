create table if not exists public.player_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  game_started_at timestamptz not null default now(),
  selected_training_level text not null,
  character_level integer not null default 1,
  xp integer not null default 0,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_profiles_training_level_check check (
    selected_training_level in ('low', 'normal', 'high', 'very_high')
  ),
  constraint player_profiles_character_level_check check (character_level >= 1),
  constraint player_profiles_xp_check check (xp >= 0)
);

alter table public.player_profiles enable row level security;

drop trigger if exists player_profiles_set_updated_at on public.player_profiles;

create trigger player_profiles_set_updated_at
before update on public.player_profiles
for each row
execute function public.set_updated_at();

drop policy if exists "Users can read own player profile" on public.player_profiles;
drop policy if exists "Users can create own player profile" on public.player_profiles;
drop policy if exists "Users can update own player profile" on public.player_profiles;

create policy "Users can read own player profile"
on public.player_profiles
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can create own player profile"
on public.player_profiles
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update own player profile"
on public.player_profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

grant select, insert, update on table public.player_profiles to authenticated;
