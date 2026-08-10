create or replace function public.get_visible_player_map_objects(
  input_lat double precision,
  input_lng double precision,
  input_scan_radius_m integer
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
  effective_scan_radius_m integer;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  effective_scan_radius_m := least(5000, greatest(250, input_scan_radius_m));

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
      and objects.collected_at is null
      and objects.expires_at is not null
      and objects.expires_at <= now();
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

grant execute on function public.get_visible_player_map_objects(
  double precision,
  double precision,
  integer
) to authenticated;
