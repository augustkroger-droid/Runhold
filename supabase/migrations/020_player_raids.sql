create table if not exists public.player_raids (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'scheduled',
  threat_level integer not null default 1,
  scheduled_at timestamptz not null,
  started_at timestamptz,
  resolved_at timestamptz,
  damage_report jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_raids_status_check check (
    status in ('scheduled', 'active', 'resolved')
  ),
  constraint player_raids_threat_level_check check (
    threat_level between 1 and 10
  )
);

create index if not exists player_raids_user_status_idx
on public.player_raids (user_id, status, scheduled_at);

alter table public.player_raids enable row level security;

drop trigger if exists player_raids_set_updated_at on public.player_raids;

create trigger player_raids_set_updated_at
before update on public.player_raids
for each row
execute function public.set_updated_at();

drop policy if exists "Users can read own raids" on public.player_raids;

create policy "Users can read own raids"
on public.player_raids
for select
to authenticated
using (auth.uid() = user_id);

create or replace function public.schedule_next_player_raid(
  input_user_id uuid,
  input_after timestamptz,
  input_threat_level integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_raid_id uuid;
begin
  insert into public.player_raids (
    user_id,
    status,
    threat_level,
    scheduled_at
  )
  values (
    input_user_id,
    'scheduled',
    least(10, greatest(1, input_threat_level)),
    input_after + ((6 + floor(random() * 5)::integer) * interval '1 hour')
  )
  returning id into new_raid_id;

  return new_raid_id;
end;
$$;

create or replace function public.get_player_raid_state()
returns table(
  id uuid,
  user_id uuid,
  status text,
  threat_level integer,
  scheduled_at timestamptz,
  started_at timestamptz,
  resolved_at timestamptz,
  damage_report jsonb
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

  perform public.initialize_player_base();

  update public.player_raids raids
  set
    status = 'active',
    started_at = coalesce(raids.started_at, raids.scheduled_at),
    updated_at = now()
  where
    raids.user_id = current_user_id
    and raids.status = 'scheduled'
    and raids.scheduled_at <= now();

  if not exists (
    select 1
    from public.player_raids raids
    where
      raids.user_id = current_user_id
      and raids.status in ('scheduled', 'active')
  ) then
    perform public.schedule_next_player_raid(current_user_id, now(), 1);
  end if;

  return query
  select
    raids.id,
    raids.user_id,
    raids.status,
    raids.threat_level,
    raids.scheduled_at,
    raids.started_at,
    raids.resolved_at,
    raids.damage_report
  from public.player_raids raids
  where
    raids.user_id = current_user_id
    and (
      raids.status in ('scheduled', 'active')
      or raids.id = (
        select latest.id
        from public.player_raids latest
        where
          latest.user_id = current_user_id
          and latest.status = 'resolved'
        order by latest.resolved_at desc nulls last
        limit 1
      )
    )
  order by
    case raids.status
      when 'active' then 0
      when 'scheduled' then 1
      else 2
    end,
    raids.scheduled_at desc;
end;
$$;

create or replace function public.light_raid_signal()
returns table(
  id uuid,
  user_id uuid,
  status text,
  threat_level integer,
  scheduled_at timestamptz,
  started_at timestamptz,
  resolved_at timestamptz,
  damage_report jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  target_raid_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  perform public.initialize_player_base();

  select raids.id
  into target_raid_id
  from public.player_raids raids
  where
    raids.user_id = current_user_id
    and raids.status = 'scheduled'
  order by raids.scheduled_at asc
  limit 1
  for update;

  if target_raid_id is null then
    insert into public.player_raids (
      user_id,
      status,
      threat_level,
      scheduled_at,
      started_at
    )
    values (
      current_user_id,
      'active',
      1,
      now(),
      now()
    )
    returning player_raids.id into target_raid_id;
  else
    update public.player_raids raids
    set
      status = 'active',
      scheduled_at = least(raids.scheduled_at, now()),
      started_at = now(),
      updated_at = now()
    where raids.id = target_raid_id;
  end if;

  return query
  select *
  from public.get_player_raid_state();
end;
$$;

create or replace function public.resolve_player_raid(input_raid_id uuid)
returns table(
  id uuid,
  user_id uuid,
  status text,
  threat_level integer,
  scheduled_at timestamptz,
  started_at timestamptz,
  resolved_at timestamptz,
  damage_report jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  raid record;
  wall record;
  tent record;
  incoming_damage integer;
  remaining_damage integer;
  wall_damage integer := 0;
  tent_damage integer := 0;
  blocked_damage integer := 0;
  next_wall_hp integer;
  next_tent_hp integer;
  outcome text;
  report jsonb;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  perform public.initialize_player_base();

  select *
  into raid
  from public.player_raids raids
  where
    raids.id = input_raid_id
    and raids.user_id = current_user_id
  for update;

  if raid.id is null or raid.status <> 'active' then
    raise exception 'RAID_NOT_ACTIVE' using errcode = '23514';
  end if;

  incoming_damage := 18 + (raid.threat_level * 12) + floor(random() * 12)::integer;
  remaining_damage := incoming_damage;

  select *
  into wall
  from public.player_buildings buildings
  where
    buildings.user_id = current_user_id
    and buildings.building_id = 'wall'
  for update;

  if wall.building_id is not null
    and wall.state <> 'not_built'
    and wall.current_hp > 0 then
    wall_damage := least(wall.current_hp, remaining_damage);
    next_wall_hp := greatest(0, wall.current_hp - wall_damage);
    remaining_damage := remaining_damage - wall_damage;

    update public.player_buildings buildings
    set
      current_hp = next_wall_hp,
      state = case
        when next_wall_hp = 0 then 'destroyed'
        when next_wall_hp < buildings.max_hp then 'damaged'
        else 'active'
      end,
      updated_at = now()
    where
      buildings.user_id = current_user_id
      and buildings.building_id = 'wall';
  end if;

  select *
  into tent
  from public.player_buildings buildings
  where
    buildings.user_id = current_user_id
    and buildings.building_id = 'tent'
  for update;

  if tent.building_id is not null and tent.current_hp > 0 and remaining_damage > 0 then
    tent_damage := least(tent.current_hp, remaining_damage);
    next_tent_hp := greatest(0, tent.current_hp - tent_damage);
    remaining_damage := remaining_damage - tent_damage;

    update public.player_buildings buildings
    set
      current_hp = next_tent_hp,
      state = case
        when next_tent_hp = 0 then 'destroyed'
        when next_tent_hp < buildings.max_hp then 'damaged'
        else 'active'
      end,
      updated_at = now()
    where
      buildings.user_id = current_user_id
      and buildings.building_id = 'tent';
  end if;

  blocked_damage := incoming_damage - tent_damage;
  outcome := case
    when tent_damage = 0 then 'held'
    when next_tent_hp = 0 then 'breached'
    else 'damaged'
  end;
  report := jsonb_build_object(
    'incomingDamage', incoming_damage,
    'blockedDamage', blocked_damage,
    'wallDamage', wall_damage,
    'tentDamage', tent_damage,
    'outcome', outcome
  );

  update public.player_raids raids
  set
    status = 'resolved',
    resolved_at = now(),
    damage_report = report,
    updated_at = now()
  where raids.id = raid.id;

  if not exists (
    select 1
    from public.player_raids raids
    where
      raids.user_id = current_user_id
      and raids.status in ('scheduled', 'active')
  ) then
    perform public.schedule_next_player_raid(
      current_user_id,
      now(),
      case when outcome = 'held' then raid.threat_level + 1 else raid.threat_level end
    );
  end if;

  return query
  select *
  from public.get_player_raid_state();
end;
$$;

grant select on table public.player_raids to authenticated;
grant execute on function public.get_player_raid_state() to authenticated;
grant execute on function public.light_raid_signal() to authenticated;
grant execute on function public.resolve_player_raid(uuid) to authenticated;
