create or replace function public.fuel_player_campfire(input_wood integer)
returns table(
  burn_until timestamptz,
  last_fueled_at timestamptz,
  total_wood_burned integer,
  remaining_wood integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  current_wood integer;
  current_burn_until timestamptz;
  next_burn_until timestamptz;
  fuel_started_at timestamptz;
  actual_wood integer;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  if input_wood is null or input_wood <= 0 then
    raise exception 'INVALID_FUEL_AMOUNT' using errcode = '23514';
  end if;

  select resources.quantity
  into current_wood
  from public.player_resources resources
  where
    resources.user_id = current_user_id
    and resources.resource_id = 'wood'
  for update;

  current_wood := coalesce(current_wood, 0);

  select campfires.burn_until
  into current_burn_until
  from public.player_campfires campfires
  where campfires.user_id = current_user_id
  for update;

  fuel_started_at := greatest(now(), coalesce(current_burn_until, now()));
  actual_wood := least(
    input_wood,
    greatest(
      0,
      ceiling(
        extract(epoch from ((now() + interval '24 hours') - fuel_started_at)) / 600
      )::integer
    )
  );

  if actual_wood <= 0 then
    raise exception 'CAMPFIRE_FULL' using errcode = '23514';
  end if;

  if current_wood < actual_wood then
    raise exception 'INSUFFICIENT_RESOURCES' using errcode = '23514';
  end if;

  next_burn_until := least(
    fuel_started_at + (actual_wood * interval '10 minutes'),
    now() + interval '24 hours'
  );

  insert into public.player_resources (user_id, resource_id, quantity)
  values (current_user_id, 'wood', current_wood - actual_wood)
  on conflict on constraint player_resources_pkey do update
  set
    quantity = excluded.quantity,
    updated_at = now();

  insert into public.player_campfires (
    user_id,
    burn_until,
    last_fueled_at,
    total_wood_burned
  )
  values (
    current_user_id,
    next_burn_until,
    now(),
    actual_wood
  )
  on conflict (user_id) do update
  set
    burn_until = excluded.burn_until,
    last_fueled_at = excluded.last_fueled_at,
    total_wood_burned = public.player_campfires.total_wood_burned + actual_wood,
    updated_at = now();

  return query
  select
    campfires.burn_until,
    campfires.last_fueled_at,
    campfires.total_wood_burned,
    current_wood - actual_wood
  from public.player_campfires campfires
  where campfires.user_id = current_user_id;
end;
$$;

grant execute on function public.fuel_player_campfire(integer) to authenticated;
