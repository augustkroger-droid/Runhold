create table if not exists public.resource_definitions (
  id text primary key,
  name text not null,
  icon text not null,
  rarity text not null,
  spawn_weight integer not null,
  min_unlock_level integer not null default 1,
  required_tech text,
  inventory_behavior text not null default 'stackable',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint resource_definitions_rarity_check check (
    rarity in ('common', 'uncommon', 'rare')
  ),
  constraint resource_definitions_spawn_weight_check check (spawn_weight >= 0),
  constraint resource_definitions_min_unlock_level_check check (min_unlock_level >= 1),
  constraint resource_definitions_inventory_behavior_check check (
    inventory_behavior in ('stackable')
  )
);

insert into public.resource_definitions (
  id,
  name,
  icon,
  rarity,
  spawn_weight,
  min_unlock_level,
  required_tech,
  inventory_behavior
)
values
  ('wood', 'Trä', '🌲', 'common', 45, 1, null, 'stackable'),
  ('stone', 'Sten', '◆', 'common', 35, 1, null, 'stackable'),
  ('food', 'Mat', '✦', 'common', 25, 1, null, 'stackable')
on conflict (id) do update
set
  name = excluded.name,
  icon = excluded.icon,
  rarity = excluded.rarity,
  spawn_weight = excluded.spawn_weight,
  min_unlock_level = excluded.min_unlock_level,
  required_tech = excluded.required_tech,
  inventory_behavior = excluded.inventory_behavior,
  updated_at = now();

create table if not exists public.player_resources (
  user_id uuid not null references auth.users(id) on delete cascade,
  resource_id text not null references public.resource_definitions(id),
  quantity integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, resource_id),
  constraint player_resources_quantity_check check (quantity >= 0)
);

alter table public.player_resources enable row level security;

drop trigger if exists player_resources_set_updated_at on public.player_resources;

create trigger player_resources_set_updated_at
before update on public.player_resources
for each row
execute function public.set_updated_at();

drop policy if exists "Users can read own resources" on public.player_resources;

create policy "Users can read own resources"
on public.player_resources
for select
to authenticated
using (auth.uid() = user_id);

create or replace function public.adjust_player_resource(
  input_resource_id text,
  input_delta integer
)
returns table(resource_id text, quantity integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  current_quantity integer;
  next_quantity integer;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  if not exists (
    select 1
    from public.resource_definitions definitions
    where definitions.id = input_resource_id
  ) then
    raise exception 'UNKNOWN_RESOURCE' using errcode = '23503';
  end if;

  select resources.quantity
  into current_quantity
  from public.player_resources resources
  where
    resources.user_id = current_user_id
    and resources.resource_id = input_resource_id
  for update;

  current_quantity := coalesce(current_quantity, 0);
  next_quantity := current_quantity + input_delta;

  if next_quantity < 0 then
    raise exception 'INSUFFICIENT_RESOURCES' using errcode = '23514';
  end if;

  insert into public.player_resources (user_id, resource_id, quantity)
  values (current_user_id, input_resource_id, next_quantity)
  on conflict on constraint player_resources_pkey do update
  set
    quantity = excluded.quantity,
    updated_at = now();

  return query
  select input_resource_id, next_quantity;
end;
$$;

grant select on table public.resource_definitions to anon, authenticated;
grant select on table public.player_resources to authenticated;
grant execute on function public.adjust_player_resource(text, integer) to authenticated;
