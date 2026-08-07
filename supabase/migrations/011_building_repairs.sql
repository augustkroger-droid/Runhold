create table if not exists public.repair_definitions (
  building_id text primary key references public.building_definitions(id),
  cost_per_10_hp jsonb not null default '{}'::jsonb,
  seconds_per_10_hp integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint repair_definitions_seconds_check check (seconds_per_10_hp >= 0)
);

insert into public.repair_definitions (
  building_id,
  cost_per_10_hp,
  seconds_per_10_hp
)
values
  ('tent', '{"wood": 1}'::jsonb, 15),
  ('wall', '{"wood": 1, "stone": 1}'::jsonb, 20)
on conflict (building_id) do update
set
  cost_per_10_hp = excluded.cost_per_10_hp,
  seconds_per_10_hp = excluded.seconds_per_10_hp,
  updated_at = now();

create table if not exists public.player_repairs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  building_id text not null references public.building_definitions(id),
  status text not null default 'active',
  starts_at timestamptz not null default now(),
  completes_at timestamptz not null,
  completed_at timestamptz,
  repaired_hp integer not null,
  cost jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_repairs_status_check check (
    status in ('active', 'completed', 'cancelled')
  ),
  constraint player_repairs_repaired_hp_check check (repaired_hp > 0)
);

create unique index if not exists player_repairs_one_active_building
on public.player_repairs (user_id, building_id)
where status = 'active';

alter table public.player_repairs enable row level security;

drop trigger if exists player_repairs_set_updated_at on public.player_repairs;

create trigger player_repairs_set_updated_at
before update on public.player_repairs
for each row
execute function public.set_updated_at();

drop policy if exists "Users can read own repairs" on public.player_repairs;

create policy "Users can read own repairs"
on public.player_repairs
for select
to authenticated
using (auth.uid() = user_id);

create or replace function public.complete_ready_repairs()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  repair record;
  next_hp integer;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  for repair in
    select *
    from public.player_repairs active_repairs
    where
      active_repairs.user_id = current_user_id
      and active_repairs.status = 'active'
      and active_repairs.completes_at <= now()
  loop
    update public.player_buildings buildings
    set
      current_hp = least(buildings.max_hp, buildings.current_hp + repair.repaired_hp),
      state = case
        when least(buildings.max_hp, buildings.current_hp + repair.repaired_hp) = 0 then 'destroyed'
        when least(buildings.max_hp, buildings.current_hp + repair.repaired_hp) < buildings.max_hp then 'damaged'
        else 'active'
      end,
      updated_at = now()
    where
      buildings.user_id = current_user_id
      and buildings.building_id = repair.building_id
    returning current_hp into next_hp;

    update public.player_repairs
    set
      status = 'completed',
      completed_at = now(),
      updated_at = now()
    where id = repair.id;
  end loop;
end;
$$;

create or replace function public.damage_player_building(
  input_building_id text,
  input_damage integer
)
returns table(
  building_id text,
  current_hp integer,
  max_hp integer,
  state text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  building record;
  next_hp integer;
  next_state text;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  if input_damage is null or input_damage <= 0 then
    raise exception 'INVALID_DAMAGE' using errcode = '23514';
  end if;

  select *
  into building
  from public.player_buildings buildings
  where
    buildings.user_id = current_user_id
    and buildings.building_id = input_building_id
  for update;

  if building.building_id is null or building.state = 'not_built' then
    raise exception 'BUILDING_NOT_FOUND' using errcode = '23503';
  end if;

  if building.max_hp <= 0 then
    raise exception 'BUILDING_HAS_NO_HP' using errcode = '23514';
  end if;

  next_hp := greatest(0, building.current_hp - input_damage);
  next_state := case
    when next_hp = 0 then 'destroyed'
    when next_hp < building.max_hp then 'damaged'
    else 'active'
  end;

  update public.player_buildings buildings
  set
    current_hp = next_hp,
    state = next_state,
    updated_at = now()
  where
    buildings.user_id = current_user_id
    and buildings.building_id = input_building_id;

  return query
  select input_building_id, next_hp, building.max_hp, next_state;
end;
$$;

create or replace function public.start_player_building_repair(input_building_id text)
returns table(
  id uuid,
  building_id text,
  starts_at timestamptz,
  completes_at timestamptz,
  repaired_hp integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  building record;
  definition record;
  cost_item record;
  current_quantity integer;
  missing_hp integer;
  repair_units integer;
  repair_cost jsonb := '{}'::jsonb;
  new_repair_id uuid;
  repair_starts_at timestamptz;
  repair_completes_at timestamptz;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  perform public.complete_ready_repairs();

  select *
  into building
  from public.player_buildings buildings
  where
    buildings.user_id = current_user_id
    and buildings.building_id = input_building_id
  for update;

  if building.building_id is null or building.state = 'not_built' then
    raise exception 'BUILDING_NOT_FOUND' using errcode = '23503';
  end if;

  if building.current_hp >= building.max_hp then
    raise exception 'BUILDING_FULL_HP' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.player_repairs repairs
    where
      repairs.user_id = current_user_id
      and repairs.building_id = input_building_id
      and repairs.status = 'active'
  ) then
    raise exception 'REPAIR_ALREADY_ACTIVE' using errcode = '23505';
  end if;

  select *
  into definition
  from public.repair_definitions repair_definitions
  where repair_definitions.building_id = input_building_id;

  if definition.building_id is null then
    raise exception 'REPAIR_NOT_AVAILABLE' using errcode = '23503';
  end if;

  missing_hp := building.max_hp - building.current_hp;
  repair_units := ceiling(missing_hp / 10.0)::integer;

  for cost_item in select * from jsonb_each_text(definition.cost_per_10_hp)
  loop
    repair_cost := jsonb_set(
      repair_cost,
      array[cost_item.key],
      to_jsonb((cost_item.value::integer) * repair_units),
      true
    );
  end loop;

  for cost_item in select * from jsonb_each_text(repair_cost)
  loop
    select resources.quantity
    into current_quantity
    from public.player_resources resources
    where
      resources.user_id = current_user_id
      and resources.resource_id = cost_item.key
    for update;

    current_quantity := coalesce(current_quantity, 0);

    if current_quantity < cost_item.value::integer then
      raise exception 'INSUFFICIENT_RESOURCES' using errcode = '23514';
    end if;
  end loop;

  for cost_item in select * from jsonb_each_text(repair_cost)
  loop
    update public.player_resources resources
    set
      quantity = resources.quantity - cost_item.value::integer,
      updated_at = now()
    where
      resources.user_id = current_user_id
      and resources.resource_id = cost_item.key;
  end loop;

  repair_starts_at := now();
  repair_completes_at :=
    repair_starts_at + (repair_units * definition.seconds_per_10_hp * interval '1 second');

  insert into public.player_repairs (
    user_id,
    building_id,
    starts_at,
    completes_at,
    repaired_hp,
    cost
  )
  values (
    current_user_id,
    input_building_id,
    repair_starts_at,
    repair_completes_at,
    missing_hp,
    repair_cost
  )
  returning player_repairs.id into new_repair_id;

  return query
  select
    new_repair_id,
    input_building_id,
    repair_starts_at,
    repair_completes_at,
    missing_hp;
end;
$$;

grant select on table public.repair_definitions to anon, authenticated;
grant select on table public.player_repairs to authenticated;
grant execute on function public.complete_ready_repairs() to authenticated;
grant execute on function public.damage_player_building(text, integer) to authenticated;
grant execute on function public.start_player_building_repair(text) to authenticated;
