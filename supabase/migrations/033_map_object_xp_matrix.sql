create table if not exists public.map_object_xp_rewards (
  reward_key text primary key,
  object_kind text not null,
  resource_id text,
  item_id text,
  min_xp integer not null,
  max_xp integer not null,
  is_active boolean not null default true,
  notes text,
  updated_at timestamptz not null default now(),
  constraint map_object_xp_rewards_kind_check check (object_kind in ('resource', 'chest')),
  constraint map_object_xp_rewards_xp_check check (min_xp >= 0 and max_xp >= min_xp)
);

drop trigger if exists map_object_xp_rewards_set_updated_at on public.map_object_xp_rewards;

create trigger map_object_xp_rewards_set_updated_at
before update on public.map_object_xp_rewards
for each row
execute function public.set_updated_at();

insert into public.map_object_xp_rewards (
  reward_key,
  object_kind,
  resource_id,
  item_id,
  min_xp,
  max_xp,
  notes
)
values
  ('resource:wood', 'resource', 'wood', null, 2, 10, 'Basic wood pickup.'),
  ('resource:stone', 'resource', 'stone', null, 2, 10, 'Basic stone pickup.'),
  ('resource:food', 'resource', 'food', null, 2, 10, 'Basic food pickup.'),
  ('resource:iron', 'resource', 'iron', null, 8, 18, 'Future iron pickup; higher value than basic resources.'),
  ('chest:any', 'chest', null, null, 8, 15, 'Unknown find / chest pickup.'),
  ('resource:default', 'resource', null, null, 2, 10, 'Fallback for resources without their own row.'),
  ('chest:default', 'chest', null, null, 8, 15, 'Fallback for chests without their own row.')
on conflict (reward_key) do update
set
  object_kind = excluded.object_kind,
  resource_id = excluded.resource_id,
  item_id = excluded.item_id,
  min_xp = excluded.min_xp,
  max_xp = excluded.max_xp,
  notes = excluded.notes,
  updated_at = now();

create or replace function public.roll_map_object_xp(
  input_object_kind text,
  input_resource_id text,
  input_item_id text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  reward record;
  min_value integer;
  max_value integer;
begin
  select *
  into reward
  from public.map_object_xp_rewards rewards
  where
    rewards.is_active
    and rewards.object_kind = input_object_kind
    and (
      rewards.resource_id is null
      or rewards.resource_id = input_resource_id
    )
    and (
      rewards.item_id is null
      or rewards.item_id = input_item_id
    )
  order by
    case when rewards.resource_id is not null then 1 else 0 end desc,
    case when rewards.item_id is not null then 1 else 0 end desc
  limit 1;

  min_value := coalesce(
    reward.min_xp,
    case when input_object_kind = 'chest' then 8 else 2 end
  );
  max_value := coalesce(
    reward.max_xp,
    case when input_object_kind = 'chest' then 15 else 10 end
  );

  max_value := greatest(min_value, max_value);

  return min_value + floor(random() * (max_value - min_value + 1))::integer;
end;
$$;

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
  else
    reward_resource_id := object_row.resource_id;
    reward_quantity := object_row.quantity;
    reward_item_id := null;
    reward_item_quantity := 0;
  end if;

  pickup_xp := public.roll_map_object_xp(
    object_row.object_kind,
    reward_resource_id,
    reward_item_id
  );

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

grant select on table public.map_object_xp_rewards to authenticated;
grant execute on function public.roll_map_object_xp(text, text, text) to authenticated;
grant execute on function public.collect_player_map_object(
  uuid,
  uuid,
  double precision,
  double precision,
  integer
) to authenticated;
