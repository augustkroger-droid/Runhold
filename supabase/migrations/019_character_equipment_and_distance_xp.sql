create table if not exists public.player_equipment (
  user_id uuid not null references auth.users(id) on delete cascade,
  slot_id text not null,
  item_id text references public.item_definitions(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, slot_id),
  constraint player_equipment_slot_check check (
    slot_id in ('tool', 'weapon', 'armor', 'artifact')
  )
);

alter table public.player_equipment enable row level security;

drop trigger if exists player_equipment_set_updated_at on public.player_equipment;

create trigger player_equipment_set_updated_at
before update on public.player_equipment
for each row
execute function public.set_updated_at();

drop policy if exists "Users can read own equipment" on public.player_equipment;

create policy "Users can read own equipment"
on public.player_equipment
for select
to authenticated
using (auth.uid() = user_id);

drop function if exists public.equip_player_item(text, text);

create function public.equip_player_item(
  input_slot_id text,
  input_item_id text
)
returns table(
  slot_id text,
  item_id text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  item_definition record;
  owned_quantity integer;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  if input_slot_id not in ('tool', 'weapon', 'armor', 'artifact') then
    raise exception 'INVALID_EQUIPMENT_SLOT' using errcode = '23514';
  end if;

  select *
  into item_definition
  from public.item_definitions definitions
  where definitions.id = input_item_id;

  if item_definition.id is null then
    raise exception 'ITEM_NOT_FOUND' using errcode = '23514';
  end if;

  if item_definition.item_kind <> input_slot_id then
    raise exception 'ITEM_SLOT_MISMATCH' using errcode = '23514';
  end if;

  select items.quantity
  into owned_quantity
  from public.player_items items
  where
    items.user_id = current_user_id
    and items.item_id = input_item_id;

  if coalesce(owned_quantity, 0) <= 0 then
    raise exception 'ITEM_NOT_OWNED' using errcode = '23514';
  end if;

  insert into public.player_equipment (user_id, slot_id, item_id)
  values (current_user_id, input_slot_id, input_item_id)
  on conflict on constraint player_equipment_pkey do update
  set
    item_id = excluded.item_id,
    updated_at = now();

  return query
  select input_slot_id, input_item_id;
end;
$$;

drop function if exists public.unequip_player_item(text);

create function public.unequip_player_item(input_slot_id text)
returns table(
  slot_id text,
  item_id text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  removed_item_id text;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  if input_slot_id not in ('tool', 'weapon', 'armor', 'artifact') then
    raise exception 'INVALID_EQUIPMENT_SLOT' using errcode = '23514';
  end if;

  delete from public.player_equipment equipment
  where
    equipment.user_id = current_user_id
    and equipment.slot_id = input_slot_id
  returning equipment.item_id into removed_item_id;

  return query
  select input_slot_id, removed_item_id;
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
  earned_xp := floor(distance_value / 50.0)::integer;

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

grant select on table public.player_equipment to authenticated;
grant execute on function public.equip_player_item(text, text) to authenticated;
grant execute on function public.unequip_player_item(text) to authenticated;
grant execute on function public.complete_player_expedition(uuid, integer, integer, jsonb) to authenticated;
