create extension if not exists pgcrypto;

create table if not exists public.missions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null,
  start_lat double precision not null,
  start_lng double precision not null,
  destination_lat double precision not null,
  destination_lng double precision not null,
  planned_distance_m integer,
  started_at timestamptz,
  destination_reached_at timestamptz,
  returned_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  destination_accuracy_m double precision,
  return_accuracy_m double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint missions_status_check check (
    status in (
      'outbound',
      'destination_reached',
      'returning',
      'completed',
      'cancelled'
    )
  )
);

alter table public.missions enable row level security;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists missions_set_updated_at on public.missions;

create trigger missions_set_updated_at
before update on public.missions
for each row
execute function public.set_updated_at();

drop policy if exists "Users can read own missions" on public.missions;
drop policy if exists "Users can create own missions" on public.missions;
drop policy if exists "Users can update own missions" on public.missions;

create policy "Users can read own missions"
on public.missions
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can create own missions"
on public.missions
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update own missions"
on public.missions
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
