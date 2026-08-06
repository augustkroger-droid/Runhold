create or replace function public.normalize_username(input_username text)
returns text
language sql
immutable
as $$
  select regexp_replace(
    translate(lower(trim(coalesce(input_username, ''))), 'åäö', 'aao'),
    '[^a-z0-9._-]',
    '',
    'g'
  );
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_min_length check (char_length(username) >= 4),
  constraint profiles_username_format check (username ~ '^[a-z0-9._-]+$')
);

alter table public.profiles enable row level security;

insert into public.profiles (id, username, email)
select
  users.id,
  public.normalize_username(users.raw_user_meta_data->>'username'),
  lower(users.email)
from auth.users
where
  users.email is not null
  and char_length(public.normalize_username(users.raw_user_meta_data->>'username')) >= 4
on conflict do nothing;

drop trigger if exists profiles_set_updated_at on public.profiles;

create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_username text;
begin
  clean_username := public.normalize_username(new.raw_user_meta_data->>'username');

  if char_length(clean_username) < 4 then
    raise exception 'USERNAME_TOO_SHORT' using errcode = '23514';
  end if;

  insert into public.profiles (id, username, email)
  values (new.id, clean_username, lower(new.email));

  return new;
exception
  when unique_violation then
    raise exception 'USERNAME_TAKEN' using errcode = '23505';
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;

create trigger on_auth_user_created_profile
after insert on auth.users
for each row
execute function public.handle_new_user_profile();

create or replace function public.is_username_available(input_username text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select not exists (
    select 1
    from public.profiles
    where username = public.normalize_username(input_username)
  );
$$;

create or replace function public.resolve_login_email(input_username text)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select email
  from public.profiles
  where username = public.normalize_username(input_username)
  limit 1;
$$;

drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;

create policy "Users can read own profile"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

create policy "Users can update own profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

grant execute on function public.is_username_available(text) to anon, authenticated;
grant execute on function public.resolve_login_email(text) to anon, authenticated;
