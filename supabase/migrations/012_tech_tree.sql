alter table public.building_definitions
add column if not exists required_tech text;

insert into public.building_definitions (
  id,
  name,
  description,
  base_max_hp,
  initial_level,
  initial_state,
  sort_order,
  required_tech
)
values
  ('tent', 'Tält', 'Första lägret och basens enkla centrum.', 80, 1, 'active', 10, null),
  ('campfire', 'Lägereld', 'Håller mörkret borta och behöver fyllas med trä.', 0, 1, 'active', 20, null),
  ('wall', 'Mur', 'Första försvarslinjen runt lägret.', 100, 0, 'not_built', 30, 'basic_wall')
on conflict (id) do update
set
  name = excluded.name,
  description = excluded.description,
  base_max_hp = excluded.base_max_hp,
  initial_level = excluded.initial_level,
  initial_state = excluded.initial_state,
  sort_order = excluded.sort_order,
  required_tech = excluded.required_tech,
  updated_at = now();

create table if not exists public.tech_definitions (
  id text primary key,
  name text not null,
  description text not null,
  xp_cost integer not null default 0,
  resource_cost jsonb not null default '{}'::jsonb,
  prerequisites text[] not null default '{}'::text[],
  unlock_type text not null,
  unlock_target text not null,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tech_definitions_xp_cost_check check (xp_cost >= 0),
  constraint tech_definitions_unlock_type_check check (
    unlock_type in ('building', 'scanner', 'resource')
  )
);

insert into public.tech_definitions (
  id,
  name,
  description,
  xp_cost,
  resource_cost,
  prerequisites,
  unlock_type,
  unlock_target,
  sort_order
)
values
  (
    'basic_wall',
    'Enkel mur',
    'Lär lägret att resa en första skyddande mur.',
    50,
    '{}'::jsonb,
    '{}'::text[],
    'building',
    'wall',
    10
  ),
  (
    'improved_scanner',
    'Förbättrad scanner',
    'Förbereder längre scanner-radie för framtida expeditioner.',
    100,
    '{}'::jsonb,
    array['basic_wall'],
    'scanner',
    'scanner_radius',
    20
  ),
  (
    'iron_discovery',
    'Järnfynd',
    'Gör lägret redo att upptäcka järn senare.',
    150,
    '{}'::jsonb,
    array['basic_wall'],
    'resource',
    'iron',
    30
  )
on conflict (id) do update
set
  name = excluded.name,
  description = excluded.description,
  xp_cost = excluded.xp_cost,
  resource_cost = excluded.resource_cost,
  prerequisites = excluded.prerequisites,
  unlock_type = excluded.unlock_type,
  unlock_target = excluded.unlock_target,
  sort_order = excluded.sort_order,
  updated_at = now();

create table if not exists public.player_tech (
  user_id uuid not null references auth.users(id) on delete cascade,
  tech_id text not null references public.tech_definitions(id),
  unlocked_at timestamptz not null default now(),
  primary key (user_id, tech_id)
);

alter table public.player_tech enable row level security;

drop policy if exists "Users can read own tech" on public.player_tech;

create policy "Users can read own tech"
on public.player_tech
for select
to authenticated
using (auth.uid() = user_id);

