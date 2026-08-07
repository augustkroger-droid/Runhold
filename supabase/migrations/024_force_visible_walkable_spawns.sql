create or replace function public.force_visible_player_map_objects_from_candidates(
  input_lat double precision,
  input_lng double precision,
  input_scan_radius_m integer,
  input_walkable_candidates jsonb
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
  target_visible_objects integer := 10;
  visible_live_objects integer;
  objects_to_spawn integer;
  chosen_candidate record;
  chosen_resource_id text;
  next_sector_key text;
  next_sector_lat integer;
  next_sector_lng integer;
  next_expires_at timestamptz;
  offset_distance_m double precision;
  offset_bearing double precision;
  spawn_lat double precision;
  spawn_lng double precision;
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

  if input_walkable_candidates is null
    or jsonb_typeof(input_walkable_candidates) <> 'array'
    or jsonb_array_length(input_walkable_candidates) = 0 then
    return;
  end if;

  delete from public.player_map_objects objects
  where
    objects.user_id = current_user_id
    and objects.collected_at is null
    and objects.expires_at is not null
    and objects.expires_at <= now();

  select count(*)::integer
  into visible_live_objects
  from public.player_map_objects objects
  where
    objects.user_id = current_user_id
    and objects.collected_at is null
    and (objects.expires_at is null or objects.expires_at > now())
    and public.haversine_distance_meters(input_lat, input_lng, objects.lat, objects.lng)
      <= input_scan_radius_m;

  if visible_live_objects >= 4 then
    return;
  end if;

  objects_to_spawn := greatest(0, target_visible_objects - visible_live_objects);

  for chosen_candidate in
    select
      candidate.lat,
      candidate.lng,
      public.haversine_distance_meters(
        input_lat,
        input_lng,
        candidate.lat,
        candidate.lng
      ) as distance_m
    from jsonb_to_recordset(input_walkable_candidates) as candidate(
      lat double precision,
      lng double precision
    )
    where
      candidate.lat between -90 and 90
      and candidate.lng between -180 and 180
      and public.haversine_distance_meters(
        input_lat,
        input_lng,
        candidate.lat,
        candidate.lng
      ) <= input_scan_radius_m
      and not exists (
        select 1
        from public.player_map_objects existing
        where
          existing.user_id = current_user_id
          and existing.collected_at is null
          and (existing.expires_at is null or existing.expires_at > now())
          and public.haversine_distance_meters(
            candidate.lat,
            candidate.lng,
            existing.lat,
            existing.lng
          ) < 45
      )
    order by random()
    limit objects_to_spawn
  loop
    chosen_resource_id := null;

    select definitions.id
    into chosen_resource_id
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

    if chosen_resource_id is null then
      select definitions.id
      into chosen_resource_id
      from public.resource_definitions definitions
      where definitions.id = 'wood'
      limit 1;
    end if;

    if chosen_resource_id is null then
      continue;
    end if;

    offset_distance_m := random() * 10.0;
    offset_bearing := random() * 2.0 * pi();
    spawn_lat := chosen_candidate.lat
      + (cos(offset_bearing) * offset_distance_m / 111320.0);
    spawn_lng := chosen_candidate.lng
      + (
        sin(offset_bearing)
        * offset_distance_m
        / greatest(1.0, abs(111320.0 * cos(radians(chosen_candidate.lat))))
      );
    next_sector_lat := floor(spawn_lat / sector_size)::integer;
    next_sector_lng := floor(spawn_lng / sector_size)::integer;
    next_sector_key := next_sector_lat::text || ':' || next_sector_lng::text;
    next_expires_at := now()
      + interval '48 hours'
      + (floor(random() * 43200)::integer * interval '1 second');

    insert into public.player_map_sectors (
      user_id,
      sector_key,
      sector_lat,
      sector_lng,
      last_spawned_at
    )
    values (
      current_user_id,
      next_sector_key,
      next_sector_lat,
      next_sector_lng,
      now()
    )
    on conflict on constraint player_map_sectors_pkey do update
    set last_spawned_at = excluded.last_spawned_at;

    insert into public.player_map_objects (
      user_id,
      sector_key,
      object_kind,
      resource_id,
      loot_table_id,
      quantity,
      lat,
      lng,
      expires_at
    )
    values (
      current_user_id,
      next_sector_key,
      'resource',
      chosen_resource_id,
      null,
      public.resource_quantity_for_map_object(chosen_resource_id),
      spawn_lat,
      spawn_lng,
      next_expires_at
    );
  end loop;
end;
$$;

create or replace function public.scan_player_map_objects(
  input_lat double precision,
  input_lng double precision,
  input_scan_radius_m integer,
  input_spawn_radius_m integer,
  input_walkable_candidates jsonb
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
  active_expedition_exists boolean;
  visible_live_objects integer;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  select exists (
    select 1
    from public.player_expeditions expeditions
    where
      expeditions.user_id = current_user_id
      and expeditions.status = 'active'
  )
  into active_expedition_exists;

  select count(*)::integer
  into visible_live_objects
  from public.player_map_objects objects
  where
    objects.user_id = current_user_id
    and objects.collected_at is null
    and (
      active_expedition_exists
      or objects.expires_at is null
      or objects.expires_at > now()
    )
    and public.haversine_distance_meters(input_lat, input_lng, objects.lat, objects.lng)
      <= input_scan_radius_m;

  if visible_live_objects < 4 then
    perform public.force_visible_player_map_objects_from_candidates(
      input_lat,
      input_lng,
      input_scan_radius_m,
      input_walkable_candidates
    );
  end if;

  perform public.ensure_player_map_objects_from_candidates(
    input_lat,
    input_lng,
    least(5000, greatest(input_scan_radius_m, input_spawn_radius_m)),
    input_walkable_candidates
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
    and (
      active_expedition_exists
      or objects.expires_at is null
      or objects.expires_at > now()
    )
    and public.haversine_distance_meters(input_lat, input_lng, objects.lat, objects.lng)
      <= input_scan_radius_m
  order by 7 asc
  limit 150;
end;
$$;

grant execute on function public.force_visible_player_map_objects_from_candidates(
  double precision,
  double precision,
  integer,
  jsonb
) to authenticated;

grant execute on function public.scan_player_map_objects(
  double precision,
  double precision,
  integer,
  integer,
  jsonb
) to authenticated;
