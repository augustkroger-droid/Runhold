create table if not exists public.player_map_sectors (
  user_id uuid not null references auth.users(id) on delete cascade,
  sector_key text not null,
  sector_lat integer not null,
  sector_lng integer not null,
  generated_at timestamptz not null default now(),
  primary key (user_id, sector_key)
);

create table if not exists public.player_map_objects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sector_key text not null,
  object_kind text not null default 'resource',
  resource_id text not null references public.resource_definitions(id),
  quantity integer not null,
  lat double precision not null,
  lng double precision not null,
  spawned_at timestamptz not null default now(),
  collected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_map_objects_kind_check check (object_kind in ('resource')),
  constraint player_map_objects_quantity_check check (quantity > 0)
);

create index if not exists player_map_objects_user_uncollected_idx
on public.player_map_objects (user_id, collected_at, lat, lng);

alter table public.player_map_sectors enable row level security;
alter table public.player_map_objects enable row level security;

drop trigger if exists player_map_objects_set_updated_at on public.player_map_objects;

create trigger player_map_objects_set_updated_at
before update on public.player_map_objects
for each row
execute function public.set_updated_at();

drop policy if exists "Users can read own map sectors" on public.player_map_sectors;
drop policy if exists "Users can read own map objects" on public.player_map_objects;

create policy "Users can read own map sectors"
on public.player_map_sectors
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can read own map objects"
on public.player_map_objects
for select
to authenticated
using (auth.uid() = user_id);

create or replace function public.haversine_distance_meters(
  lat_a double precision,
  lng_a double precision,
  lat_b double precision,
  lng_b double precision
)
returns double precision
language sql
immutable
as $$
  select 6371000 * 2 * asin(
    sqrt(
      power(sin(radians((lat_b - lat_a) / 2)), 2)
      + cos(radians(lat_a))
      * cos(radians(lat_b))
      * power(sin(radians((lng_b - lng_a) / 2)), 2)
    )
  );
$$;

create or replace function public.resource_quantity_for_map_object(input_resource_id text)
returns integer
language plpgsql
as $$
begin
  if input_resource_id = 'wood' then
    return 4 + floor(random() * 9)::integer;
  elsif input_resource_id = 'stone' then
    return 3 + floor(random() * 7)::integer;
  elsif input_resource_id = 'food' then
    return 2 + floor(random() * 6)::integer;
  end if;

  return 1 + floor(random() * 4)::integer;
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
            quantity,
            lat,
            lng
          )
          values (
            current_user_id,
            next_sector_key,
            'resource',
            chosen_resource.id,
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

create or replace function public.scan_player_map_objects(
  input_lat double precision,
  input_lng double precision,
  input_scan_radius_m integer,
  input_spawn_radius_m integer
)
returns table(
  id uuid,
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
  order by 6 asc
  limit 150;
end;
$$;

create or replace function public.collect_player_map_object(
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
  object_row record;
  object_distance_m double precision;
  current_quantity integer;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
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

  select resources.quantity
  into current_quantity
  from public.player_resources resources
  where
    resources.user_id = current_user_id
    and resources.resource_id = object_row.resource_id
  for update;

  current_quantity := coalesce(current_quantity, 0);

  insert into public.player_resources (user_id, resource_id, quantity)
  values (
    current_user_id,
    object_row.resource_id,
    current_quantity + object_row.quantity
  )
  on conflict on constraint player_resources_pkey do update
  set
    quantity = excluded.quantity,
    updated_at = now();

  update public.player_map_objects objects
  set
    collected_at = now(),
    updated_at = now()
  where objects.id = input_object_id;

  return query
  select object_row.id, object_row.resource_id, object_row.quantity;
end;
$$;

grant select on table public.player_map_sectors to authenticated;
grant select on table public.player_map_objects to authenticated;
grant execute on function public.scan_player_map_objects(double precision, double precision, integer, integer) to authenticated;
grant execute on function public.collect_player_map_object(uuid, double precision, double precision, integer) to authenticated;
