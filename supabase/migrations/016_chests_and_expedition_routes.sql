alter table public.player_map_objects
alter column resource_id drop not null;

alter table public.player_map_objects
add column if not exists loot_table_id text;

alter table public.player_map_objects
drop constraint if exists player_map_objects_kind_check;

alter table public.player_map_objects
add constraint player_map_objects_kind_check check (
  object_kind in ('resource', 'chest')
);

alter table public.player_map_objects
drop constraint if exists player_map_objects_resource_required_check;

alter table public.player_map_objects
add constraint player_map_objects_resource_required_check check (
  (object_kind = 'resource' and resource_id is not null)
  or (object_kind = 'chest')
);

alter table public.player_expeditions
add column if not exists route_points jsonb not null default '[]'::jsonb;

alter table public.player_expeditions
add column if not exists item_haul jsonb not null default '{}'::jsonb;

create table if not exists public.item_definitions (
  id text primary key,
  name text not null,
  item_kind text not null,
  rarity text not null default 'common',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.item_definitions (id, name, item_kind, rarity)
values ('axe', 'Yxa', 'tool', 'uncommon')
on conflict (id) do update
set
  name = excluded.name,
  item_kind = excluded.item_kind,
  rarity = excluded.rarity,
  updated_at = now();

create table if not exists public.player_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null references public.item_definitions(id),
  quantity integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, item_id),
  constraint player_items_quantity_check check (quantity >= 0)
);

create table if not exists public.player_expedition_item_haul (
  user_id uuid not null references auth.users(id) on delete cascade,
  expedition_id uuid not null references public.player_expeditions(id) on delete cascade,
  item_id text not null references public.item_definitions(id),
  quantity integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, expedition_id, item_id),
  constraint player_expedition_item_haul_quantity_check check (quantity >= 0)
);

alter table public.item_definitions enable row level security;
alter table public.player_items enable row level security;
alter table public.player_expedition_item_haul enable row level security;

drop trigger if exists item_definitions_set_updated_at on public.item_definitions;
drop trigger if exists player_items_set_updated_at on public.player_items;
drop trigger if exists player_expedition_item_haul_set_updated_at on public.player_expedition_item_haul;

create trigger item_definitions_set_updated_at
before update on public.item_definitions
for each row
execute function public.set_updated_at();

create trigger player_items_set_updated_at
before update on public.player_items
for each row
execute function public.set_updated_at();

create trigger player_expedition_item_haul_set_updated_at
before update on public.player_expedition_item_haul
for each row
execute function public.set_updated_at();

drop policy if exists "Anyone can read item definitions" on public.item_definitions;
drop policy if exists "Users can read own items" on public.player_items;
drop policy if exists "Users can read own expedition item haul" on public.player_expedition_item_haul;

create policy "Anyone can read item definitions"
on public.item_definitions
for select
to authenticated
using (true);

create policy "Users can read own items"
on public.player_items
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can read own expedition item haul"
on public.player_expedition_item_haul
for select
to authenticated
using (auth.uid() = user_id);

create or replace function public.choose_basic_chest_loot()
returns table(
  resource_id text,
  quantity integer,
  item_id text,
  item_quantity integer
)
language plpgsql
as $$
declare
  roll double precision;
begin
  roll := random();

  if roll < 0.42 then
    return query select 'wood'::text, (10 + floor(random() * 13)::integer), null::text, 0;
  elsif roll < 0.72 then
    return query select 'stone'::text, (8 + floor(random() * 11)::integer), null::text, 0;
  elsif roll < 0.95 then
    return query select 'food'::text, (6 + floor(random() * 10)::integer), null::text, 0;
  else
    return query select null::text, 0, 'axe'::text, 1;
  end if;
end;
$$;

