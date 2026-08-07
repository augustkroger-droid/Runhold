create or replace function public.ensure_player_map_objects_from_candidates(
  input_lat double precision,
  input_lng double precision,
  input_spawn_radius_m integer,
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
  candidate_sector record;
  next_sector_key text;
  objects_to_spawn integer;
  spawn_index integer;
  chosen_resource record;
  chosen_candidate record;
  should_spawn_chest boolean;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  if input_walkable_candidates is null
    or jsonb_typeof(input_walkable_candidates) <> 'array'
    or jsonb_array_length(input_walkable_candidates) = 0 then
    return;
  end if;

  select *
  into profile
  from public.player_profiles profiles
  where profiles.user_id = current_user_id;

  if profile.user_id is null then
    raise exception 'PROFILE_REQUIRED' using errcode = '23503';
  end if;

  for candidate_sector in
    select distinct
      floor(candidate.lat / sector_size)::integer as sector_lat,
      floor(candidate.lng / sector_size)::integer as sector_lng
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
      ) <= input_spawn_radius_m
  loop
    next_sector_key := candidate_sector.sector_lat::text
      || ':'
      || candidate_sector.sector_lng::text;

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
      candidate_sector.sector_lat,
      candidate_sector.sector_lng
    );

    objects_to_spawn := 2 + floor(random() * 3)::integer;

    for spawn_index in 1..objects_to_spawn loop
      select candidate.lat, candidate.lng
      into chosen_candidate
      from jsonb_to_recordset(input_walkable_candidates) as candidate(
        lat double precision,
        lng double precision
      )
      where
        floor(candidate.lat / sector_size)::integer = candidate_sector.sector_lat
        and floor(candidate.lng / sector_size)::integer = candidate_sector.sector_lng
        and candidate.lat between -90 and 90
        and candidate.lng between -180 and 180
        and public.haversine_distance_meters(
          input_lat,
          input_lng,
          candidate.lat,
          candidate.lng
        ) <= input_spawn_radius_m
        and not exists (
          select 1
          from public.player_map_objects existing
          where
            existing.user_id = current_user_id
            and existing.sector_key = next_sector_key
            and abs(existing.lat - candidate.lat) < 0.00001
            and abs(existing.lng - candidate.lng) < 0.00001
        )
      order by random()
      limit 1;

      if chosen_candidate.lat is null then
        continue;
      end if;

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
          chosen_candidate.lat,
          chosen_candidate.lng
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
          chosen_candidate.lat,
          chosen_candidate.lng
        );
      end if;
    end loop;
  end loop;
end;
$$;

drop function if exists public.scan_player_map_objects(
  double precision,
  double precision,
  integer,
  integer,
  jsonb
);

create function public.scan_player_map_objects(
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
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
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
    and public.haversine_distance_meters(input_lat, input_lng, objects.lat, objects.lng)
      <= input_scan_radius_m
  order by 7 asc
  limit 150;
end;
$$;

grant execute on function public.ensure_player_map_objects_from_candidates(
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
