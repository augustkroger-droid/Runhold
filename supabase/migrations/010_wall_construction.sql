create extension if not exists pgcrypto;

create table if not exists public.construction_definitions (
  id text primary key,
  name text not null,
  description text not null,
  target_building_id text not null references public.building_definitions(id),
  resulting_level integer not null,
  cost jsonb not null,
  duration_seconds integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint construction_definitions_resulting_level_check check (resulting_level >= 1),
  constraint construction_definitions_duration_seconds_check check (duration_seconds >= 0)
);

insert into public.construction_definitions (
  id,
  name,
  description,
  target_building_id,
  resulting_level,
  cost,
  duration_seconds
)
values (
  'wall_level_1',
  'Bygg mur',
  'Res en enkel mur runt lägret.',
  'wall',
  1,
  '{"wood": 20, "stone": 15}'::jsonb,
  120
)
on conflict (id) do update
set
  name = excluded.name,
  description = excluded.description,
  target_building_id = excluded.target_building_id,
  resulting_level = excluded.resulting_level,
  cost = excluded.cost,
  duration_seconds = excluded.duration_seconds,
  updated_at = now();

create table if not exists public.player_constructions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  construction_id text not null references public.construction_definitions(id),
  target_building_id text not null references public.building_definitions(id),
  status text not null default 'active',
  starts_at timestamptz not null default now(),
  completes_at timestamptz not null,
  completed_at timestamptz,
  cost jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_constructions_status_check check (
    status in ('active', 'completed', 'cancelled')
  )
);

create unique index if not exists player_constructions_one_active_target
on public.player_constructions (user_id, target_building_id)
where status = 'active';

alter table public.player_constructions enable row level security;

drop trigger if exists player_constructions_set_updated_at on public.player_constructions;

create trigger player_constructions_set_updated_at
before update on public.player_constructions
for each row
execute function public.set_updated_at();

drop policy if exists "Users can read own constructions" on public.player_constructions;

create policy "Users can read own constructions"
on public.player_constructions
for select
to authenticated
using (auth.uid() = user_id);

create or replace function public.complete_ready_constructions()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  construction record;
  building record;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  for construction in
    select
      player_constructions.id,
      player_constructions.target_building_id,
      definitions.resulting_level
    from public.player_constructions player_constructions
    join public.construction_definitions definitions
      on definitions.id = player_constructions.construction_id
    where
      player_constructions.user_id = current_user_id
      and player_constructions.status = 'active'
      and player_constructions.completes_at <= now()
  loop
    select *
    into building
    from public.building_definitions
    where id = construction.target_building_id;

    insert into public.player_buildings (
      user_id,
      building_id,
      level,
      current_hp,
      max_hp,
      state
    )
    values (
      current_user_id,
      construction.target_building_id,
      construction.resulting_level,
      building.base_max_hp,
      building.base_max_hp,
      'active'
    )
    on conflict on constraint player_buildings_pkey do update
    set
      level = greatest(public.player_buildings.level, excluded.level),
      current_hp = excluded.current_hp,
      max_hp = excluded.max_hp,
      state = excluded.state,
      updated_at = now();

    update public.player_constructions
    set
      status = 'completed',
      completed_at = now(),
      updated_at = now()
    where id = construction.id;
  end loop;
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
    update public.player_resources
    set
      quantity = quantity - cost_item.value::integer,
      updated_at = now()
    where
      user_id = current_user_id
      and resource_id = cost_item.key;
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

grant select on table public.construction_definitions to anon, authenticated;
grant select on table public.player_constructions to authenticated;
grant execute on function public.complete_ready_constructions() to authenticated;
grant execute on function public.start_player_construction(text) to authenticated;
