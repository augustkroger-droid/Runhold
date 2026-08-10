create table if not exists public.player_expedition_pickups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expedition_id uuid not null references public.player_expeditions(id) on delete cascade,
  object_id uuid not null references public.player_map_objects(id) on delete cascade,
  object_kind text not null,
  resource_id text,
  item_id text,
  quantity integer not null default 0,
  xp_awarded integer not null,
  created_at timestamptz not null default now(),
  constraint player_expedition_pickups_kind_check check (object_kind in ('resource', 'chest')),
  constraint player_expedition_pickups_quantity_check check (quantity >= 0),
  constraint player_expedition_pickups_xp_check check (xp_awarded >= 0),
  constraint player_expedition_pickups_object_unique unique (object_id)
);

create index if not exists player_expedition_pickups_expedition_idx
on public.player_expedition_pickups (user_id, expedition_id);

alter table public.player_expedition_pickups enable row level security;

drop policy if exists "Users can read own expedition pickups" on public.player_expedition_pickups;

create policy "Users can read own expedition pickups"
on public.player_expedition_pickups
for select
using (auth.uid() = user_id);

drop function if exists public.collect_player_map_object(
  uuid,
  uuid,
  double precision,
  double precision,
  integer
);

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
  item_quantity integer,
  xp_awarded integer
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
  pickup_xp integer;
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
    pickup_xp := 8 + floor(random() * 8)::integer;
  else
    reward_resource_id := object_row.resource_id;
    reward_quantity := object_row.quantity;
    reward_item_id := null;
    reward_item_quantity := 0;
    pickup_xp := 2 + floor(random() * 9)::integer;
  end if;

  update public.player_map_objects objects
  set
    collected_at = now(),
    updated_at = now()
  where objects.id = input_object_id;

  insert into public.player_expedition_pickups (
    user_id,
    expedition_id,
    object_id,
    object_kind,
    resource_id,
    item_id,
    quantity,
    xp_awarded
  )
  values (
    current_user_id,
    input_expedition_id,
    input_object_id,
    object_row.object_kind,
    reward_resource_id,
    reward_item_id,
    greatest(reward_quantity, reward_item_quantity, 0),
    pickup_xp
  );

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
    reward_item_quantity,
    pickup_xp;
end;
$$;

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
  pickup_xp integer;
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

  select coalesce(sum(pickups.xp_awarded), 0)::integer
  into pickup_xp
  from public.player_expedition_pickups pickups
  where
    pickups.user_id = current_user_id
    and pickups.expedition_id = input_expedition_id;

  earned_xp := distance_xp + pickup_xp;

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
    character_level = greatest(
      1,
      floor((profiles.xp + earned_xp) / 250.0)::integer + 1
    ),
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

grant select on table public.player_expedition_pickups to authenticated;
grant execute on function public.collect_player_map_object(
  uuid,
  uuid,
  double precision,
  double precision,
  integer
) to authenticated;
grant execute on function public.complete_player_expedition(
  uuid,
  integer,
  integer,
  jsonb
) to authenticated;
