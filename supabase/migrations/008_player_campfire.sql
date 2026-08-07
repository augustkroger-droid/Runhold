update public.building_definitions
set
  description = 'Håller mörkret borta. Kan fyllas med trä men har ingen HP just nu.',
  base_max_hp = 0,
  updated_at = now()
where id = 'campfire';

update public.player_buildings
set
  current_hp = 0,
  max_hp = 0,
  state = 'active',
  updated_at = now()
where building_id = 'campfire';

create table if not exists public.player_campfires (
  user_id uuid primary key references auth.users(id) on delete cascade,
  burn_until timestamptz,
  last_fueled_at timestamptz,
  total_wood_burned integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_campfires_total_wood_burned_check check (total_wood_burned >= 0)
);

alter table public.player_campfires enable row level security;

drop trigger if exists player_campfires_set_updated_at on public.player_campfires;

create trigger player_campfires_set_updated_at
before update on public.player_campfires
for each row
execute function public.set_updated_at();

drop policy if exists "Users can read own campfire" on public.player_campfires;

create policy "Users can read own campfire"
on public.player_campfires
for select
to authenticated
using (auth.uid() = user_id);

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

  if current_wood < input_wood then
    raise exception 'INSUFFICIENT_RESOURCES' using errcode = '23514';
  end if;

  select campfires.burn_until
  into current_burn_until
  from public.player_campfires campfires
  where campfires.user_id = current_user_id
  for update;

  fuel_started_at := greatest(now(), coalesce(current_burn_until, now()));
  next_burn_until := fuel_started_at + (input_wood * interval '30 minutes');

  insert into public.player_resources (user_id, resource_id, quantity)
  values (current_user_id, 'wood', current_wood - input_wood)
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
    input_wood
  )
  on conflict (user_id) do update
  set
    burn_until = excluded.burn_until,
    last_fueled_at = excluded.last_fueled_at,
    total_wood_burned = public.player_campfires.total_wood_burned + input_wood,
    updated_at = now();

  return query
  select
    next_burn_until,
    now(),
    campfires.total_wood_burned,
    current_wood - input_wood
  from public.player_campfires campfires
  where campfires.user_id = current_user_id;
end;
$$;

grant select on table public.player_campfires to authenticated;
grant execute on function public.fuel_player_campfire(integer) to authenticated;
