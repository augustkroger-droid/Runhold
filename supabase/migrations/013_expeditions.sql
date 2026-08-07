create table if not exists public.player_expeditions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'completed',
  started_at timestamptz not null,
  ended_at timestamptz not null,
  distance_m integer not null,
  duration_seconds integer not null,
  xp_earned integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_expeditions_status_check check (
    status in ('completed', 'cancelled')
  ),
  constraint player_expeditions_distance_check check (distance_m >= 0),
  constraint player_expeditions_duration_check check (duration_seconds >= 0),
  constraint player_expeditions_xp_check check (xp_earned >= 0)
);

alter table public.player_expeditions enable row level security;

drop trigger if exists player_expeditions_set_updated_at on public.player_expeditions;

create trigger player_expeditions_set_updated_at
before update on public.player_expeditions
for each row
execute function public.set_updated_at();

drop policy if exists "Users can read own expeditions" on public.player_expeditions;

create policy "Users can read own expeditions"
on public.player_expeditions
for select
to authenticated
using (auth.uid() = user_id);

create or replace function public.complete_player_expedition(
  input_distance_m integer,
  input_duration_seconds integer
)
returns table(
  id uuid,
  user_id uuid,
  started_at timestamptz,
  ended_at timestamptz,
  distance_m integer,
  duration_seconds integer,
  xp_earned integer,
  total_xp integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  distance_value integer;
  duration_value integer;
  distance_xp integer;
  pace_seconds_per_km numeric;
  pace_bonus integer;
  earned_xp integer;
  next_total_xp integer;
  expedition_started_at timestamptz;
  expedition_ended_at timestamptz;
  new_expedition_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  if input_distance_m is null or input_distance_m < 0
    or input_duration_seconds is null or input_duration_seconds < 0 then
    raise exception 'INVALID_EXPEDITION_RESULT' using errcode = '23514';
  end if;

  distance_value := input_distance_m;
  duration_value := input_duration_seconds;
  distance_xp := floor(distance_value / 50.0)::integer;

  if distance_value < 100 then
    earned_xp := 0;
  elsif distance_value > 0 and duration_value > 0 then
    pace_seconds_per_km := duration_value / (distance_value / 1000.0);
    pace_bonus := case
      when pace_seconds_per_km between 240 and 540 then floor(distance_xp * 0.2)::integer
      else 0
    end;
    earned_xp := greatest(5, distance_xp + pace_bonus);
  else
    earned_xp := greatest(5, distance_xp);
  end if;

  expedition_ended_at := now();
  expedition_started_at := expedition_ended_at - (duration_value * interval '1 second');

  update public.player_profiles profiles
  set
    xp = profiles.xp + earned_xp,
    updated_at = now()
  where profiles.user_id = current_user_id
  returning profiles.xp into next_total_xp;

  insert into public.player_expeditions (
    user_id,
    status,
    started_at,
    ended_at,
    distance_m,
    duration_seconds,
    xp_earned
  )
  values (
    current_user_id,
    'completed',
    expedition_started_at,
    expedition_ended_at,
    distance_value,
    duration_value,
    earned_xp
  )
  returning player_expeditions.id into new_expedition_id;

  return query
  select
    new_expedition_id,
    current_user_id,
    expedition_started_at,
    expedition_ended_at,
    distance_value,
    duration_value,
    earned_xp,
    next_total_xp;
end;
$$;

grant select on table public.player_expeditions to authenticated;
grant execute on function public.complete_player_expedition(integer, integer) to authenticated;