create or replace function public.unlock_player_tech(input_tech_id text)
returns table(
  tech_id text,
  remaining_xp integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  definition record;
  current_xp integer;
  cost_item record;
  current_quantity integer;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  select *
  into definition
  from public.tech_definitions definitions
  where definitions.id = input_tech_id;

  if definition.id is null then
    raise exception 'UNKNOWN_TECH' using errcode = '23503';
  end if;

  if exists (
    select 1
    from public.player_tech unlocks
    where unlocks.user_id = current_user_id
      and unlocks.tech_id = input_tech_id
  ) then
    raise exception 'TECH_ALREADY_UNLOCKED' using errcode = '23505';
  end if;

  if exists (
    select 1
    from unnest(definition.prerequisites) prerequisite(required_tech_id)
    where not exists (
      select 1
      from public.player_tech unlocks
      where unlocks.user_id = current_user_id
        and unlocks.tech_id = prerequisite.required_tech_id
    )
  ) then
    raise exception 'PREREQUISITE_MISSING' using errcode = '23514';
  end if;

  select profiles.xp
  into current_xp
  from public.player_profiles profiles
  where profiles.user_id = current_user_id
  for update;

  current_xp := coalesce(current_xp, 0);

  if current_xp < definition.xp_cost then
    raise exception 'INSUFFICIENT_XP' using errcode = '23514';
  end if;

  for cost_item in select * from jsonb_each_text(definition.resource_cost)
  loop
    select resources.quantity
    into current_quantity
    from public.player_resources resources
    where
      resources.user_id = current_user_id
      and resources.resource_id = cost_item.key
    for update;

    current_quantity := coalesce(current_quantity, 0);

    if current_quantity < cost_item.value::integer then
      raise exception 'INSUFFICIENT_RESOURCES' using errcode = '23514';
    end if;
  end loop;

  for cost_item in select * from jsonb_each_text(definition.resource_cost)
  loop
    update public.player_resources resources
    set
      quantity = resources.quantity - cost_item.value::integer,
      updated_at = now()
    where
      resources.user_id = current_user_id
      and resources.resource_id = cost_item.key;
  end loop;

  update public.player_profiles profiles
  set
    xp = profiles.xp - definition.xp_cost,
    updated_at = now()
  where profiles.user_id = current_user_id;

  insert into public.player_tech (user_id, tech_id)
  values (current_user_id, input_tech_id);

  return query
  select input_tech_id, current_xp - definition.xp_cost;
end;
$$;

create or replace function public.start_player_construction(input_construction_id text)
returns table(
  id uuid,
  construction_id text,
  target_building_id text,
  starts_at timestamptz,
  completes_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  definition record;
  target_definition record;
  cost_item record;
  current_quantity integer;
  new_construction_id uuid;
  construction_starts_at timestamptz;
  construction_completes_at timestamptz;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  perform public.complete_ready_constructions();

  select *
  into definition
  from public.construction_definitions
  where construction_definitions.id = input_construction_id;

  if definition.id is null then
    raise exception 'UNKNOWN_CONSTRUCTION' using errcode = '23503';
  end if;

  select *
  into target_definition
  from public.building_definitions buildings
  where buildings.id = definition.target_building_id;

  if target_definition.required_tech is not null and not exists (
    select 1
    from public.player_tech unlocks
    where
      unlocks.user_id = current_user_id
      and unlocks.tech_id = target_definition.required_tech
  ) then
    raise exception 'TECH_REQUIRED' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.player_constructions active_constructions
    where
      active_constructions.user_id = current_user_id
      and active_constructions.target_building_id = definition.target_building_id
      and active_constructions.status = 'active'
  ) then
    raise exception 'CONSTRUCTION_ALREADY_ACTIVE' using errcode = '23505';
  end if;

  if exists (
    select 1
    from public.player_buildings buildings
    where
      buildings.user_id = current_user_id
      and buildings.building_id = definition.target_building_id
      and buildings.level >= definition.resulting_level
      and buildings.state <> 'not_built'
  ) then
    raise exception 'TARGET_ALREADY_BUILT' using errcode = '23505';
  end if;

  for cost_item in select * from jsonb_each_text(definition.cost)
  loop
    select resources.quantity
    into current_quantity
    from public.player_resources resources
    where
      resources.user_id = current_user_id
      and resources.resource_id = cost_item.key
    for update;

    current_quantity := coalesce(current_quantity, 0);

    if current_quantity < cost_item.value::integer then
      raise exception 'INSUFFICIENT_RESOURCES' using errcode = '23514';
    end if;
  end loop;

  for cost_item in select * from jsonb_each_text(definition.cost)
  loop
    update public.player_resources resources
    set
      quantity = resources.quantity - cost_item.value::integer,
      updated_at = now()
    where
      resources.user_id = current_user_id
      and resources.resource_id = cost_item.key;
  end loop;

  construction_starts_at := now();
  construction_completes_at :=
    construction_starts_at + (definition.duration_seconds * interval '1 second');

  insert into public.player_constructions (
    user_id,
    construction_id,
    target_building_id,
    starts_at,
    completes_at,
    cost
  )
  values (
    current_user_id,
    definition.id,
    definition.target_building_id,
    construction_starts_at,
    construction_completes_at,
    definition.cost
  )
  returning player_constructions.id into new_construction_id;

  return query
  select
    new_construction_id,
    definition.id,
    definition.target_building_id,
    construction_starts_at,
    construction_completes_at;
end;
$$;

grant select on table public.tech_definitions to anon, authenticated;
grant select on table public.player_tech to authenticated;
grant execute on function public.unlock_player_tech(text) to authenticated;
grant execute on function public.start_player_construction(text) to authenticated;
