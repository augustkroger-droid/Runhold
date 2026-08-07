alter table public.player_raids
add column if not exists enemy_type text not null default 'raiders';

alter table public.player_raids
add column if not exists enemy_count integer not null default 3;

alter table public.player_raids
add column if not exists total_damage integer not null default 30;

alter table public.player_raids
add column if not exists reward jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'player_raids_enemy_count_check'
  ) then
    alter table public.player_raids
    add constraint player_raids_enemy_count_check check (enemy_count > 0) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'player_raids_total_damage_check'
  ) then
    alter table public.player_raids
    add constraint player_raids_total_damage_check check (total_damage >= 0) not valid;
  end if;
end;
$$;

alter table public.player_raids validate constraint player_raids_enemy_count_check;
alter table public.player_raids validate constraint player_raids_total_damage_check;

create table if not exists public.raid_enemy_definitions (
  id text primary key,
  name text not null,
  base_damage integer not null,
  damage_per_threat integer not null,
  base_enemy_count integer not null,
  reward_xp_per_threat integer not null default 3,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint raid_enemy_definitions_damage_check check (
    base_damage >= 0 and damage_per_threat >= 0
  ),
  constraint raid_enemy_definitions_count_check check (base_enemy_count > 0)
);

insert into public.raid_enemy_definitions (
  id,
  name,
  base_damage,
  damage_per_threat,
  base_enemy_count,
  reward_xp_per_threat
)
values ('raiders', 'Raiders', 14, 8, 3, 3)
on conflict (id) do update
set
  name = excluded.name,
  base_damage = excluded.base_damage,
  damage_per_threat = excluded.damage_per_threat,
  base_enemy_count = excluded.base_enemy_count,
  reward_xp_per_threat = excluded.reward_xp_per_threat,
  updated_at = now();

alter table public.raid_enemy_definitions enable row level security;

drop trigger if exists raid_enemy_definitions_set_updated_at on public.raid_enemy_definitions;

create trigger raid_enemy_definitions_set_updated_at
before update on public.raid_enemy_definitions
for each row
execute function public.set_updated_at();

drop policy if exists "Anyone can read raid enemy definitions" on public.raid_enemy_definitions;

create policy "Anyone can read raid enemy definitions"
on public.raid_enemy_definitions
for select
to authenticated
using (true);

create or replace function public.next_night_raid_time(input_after timestamptz)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  local_after timestamp;
  local_date date;
  local_hour integer;
  local_base timestamp;
  offset_minutes integer;
begin
  local_after := timezone('Europe/Stockholm', input_after);
  local_date := local_after::date;
  local_hour := extract(hour from local_after)::integer;

  if local_hour >= 22 then
    local_base := (local_date + 1) + time '22:00';
  elsif local_hour < 5 then
    local_base := local_date + time '22:00';
  else
    local_base := local_date + time '22:00';
  end if;

  offset_minutes := floor(random() * 360)::integer;

  return (local_base + (offset_minutes * interval '1 minute'))
    at time zone 'Europe/Stockholm';
end;
$$;

