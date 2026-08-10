update public.player_map_sectors
set
  min_object_count = least(min_object_count, 2),
  max_object_count = case
    when max_object_count >= 6 then 4
    when max_object_count >= 4 then 3
    when max_object_count > 0 then least(max_object_count, 2)
    else max_object_count
  end,
  next_spawn_at = case
    when next_spawn_at is null or next_spawn_at < now() + interval '2 hours' then
      now()
        + interval '2 hours'
        + (floor(random() * 3 * 3600)::integer * interval '1 second')
    else next_spawn_at
  end
where sector_key like 'm250:%';

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
  profile_level integer := 1;
  active_expedition_exists boolean;
  effective_scan_radius_m integer;
  sector_size_m double precision := 250.0;
  candidate_sector record;
  sector_state record;
  current_live_objects integer;
  objects_to_spawn integer;
  spawn_index integer;
  initial_min_objects integer;
  initial_max_objects integer;
  first_fill_target integer;
  spacing_m double precision;
  chosen_lat double precision;
  chosen_lng double precision;
  chosen_resource_id text;
  should_spawn_chest boolean;
  next_expires_at timestamptz;
  computed_next_spawn_at timestamptz;
  next_sector_key text;
  spawned_count integer;
  offset_distance_m double precision;
  offset_bearing double precision;
  spawn_lat double precision;
  spawn_lng double precision;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  effective_scan_radius_m := least(5000, greatest(250, input_scan_radius_m));

  select coalesce(profiles.character_level, 1)
  into profile_level
  from public.player_profiles profiles
  where profiles.user_id = current_user_id;

  profile_level := coalesce(profile_level, 1);

  select exists (
    select 1
    from public.player_expeditions expeditions
    where
      expeditions.user_id = current_user_id
      and expeditions.status = 'active'
  )
  into active_expedition_exists;

  if not active_expedition_exists then
    delete from public.player_map_objects objects
    where
      objects.user_id = current_user_id
      and (
        (
          objects.collected_at is null
          and objects.expires_at is not null
          and objects.expires_at <= now()
        )
        or (
          objects.collected_at is not null
          and objects.collected_at <= now() - interval '12 hours'
        )
      );
  end if;

  if input_walkable_candidates is not null
    and jsonb_typeof(input_walkable_candidates) = 'array'
    and jsonb_array_length(input_walkable_candidates) > 0 then
    for candidate_sector in
      select
        floor((candidate.lat * 111320.0) / sector_size_m)::integer as sector_lat,
        floor(
          (
            coalesce(candidate.lng, candidate.lon)
            * 111320.0
            * greatest(0.25, abs(cos(radians(candidate.lat))))
          )
          / sector_size_m
        )::integer as sector_lng,
        count(*)::integer as candidate_count
      from jsonb_to_recordset(input_walkable_candidates) as candidate(
        lat double precision,
        lng double precision,
        lon double precision
      )
      where
        candidate.lat between -90 and 90
        and coalesce(candidate.lng, candidate.lon) between -180 and 180
        and public.haversine_distance_meters(
          input_lat,
          input_lng,
          candidate.lat,
          coalesce(candidate.lng, candidate.lon)
        ) <= effective_scan_radius_m
      group by 1, 2
    loop
      next_sector_key := 'm250:'
        || candidate_sector.sector_lat::text
        || ':'
        || candidate_sector.sector_lng::text;

      if candidate_sector.candidate_count >= 16 then
        initial_min_objects := 2;
        initial_max_objects := 4;
        spacing_m := 85.0;
      elsif candidate_sector.candidate_count >= 6 then
        initial_min_objects := 1;
        initial_max_objects := 3;
        spacing_m := 65.0;
      else
        initial_min_objects := 1;
        initial_max_objects := 2;
        spacing_m := 32.0;
      end if;

      insert into public.player_map_sectors (
        user_id,
        sector_key,
        sector_lat,
        sector_lng,
        min_object_count,
        max_object_count,
        next_spawn_at
      )
      values (
        current_user_id,
        next_sector_key,
        candidate_sector.sector_lat,
        candidate_sector.sector_lng,
        initial_min_objects,
        initial_max_objects,
        now()
          + (
            (4 * 3600 + floor(random() * 4 * 3600)::integer)
            * interval '1 second'
          )
      )
      on conflict on constraint player_map_sectors_pkey do update
      set
        max_object_count = least(
          greatest(public.player_map_sectors.max_object_count, excluded.max_object_count),
          4
        ),
        min_object_count = least(
          case
            when public.player_map_sectors.min_object_count = 0
              then excluded.min_object_count
            else public.player_map_sectors.min_object_count
          end,
          2
        ),
        next_spawn_at = coalesce(
          public.player_map_sectors.next_spawn_at,
          excluded.next_spawn_at
        );

      select *
      into sector_state
      from public.player_map_sectors sectors
      where
        sectors.user_id = current_user_id
        and sectors.sector_key = next_sector_key;

      select count(*)::integer
      into current_live_objects
      from public.player_map_objects objects
      where
        objects.user_id = current_user_id
        and objects.sector_key = next_sector_key
        and objects.collected_at is null
        and (
          active_expedition_exists
          or objects.expires_at is null
          or objects.expires_at > now()
        );

      objects_to_spawn := 0;

      if current_live_objects < sector_state.max_object_count then
        if sector_state.last_spawned_at is null and current_live_objects = 0 then
          first_fill_target := sector_state.min_object_count
            + floor(
              random()
              * greatest(1, sector_state.max_object_count - sector_state.min_object_count + 1)
            )::integer;
          objects_to_spawn := least(
            first_fill_target,
            sector_state.max_object_count - current_live_objects
          );
        elsif sector_state.next_spawn_at is null or sector_state.next_spawn_at <= now() then
          objects_to_spawn := 1;
        end if;
      end if;

      if objects_to_spawn <= 0 then
        continue;
      end if;

      spawned_count := 0;

      for spawn_index in 1..objects_to_spawn loop
        chosen_lat := null;
        chosen_lng := null;

        select
          candidate.lat,
          coalesce(candidate.lng, candidate.lon) as lng
        into chosen_lat, chosen_lng
        from jsonb_to_recordset(input_walkable_candidates) as candidate(
          lat double precision,
          lng double precision,
          lon double precision
        )
        where
          candidate.lat between -90 and 90
          and coalesce(candidate.lng, candidate.lon) between -180 and 180
          and floor((candidate.lat * 111320.0) / sector_size_m)::integer
            = candidate_sector.sector_lat
          and floor(
            (
              coalesce(candidate.lng, candidate.lon)
              * 111320.0
              * greatest(0.25, abs(cos(radians(candidate.lat))))
            )
            / sector_size_m
          )::integer = candidate_sector.sector_lng
          and public.haversine_distance_meters(
            input_lat,
            input_lng,
            candidate.lat,
            coalesce(candidate.lng, candidate.lon)
          ) <= effective_scan_radius_m
          and not exists (
            select 1
            from public.player_map_objects existing
            where
              existing.user_id = current_user_id
              and existing.collected_at is null
              and (
                active_expedition_exists
                or existing.expires_at is null
                or existing.expires_at > now()
              )
              and public.haversine_distance_meters(
                candidate.lat,
                coalesce(candidate.lng, candidate.lon),
                existing.lat,
                existing.lng
              ) < spacing_m
          )
        order by random()
        limit 1;

        if chosen_lat is null then
          select
            candidate.lat,
            coalesce(candidate.lng, candidate.lon) as lng
          into chosen_lat, chosen_lng
          from jsonb_to_recordset(input_walkable_candidates) as candidate(
            lat double precision,
            lng double precision,
            lon double precision
          )
          where
            candidate.lat between -90 and 90
            and coalesce(candidate.lng, candidate.lon) between -180 and 180
            and floor((candidate.lat * 111320.0) / sector_size_m)::integer
              = candidate_sector.sector_lat
            and floor(
              (
                coalesce(candidate.lng, candidate.lon)
                * 111320.0
                * greatest(0.25, abs(cos(radians(candidate.lat))))
              )
              / sector_size_m
            )::integer = candidate_sector.sector_lng
            and public.haversine_distance_meters(
              input_lat,
              input_lng,
              candidate.lat,
              coalesce(candidate.lng, candidate.lon)
            ) <= effective_scan_radius_m
            and not exists (
              select 1
              from public.player_map_objects existing
              where
                existing.user_id = current_user_id
                and existing.collected_at is null
                and (
                  active_expedition_exists
                  or existing.expires_at is null
                  or existing.expires_at > now()
                )
                and public.haversine_distance_meters(
                  candidate.lat,
                  coalesce(candidate.lng, candidate.lon),
                  existing.lat,
                  existing.lng
                ) < 12
            )
          order by random()
          limit 1;
        end if;

        if chosen_lat is null then
          continue;
        end if;

        offset_distance_m := random() * 10.0;
        offset_bearing := random() * 2.0 * pi();
        spawn_lat := chosen_lat
          + (cos(offset_bearing) * offset_distance_m / 111320.0);
        spawn_lng := chosen_lng
          + (
            sin(offset_bearing)
            * offset_distance_m
            / greatest(1.0, abs(111320.0 * cos(radians(chosen_lat))))
          );
        next_expires_at := now()
          + interval '12 hours'
          + (floor(random() * 43200)::integer * interval '1 second');

        should_spawn_chest := random() < 0.08;

        if should_spawn_chest then
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
            'chest',
            null,
            'basic_chest',
            1,
            spawn_lat,
            spawn_lng,
            next_expires_at
          );

          spawned_count := spawned_count + 1;
          continue;
        end if;

        chosen_resource_id := null;

        select definitions.id
        into chosen_resource_id
        from public.resource_definitions definitions
        where
          definitions.spawn_weight > 0
          and definitions.min_unlock_level <= profile_level
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

        chosen_resource_id := coalesce(chosen_resource_id, 'wood');

        if not exists (
          select 1
          from public.resource_definitions definitions
          where definitions.id = chosen_resource_id
        ) then
          continue;
        end if;

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

        spawned_count := spawned_count + 1;
      end loop;

      computed_next_spawn_at := now()
        + (
          (5 * 3600 + floor(random() * 4 * 3600)::integer)
          * interval '1 second'
        );

      if spawned_count > 0 then
        update public.player_map_sectors sectors
        set
          last_spawned_at = now(),
          next_spawn_at = computed_next_spawn_at
        where
          sectors.user_id = current_user_id
          and sectors.sector_key = next_sector_key;
      elsif objects_to_spawn > 0 then
        update public.player_map_sectors sectors
        set next_spawn_at = computed_next_spawn_at
        where
          sectors.user_id = current_user_id
          and sectors.sector_key = next_sector_key;
      end if;
    end loop;
  end if;

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
      <= effective_scan_radius_m
  order by 7 asc
  limit 250;
end;
$$;

grant execute on function public.scan_player_map_objects(
  double precision,
  double precision,
  integer,
  integer,
  jsonb
) to authenticated;
