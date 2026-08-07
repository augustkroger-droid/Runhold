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

grant execute on function public.adjust_player_resource(text, integer) to authenticated;
