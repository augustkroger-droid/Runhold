alter table public.player_expeditions
alter column status set default 'active';

alter table public.player_expeditions
alter column ended_at drop not null;

alter table public.player_expeditions
alter column distance_m set default 0;

alter table public.player_expeditions
alter column duration_seconds set default 0;

alter table public.player_expeditions
alter column xp_earned set default 0;

alter table public.player_expeditions
add column if not exists resource_haul jsonb not null default '{}'::jsonb;

alter table public.player_expeditions
drop constraint if exists player_expeditions_status_check;

alter table public.player_expeditions
add constraint player_expeditions_status_check check (
  status in ('active', 'completed', 'cancelled')
);

create table if not exists public.player_expedition_haul (
  user_id uuid not null references auth.users(id) on delete cascade,
  expedition_id uuid not null references public.player_expeditions(id) on delete cascade,
  resource_id text not null references public.resource_definitions(id),
  quantity integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, expedition_id, resource_id),
  constraint player_expedition_haul_quantity_check check (quantity >= 0)
);

alter table public.player_expedition_haul enable row level security;

drop trigger if exists player_expedition_haul_set_updated_at on public.player_expedition_haul;

create trigger player_expedition_haul_set_updated_at
before update on public.player_expedition_haul
for each row
execute function public.set_updated_at();

drop policy if exists "Users can read own expedition haul" on public.player_expedition_haul;

create policy "Users can read own expedition haul"
on public.player_expedition_haul
for select
to authenticated
using (auth.uid() = user_id);

create or replace function public.start_player_expedition()
returns table(
  id uuid,
  user_id uuid,
  started_at timestamptz,
  ended_at timestamptz,
  distance_m integer,
  duration_seconds integer,
  xp_earned integer,
  resource_haul jsonb
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
    resource_haul
  )
  values (
    current_user_id,
    'active',
    expedition_started_at,
    0,
    0,
    0,
    '{}'::jsonb
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
    '{}'::jsonb;
end;
$$;

create or replace function public.complete_player_expedition(
  input_expedition_id uuid,
  input_distance_m integer,
  input_duration_seconds integer
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
  haul_item record;
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
    next_total_xp;
end;
$$;

create or replace function public.collect_player_map_object(
  input_expedition_id uuid,
  input_object_id uuid,
  input_lat double precision,
  input_lng double precision,
  input_collect_radius_m integer
)
returns table(
  id uuid,
  resource_id text,
  quantity integer
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

  update public.player_map_objects objects
  set
    collected_at = now(),
    updated_at = now()
  where objects.id = input_object_id;

  insert into public.player_expedition_haul (
    user_id,
    expedition_id,
    resource_id,
    quantity
  )
  values (
    current_user_id,
    input_expedition_id,
    object_row.resource_id,
    object_row.quantity
  )
  on conflict on constraint player_expedition_haul_pkey do update
  set
    quantity = public.player_expedition_haul.quantity + excluded.quantity,
    updated_at = now();

  return query
  select object_row.id, object_row.resource_id, object_row.quantity;
end;
$$;

grant select on table public.player_expedition_haul to authenticated;
grant execute on function public.start_player_expedition() to authenticated;
grant execute on function public.complete_player_expedition(uuid, integer, integer) to authenticated;
grant execute on function public.collect_player_map_object(uuid, uuid, double precision, double precision, integer) to authenticated;