create or replace function public.calculate_player_raid_threat(
  input_user_id uuid,
  input_previous_threat integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  profile record;
  building_level_sum integer;
  training_bonus integer;
  progression_bonus integer;
begin
  select *
  into profile
  from public.player_profiles profiles
  where profiles.user_id = input_user_id;

  select coalesce(sum(buildings.level), 0)
  into building_level_sum
  from public.player_buildings buildings
  where
    buildings.user_id = input_user_id
    and buildings.state <> 'not_built';

  training_bonus := case coalesce(profile.selected_training_level, 'normal')
    when 'low' then 0
    when 'normal' then 0
    when 'high' then 1
    when 'very_high' then 1
    else 0
  end;
  progression_bonus :=
    floor(coalesce(profile.xp, 0) / 750.0)::integer
    + floor(coalesce(building_level_sum, 0) / 4.0)::integer;

  return least(
    10,
    greatest(1, coalesce(input_previous_threat, 1) + training_bonus + progression_bonus)
  );
end;
$$;

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
  next_threat integer;
  enemy record;
  next_enemy_count integer;
  next_damage integer;
begin
  select *
  into enemy
  from public.raid_enemy_definitions enemies
  where enemies.id = 'raiders';

  next_threat := public.calculate_player_raid_threat(input_user_id, input_threat_level);
  next_enemy_count :=
    enemy.base_enemy_count + next_threat + floor(random() * 3)::integer;
  next_damage :=
    enemy.base_damage
    + (enemy.damage_per_threat * next_threat)
    + (next_enemy_count * 2);

  insert into public.player_raids (
    user_id,
    status,
    threat_level,
    scheduled_at,
    enemy_type,
    enemy_count,
    total_damage,
    reward
  )
  values (
    input_user_id,
    'scheduled',
    next_threat,
    public.next_night_raid_time(input_after),
    enemy.id,
    next_enemy_count,
    next_damage,
    jsonb_build_object('xp', next_threat * enemy.reward_xp_per_threat)
  )
  returning id into new_raid_id;

  return new_raid_id;
end;
$$;

drop function if exists public.light_raid_signal();
drop function if exists public.get_player_raid_state();
drop function if exists public.resolve_player_raid(uuid);

create function public.resolve_player_raid(input_raid_id uuid)
returns table(
  id uuid,
  user_id uuid,
  status text,
  threat_level integer,
  scheduled_at timestamptz,
  started_at timestamptz,
  resolved_at timestamptz,
  damage_report jsonb,
  enemy_type text,
  enemy_count integer,
  total_damage integer,
  reward jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  raid record;
  campfire record;
  wall record;
  tent record;
  incoming_damage integer;
  remaining_damage integer;
  wall_damage integer := 0;
  tent_damage integer := 0;
  blocked_damage integer := 0;
  reward_xp integer := 0;
  next_wall_hp integer := 0;
  next_tent_hp integer := 0;
  outcome text;
  report jsonb;
  fire_modifier numeric := 1.0;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  perform public.initialize_player_base();
  perform public.complete_ready_constructions();
  perform public.complete_ready_repairs();

  select *
  into raid
  from public.player_raids raids
  where
    raids.id = input_raid_id
    and raids.user_id = current_user_id
  for update;

  if raid.id is null or raid.status not in ('scheduled', 'active') then
    raise exception 'RAID_NOT_ACTIVE' using errcode = '23514';
  end if;

  select *
  into campfire
  from public.player_campfires campfires
  where campfires.user_id = current_user_id;

  if campfire.burn_until is not null and campfire.burn_until >= raid.scheduled_at then
    fire_modifier := 0.75;
  end if;

  incoming_damage := ceiling(greatest(0, raid.total_damage) * fire_modifier)::integer;
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

  if remaining_damage > 0 then
    select *
    into tent
    from public.player_buildings buildings
    where
      buildings.user_id = current_user_id
      and buildings.building_id = 'tent'
    for update;

    if tent.building_id is not null and tent.current_hp > 0 then
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
  end if;

  blocked_damage := incoming_damage - tent_damage;
  outcome := case
    when tent_damage = 0 then 'held'
    when next_tent_hp = 0 then 'breached'
    else 'damaged'
  end;
  reward_xp := case
    when outcome = 'held' then coalesce((raid.reward ->> 'xp')::integer, 0)
    else floor(coalesce((raid.reward ->> 'xp')::integer, 0) / 2.0)::integer
  end;
  report := jsonb_build_object(
    'incomingDamage', incoming_damage,
    'blockedDamage', blocked_damage,
    'wallDamage', wall_damage,
    'tentDamage', tent_damage,
    'enemyCount', raid.enemy_count,
    'enemyType', raid.enemy_type,
    'fireProtected', fire_modifier < 1.0,
    'rewardXp', reward_xp,
    'outcome', outcome
  );

  if reward_xp > 0 then
    update public.player_profiles profiles
    set
      xp = profiles.xp + reward_xp,
      character_level = greatest(
        1,
        floor((profiles.xp + reward_xp) / 250.0)::integer + 1
      ),
      updated_at = now()
    where profiles.user_id = current_user_id;
  end if;

  update public.player_raids raids
  set
    status = 'resolved',
    started_at = coalesce(raids.started_at, raids.scheduled_at),
    resolved_at = coalesce(raids.scheduled_at, now()),
    damage_report = report,
    reward = jsonb_build_object('xp', reward_xp),
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
      coalesce(raid.scheduled_at, now()),
      case when outcome = 'held' then raid.threat_level + 1 else raid.threat_level end
    );
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
    raids.damage_report,
    raids.enemy_type,
    raids.enemy_count,
    raids.total_damage,
    raids.reward
  from public.player_raids raids
  where raids.id = input_raid_id;
end;
$$;

create function public.process_player_catchup()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  due_raid record;
  processed_count integer := 0;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  perform public.initialize_player_base();
  perform public.complete_ready_constructions();
  perform public.complete_ready_repairs();

  loop
    exit when processed_count >= 3;

    select *
    into due_raid
    from public.player_raids raids
    where
      raids.user_id = current_user_id
      and raids.status in ('scheduled', 'active')
      and (
        raids.status = 'active'
        or raids.scheduled_at <= now()
      )
    order by raids.scheduled_at asc
    limit 1;

    exit when due_raid.id is null;

    perform public.resolve_player_raid(due_raid.id);
    processed_count := processed_count + 1;
  end loop;

  if exists (
    select 1
    from public.player_raids raids
    where
      raids.user_id = current_user_id
      and raids.status in ('scheduled', 'active')
      and raids.scheduled_at <= now()
  ) then
    update public.player_raids raids
    set
      status = 'scheduled',
      scheduled_at = public.next_night_raid_time(now()),
      started_at = null,
      updated_at = now()
    where raids.id = (
      select old_due.id
      from public.player_raids old_due
      where
        old_due.user_id = current_user_id
        and old_due.status in ('scheduled', 'active')
        and old_due.scheduled_at <= now()
      order by old_due.scheduled_at asc
      limit 1
    );
  end if;

  if not exists (
    select 1
    from public.player_raids raids
    where
      raids.user_id = current_user_id
      and raids.status in ('scheduled', 'active')
  ) then
    perform public.schedule_next_player_raid(current_user_id, now(), 1);
  end if;
end;
$$;

create function public.get_player_raid_state()
returns table(
  id uuid,
  user_id uuid,
  status text,
  threat_level integer,
  scheduled_at timestamptz,
  started_at timestamptz,
  resolved_at timestamptz,
  damage_report jsonb,
  enemy_type text,
  enemy_count integer,
  total_damage integer,
  reward jsonb
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

  perform public.process_player_catchup();

  return query
  select
    raids.id,
    raids.user_id,
    raids.status,
    raids.threat_level,
    raids.scheduled_at,
    raids.started_at,
    raids.resolved_at,
    raids.damage_report,
    raids.enemy_type,
    raids.enemy_count,
    raids.total_damage,
    raids.reward
  from public.player_raids raids
  where
    raids.user_id = current_user_id
    and (
      raids.status = 'scheduled'
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
      when 'scheduled' then 0
      else 1
    end,
    raids.scheduled_at desc;
end;
$$;

grant select on table public.raid_enemy_definitions to authenticated;
grant execute on function public.next_night_raid_time(timestamptz) to authenticated;
grant execute on function public.calculate_player_raid_threat(uuid, integer) to authenticated;
grant execute on function public.process_player_catchup() to authenticated;
grant execute on function public.get_player_raid_state() to authenticated;
revoke execute on function public.resolve_player_raid(uuid) from public, authenticated;