create or replace function public.ensure_player_map_objects(
  input_lat double precision,
  input_lng double precision,
  input_spawn_radius_m integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  profile record;
  sector_size double precision := 0.01;
  sector_radius integer;
  center_lat_sector integer;
  center_lng_sector integer;
  sector_lat_idx integer;
  sector_lng_idx integer;
  next_sector_key text;
  objects_to_spawn integer;
  spawn_index integer;
  chosen_resource record;
  should_spawn_chest boolean;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  select *
  into profile
  from public.player_profiles profiles
  where profiles.user_id = current_user_id;

  if profile.user_id is null then
    raise exception 'PROFILE_REQUIRED' using errcode = '23503';
  end if;

  sector_radius := least(6, greatest(1, ceiling(input_spawn_radius_m / 1110.0)::integer));
  center_lat_sector := floor(input_lat / sector_size)::integer;
  center_lng_sector := floor(input_lng / sector_size)::integer;

  for sector_lat_idx in
    select generate_series(center_lat_sector - sector_radius, center_lat_sector + sector_radius)
  loop
    for sector_lng_idx in
      select generate_series(center_lng_sector - sector_radius, center_lng_sector + sector_radius)
    loop
      next_sector_key := sector_lat_idx::text || ':' || sector_lng_idx::text;

      if exists (
        select 1
        from public.player_map_sectors sectors
        where
          sectors.user_id = current_user_id
          and sectors.sector_key = next_sector_key
      ) then
        continue;
      end if;

      insert into public.player_map_sectors (
        user_id,
        sector_key,
        sector_lat,
        sector_lng
      )
      values (
        current_user_id,
        next_sector_key,
        sector_lat_idx,
        sector_lng_idx
      );

      objects_to_spawn := 2 + floor(random() * 3)::integer;

      for spawn_index in 1..objects_to_spawn loop
        should_spawn_chest := random() < 0.14;

        if should_spawn_chest then
          insert into public.player_map_objects (
            user_id,
            sector_key,
            object_kind,
            resource_id,
            loot_table_id,
            quantity,
            lat,
            lng
          )
          values (
            current_user_id,
            next_sector_key,
            'chest',
            null,
            'basic_chest',
            1,
            (sector_lat_idx + random()) * sector_size,
            (sector_lng_idx + random()) * sector_size
          );

          continue;
        end if;

        select definitions.*
        into chosen_resource
        from public.resource_definitions definitions
        where
          definitions.spawn_weight > 0
          and definitions.min_unlock_level <= profile.character_level
          and (
            definitions.required_tech is null
            or exists (
              select 1
              from public.player_tech tech
              where
                tech.user_id = current_user_id
                and tech.tech_id = definitions.required_tech
            )
          )
        order by random() * definitions.spawn_weight desc
        limit 1;

        if chosen_resource.id is not null then
          insert into public.player_map_objects (
            user_id,
            sector_key,
            object_kind,
            resource_id,
            loot_table_id,
            quantity,
            lat,
            lng
          )
          values (
            current_user_id,
            next_sector_key,
            'resource',
            chosen_resource.id,
            null,
            public.resource_quantity_for_map_object(chosen_resource.id),
            (sector_lat_idx + random()) * sector_size,
            (sector_lng_idx + random()) * sector_size
          );
        end if;
      end loop;
    end loop;
  end loop;
end;
$$;

drop function if exists public.scan_player_map_objects(double precision, double precision, integer, integer);

create function public.scan_player_map_objects(
  input_lat double precision,
  input_lng double precision,
  input_scan_radius_m integer,
  input_spawn_radius_m integer
)
returns table(
  id uuid,
  object_kind text,
  resource_id text,
  quantity integer,
  lat double precision,
  lng double precision,
  distance_m double precision
)
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

  perform public.ensure_player_map_objects(
    input_lat,
    input_lng,
    least(5000, greatest(input_scan_radius_m, input_spawn_radius_m))
  );

  return query
  select
    objects.id,
    objects.object_kind,
    objects.resource_id,
    objects.quantity,
    objects.lat,
    objects.lng,
    public.haversine_distance_meters(input_lat, input_lng, objects.lat, objects.lng)
      as distance_m
  from public.player_map_objects objects
  where
    objects.user_id = current_user_id
    and objects.collected_at is null
    and public.haversine_distance_meters(input_lat, input_lng, objects.lat, objects.lng)
      <= input_scan_radius_m
  order by 7 asc
  limit 150;
end;
$$;

drop function if exists public.start_player_expedition();

create function public.start_player_expedition()
returns table(
  id uuid,
  user_id uuid,
  started_at timestamptz,
  ended_at timestamptz,
  distance_m integer,
  duration_seconds integer,
  xp_earned integer,
  resource_haul jsonb,
  item_haul jsonb,
  route_points jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  new_expedition_id uuid;
  expedition_started_at timestamptz;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  if exists (
    select 1
    from public.player_expeditions expeditions
    where
      expeditions.user_id = current_user_id
      and expeditions.status = 'active'
  ) then
    raise exception 'EXPEDITION_ALREADY_ACTIVE' using errcode = '23505';
  end if;

  expedition_started_at := now();

  insert into public.player_expeditions (
    user_id,
    status,
    started_at,
    distance_m,
    duration_seconds,
    xp_earned,
    resource_haul,
    item_haul,
    route_points
  )
  values (
    current_user_id,
    'active',
    expedition_started_at,
    0,
    0,
    0,
    '{}'::jsonb,
    '{}'::jsonb,
    '[]'::jsonb
  )
  returning player_expeditions.id into new_expedition_id;

  return query
  select
    new_expedition_id,
    current_user_id,
    expedition_started_at,
    null::timestamptz,
    0,
    0,
    0,
    '{}'::jsonb,
    '{}'::jsonb,
    '[]'::jsonb;
end;
$$;

drop function if exists public.complete_player_expedition(uuid, integer, integer);
drop function if exists public.complete_player_expedition(uuid, integer, integer, jsonb);

create function public.complete_player_expedition(
  input_expedition_id uuid,
  input_distance_m integer,
  input_duration_seconds integer,
  input_route_points jsonb
)
returns table(
  id uuid,
  user_id uuid,
  started_at timestamptz,
  ended_at timestamptz,
  distance_m integer,
  duration_seconds integer,
  xp_earned integer,
  resource_haul jsonb,
  item_haul jsonb,
  route_points jsonb,
  total_xp integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  expedition record;
  distance_value integer;
  duration_value integer;
  distance_xp integer;
  pace_seconds_per_km numeric;
  pace_bonus integer;
  earned_xp integer;
  next_total_xp integer;
  expedition_ended_at timestamptz;
  haul_json jsonb;
  item_haul_json jsonb;
  route_json jsonb;
  haul_item record;
  item_haul_item record;
  current_quantity integer;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  if input_distance_m is null or input_distance_m < 0
    or input_duration_seconds is null or input_duration_seconds < 0 then
    raise exception 'INVALID_EXPEDITION_RESULT' using errcode = '23514';
  end if;

  route_json := coalesce(input_route_points, '[]'::jsonb);

  if jsonb_typeof(route_json) <> 'array' or jsonb_array_length(route_json) > 5000 then
    raise exception 'INVALID_EXPEDITION_ROUTE' using errcode = '23514';
  end if;

  select *
  into expedition
  from public.player_expeditions expeditions
  where
    expeditions.id = input_expedition_id
    and expeditions.user_id = current_user_id
  for update;

  if expedition.id is null or expedition.status <> 'active' then
    raise exception 'EXPEDITION_NOT_ACTIVE' using errcode = '23514';
  end if;

  distance_value := input_distance_m;
  duration_value := input_duration_seconds;
  distance_xp := floor(distance_value / 50.0)::integer;

  if distance_value < 100 then
    earned_xp := 0;
  elsif distance_value > 0 and duration_value > 0 then
    pace_seconds_per_km := duration_value / (distance_value / 1000.0);
    pace_bonus := case
      when pace_seconds_per_km between 240 and 540 then floor(distance_xp * 0.2)::integer
      else 0
    end;
    earned_xp := greatest(5, distance_xp + pace_bonus);
  else
    earned_xp := greatest(5, distance_xp);
  end if;

  select coalesce(jsonb_object_agg(haul.resource_id, haul.quantity), '{}'::jsonb)
  into haul_json
  from public.player_expedition_haul haul
  where
    haul.user_id = current_user_id
    and haul.expedition_id = input_expedition_id
    and haul.quantity > 0;

  select coalesce(jsonb_object_agg(haul.item_id, haul.quantity), '{}'::jsonb)
  into item_haul_json
  from public.player_expedition_item_haul haul
  where
    haul.user_id = current_user_id
    and haul.expedition_id = input_expedition_id
    and haul.quantity > 0;

  for haul_item in
    select *
    from public.player_expedition_haul haul
    where
      haul.user_id = current_user_id
      and haul.expedition_id = input_expedition_id
      and haul.quantity > 0
  loop
    select resources.quantity
    into current_quantity
    from public.player_resources resources
    where
      resources.user_id = current_user_id
      and resources.resource_id = haul_item.resource_id
    for update;

    current_quantity := coalesce(current_quantity, 0);

    insert into public.player_resources (user_id, resource_id, quantity)
    values (
      current_user_id,
      haul_item.resource_id,
      current_quantity + haul_item.quantity
    )
    on conflict on constraint player_resources_pkey do update
    set
      quantity = excluded.quantity,
      updated_at = now();
  end loop;

  for item_haul_item in
    select *
    from public.player_expedition_item_haul haul
    where
      haul.user_id = current_user_id
      and haul.expedition_id = input_expedition_id
      and haul.quantity > 0
  loop
    select items.quantity
    into current_quantity
    from public.player_items items
    where
      items.user_id = current_user_id
      and items.item_id = item_haul_item.item_id
    for update;

    current_quantity := coalesce(current_quantity, 0);

    insert into public.player_items (user_id, item_id, quantity)
    values (
      current_user_id,
      item_haul_item.item_id,
      current_quantity + item_haul_item.quantity
    )
    on conflict on constraint player_items_pkey do update
    set
      quantity = excluded.quantity,
      updated_at = now();
  end loop;

  update public.player_profiles profiles
  set
    xp = profiles.xp + earned_xp,
    updated_at = now()
  where profiles.user_id = current_user_id
  returning profiles.xp into next_total_xp;

  expedition_ended_at := now();

  update public.player_expeditions expeditions
  set
    status = 'completed',
    ended_at = expedition_ended_at,
    distance_m = distance_value,
    duration_seconds = duration_value,
    xp_earned = earned_xp,
    resource_haul = haul_json,
    item_haul = item_haul_json,
    route_points = route_json,
    updated_at = now()
  where expeditions.id = input_expedition_id;

  return query
  select
    input_expedition_id,
    current_user_id,
    expedition.started_at,
    expedition_ended_at,
    distance_value,
    duration_value,
    earned_xp,
    haul_json,
    item_haul_json,
    route_json,
    next_total_xp;
end;
$$;

drop function if exists public.collect_player_map_object(uuid, uuid, double precision, double precision, integer);

create function public.collect_player_map_object(
  input_expedition_id uuid,
  input_object_id uuid,
  input_lat double precision,
  input_lng double precision,
  input_collect_radius_m integer
)
returns table(
  id uuid,
  object_kind text,
  resource_id text,
  quantity integer,
  item_id text,
  item_quantity integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  active_expedition record;
  object_row record;
  object_distance_m double precision;
  chest_loot record;
  reward_resource_id text;
  reward_quantity integer;
  reward_item_id text;
  reward_item_quantity integer;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  select *
  into active_expedition
  from public.player_expeditions expeditions
  where
    expeditions.id = input_expedition_id
    and expeditions.user_id = current_user_id
    and expeditions.status = 'active'
  for update;

  if active_expedition.id is null then
    raise exception 'EXPEDITION_NOT_ACTIVE' using errcode = '23514';
  end if;

  select *
  into object_row
  from public.player_map_objects objects
  where
    objects.id = input_object_id
    and objects.user_id = current_user_id
  for update;

  if object_row.id is null then
    raise exception 'MAP_OBJECT_NOT_FOUND' using errcode = '23503';
  end if;

  if object_row.collected_at is not null then
    raise exception 'MAP_OBJECT_ALREADY_COLLECTED' using errcode = '23505';
  end if;

  object_distance_m := public.haversine_distance_meters(
    input_lat,
    input_lng,
    object_row.lat,
    object_row.lng
  );

  if object_distance_m > input_collect_radius_m then
    raise exception 'MAP_OBJECT_TOO_FAR' using errcode = '23514';
  end if;

  if object_row.object_kind = 'chest' then
    select *
    into chest_loot
    from public.choose_basic_chest_loot()
    limit 1;

    reward_resource_id := chest_loot.resource_id;
    reward_quantity := coalesce(chest_loot.quantity, 0);
    reward_item_id := chest_loot.item_id;
    reward_item_quantity := coalesce(chest_loot.item_quantity, 0);
  else
    reward_resource_id := object_row.resource_id;
    reward_quantity := object_row.quantity;
    reward_item_id := null;
    reward_item_quantity := 0;
  end if;

  update public.player_map_objects objects
  set
    collected_at = now(),
    updated_at = now()
  where objects.id = input_object_id;

  if reward_resource_id is not null and reward_quantity > 0 then
    insert into public.player_expedition_haul (
      user_id,
      expedition_id,
      resource_id,
      quantity
    )
    values (
      current_user_id,
      input_expedition_id,
      reward_resource_id,
      reward_quantity
    )
    on conflict on constraint player_expedition_haul_pkey do update
    set
      quantity = public.player_expedition_haul.quantity + excluded.quantity,
      updated_at = now();
  end if;

  if reward_item_id is not null and reward_item_quantity > 0 then
    insert into public.player_expedition_item_haul (
      user_id,
      expedition_id,
      item_id,
      quantity
    )
    values (
      current_user_id,
      input_expedition_id,
      reward_item_id,
      reward_item_quantity
    )
    on conflict on constraint player_expedition_item_haul_pkey do update
    set
      quantity = public.player_expedition_item_haul.quantity + excluded.quantity,
      updated_at = now();
  end if;

  return query
  select
    object_row.id,
    object_row.object_kind,
    reward_resource_id,
    reward_quantity,
    reward_item_id,
    reward_item_quantity;
end;
$$;

grant select on table public.item_definitions to authenticated;
grant select on table public.player_items to authenticated;
grant select on table public.player_expedition_item_haul to authenticated;
grant execute on function public.choose_basic_chest_loot() to authenticated;
grant execute on function public.scan_player_map_objects(double precision, double precision, integer, integer) to authenticated;
grant execute on function public.start_player_expedition() to authenticated;
grant execute on function public.complete_player_expedition(uuid, integer, integer, jsonb) to authenticated;
grant execute on function public.collect_player_map_object(uuid, uuid, double precision, double precision, integer) to authenticated;
