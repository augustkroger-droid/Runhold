create table if not exists public.building_definitions (
  id text primary key,
  name text not null,
  description text not null,
  base_max_hp integer not null,
  initial_level integer not null,
  initial_state text not null,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint building_definitions_base_max_hp_check check (base_max_hp >= 0),
  constraint building_definitions_initial_level_check check (initial_level >= 0),
  constraint building_definitions_initial_state_check check (
    initial_state in ('active', 'not_built', 'damaged', 'destroyed')
  )
);

insert into public.building_definitions (
  id,
  name,
  description,
  base_max_hp,
  initial_level,
  initial_state,
  sort_order
)
values
  ('tent', 'Tält', 'Första lägret och basens enkla centrum.', 80, 1, 'active', 10),
  ('campfire', 'Lägereld', 'Håller mörkret borta. Ved och brinntid kommer i nästa steg.', 60, 1, 'active', 20),
  ('wall', 'Mur', 'En framtida första försvarslinje mot raids.', 100, 0, 'not_built', 30)
on conflict (id) do update
set
  name = excluded.name,
  description = excluded.description,
  base_max_hp = excluded.base_max_hp,
  initial_level = excluded.initial_level,
  initial_state = excluded.initial_state,
  sort_order = excluded.sort_order,
  updated_at = now();

create table if not exists public.player_buildings (
  user_id uuid not null references auth.users(id) on delete cascade,
  building_id text not null references public.building_definitions(id),
  level integer not null default 0,
  current_hp integer not null default 0,
  max_hp integer not null,
  state text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, building_id),
  constraint player_buildings_level_check check (level >= 0),
  constraint player_buildings_current_hp_check check (current_hp >= 0),
  constraint player_buildings_max_hp_check check (max_hp >= 0),
  constraint player_buildings_hp_bounds_check check (current_hp <= max_hp),
  constraint player_buildings_state_check check (
    state in ('active', 'not_built', 'damaged', 'destroyed')
  )
);

alter table public.player_buildings enable row level security;

drop trigger if exists player_buildings_set_updated_at on public.player_buildings;

create trigger player_buildings_set_updated_at
before update on public.player_buildings
for each row
execute function public.set_updated_at();

drop policy if exists "Users can read own buildings" on public.player_buildings;

create policy "Users can read own buildings"
on public.player_buildings
for select
to authenticated
using (auth.uid() = user_id);

create or replace function public.initialize_player_base()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  insert into public.player_buildings (
    user_id,
    building_id,
    level,
    current_hp,
    max_hp,
    state
  )
  select
    current_user_id,
    definitions.id,
    definitions.initial_level,
    case
      when definitions.initial_state = 'not_built' then 0
      else definitions.base_max_hp
    end,
    definitions.base_max_hp,
    definitions.initial_state
  from public.building_definitions definitions
  on conflict on constraint player_buildings_pkey do nothing;
end;
$$;

grant select on table public.building_definitions to anon, authenticated;
grant select on table public.player_buildings to authenticated;
grant execute on function public.initialize_player_base() to authenticated;
