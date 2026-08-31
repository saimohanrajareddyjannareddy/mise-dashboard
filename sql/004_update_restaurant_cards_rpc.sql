-- MISE update_my_restaurant_cards RPC
-- Owner-only writer for known_owner_cards on the restaurants row.
-- Mirrors update_my_restaurant_credentials (003): same auth / member / owner check.
-- Cards are 4-digit last-4 strings. Replaces the column wholesale. Safe to re-run.

create or replace function public.update_my_restaurant_cards(
  p_restaurant_id uuid,
  p_cards text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_clean text[];
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select role into v_role
    from public.user_restaurants
   where user_id = v_uid and restaurant_id = p_restaurant_id;

  if v_role is null then
    raise exception 'Not a member of this restaurant';
  end if;

  if v_role <> 'owner' then
    raise exception 'Only owners can update cards (your role: %)', v_role;
  end if;

    select coalesce(array_agg(distinct c), '{}')
    into v_clean
    from unnest(coalesce(p_cards, '{}')) as c
   where c ~ '^[0-9]{4}$';

  update public.restaurants
     set known_owner_cards = v_clean,
         updated_at        = now()
   where id = p_restaurant_id;
end;
$$;;

grant execute on function public.update_my_restaurant_cards(uuid, text[]) to authenticated;
