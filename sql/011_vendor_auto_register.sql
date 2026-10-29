-- ============================================================
-- 011_vendor_auto_register.sql
-- Vendor auto-creation from a restaurant's first invoice.
--
-- Until now, adding a supplier meant a developer running SQL: the
-- vendors catalog is service-role-write only. This RPC lets the app
-- register a supplier at invoice-save time instead:
--
--   1. Match the extracted supplier name against vendor_aliases
--      (global or this restaurant's) and vendors.display_name.
--   2. If matched, just link the restaurant to that vendor.
--   3. If genuinely new, create a restaurant-scoped custom vendor
--      (is_global = false; canonical key suffixed with the
--      restaurant id so the global UNIQUE(name) can't collide),
--      remember the invoice's spelling as a restaurant alias, and
--      link it.
--
-- SECURITY DEFINER, following the same pattern as
-- create_my_restaurant / update_my_restaurant_credentials: checks
-- the caller is a member of the restaurant before writing anything.
--
-- Run in the Supabase SQL editor. Until this runs, the app degrades
-- gracefully: uploads save with the extracted vendor text and no
-- catalog link, exactly as before.
-- ============================================================

create or replace function public.register_invoice_vendor(
  p_restaurant_id uuid,
  p_display_name  text,
  p_alias_text    text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display text := regexp_replace(btrim(coalesce(p_display_name, '')), '\s+', ' ', 'g');
  v_alias   text := regexp_replace(btrim(coalesce(p_alias_text, p_display_name, '')), '\s+', ' ', 'g');
  v_vendor  uuid;
  v_slug    text;
  v_key     text;
begin
  if v_display = '' then
    return null;
  end if;

  -- Caller must belong to the restaurant.
  if not exists (
    select 1 from public.user_restaurants ur
    where ur.restaurant_id = p_restaurant_id
      and ur.user_id = auth.uid()
  ) then
    raise exception 'not a member of this restaurant';
  end if;

  -- 1. Alias match (restaurant-scoped wins over global by ordering).
  select a.vendor_id into v_vendor
  from public.vendor_aliases a
  where a.alias_text is not null
    and lower(a.alias_text) = lower(v_alias)
    and (a.restaurant_id = p_restaurant_id or a.restaurant_id is null)
  order by (a.restaurant_id is null)
  limit 1;

  -- 2. Display-name match against the catalog.
  if v_vendor is null then
    select v.id into v_vendor
    from public.vendors v
    where lower(v.display_name) = lower(v_display)
    limit 1;
  end if;

  -- 3. Genuinely new: create a restaurant-scoped custom vendor.
  if v_vendor is null then
    v_slug := trim(both '_' from regexp_replace(lower(v_display), '[^a-z0-9]+', '_', 'g'));
    if v_slug = '' then v_slug := 'vendor'; end if;
    v_key := v_slug || '_r' || left(replace(p_restaurant_id::text, '-', ''), 8);

    insert into public.vendors (name, display_name, ingestion_method, is_global, notes)
    values (v_key, v_display, 'upload', false, 'Auto-created from first invoice upload')
    on conflict (name) do nothing
    returning id into v_vendor;

    if v_vendor is null then
      select id into v_vendor from public.vendors where name = v_key;
    end if;
  end if;

  -- Link the restaurant to the vendor (idempotent).
  insert into public.restaurant_vendors (restaurant_id, vendor_id)
  values (p_restaurant_id, v_vendor)
  on conflict (restaurant_id, vendor_id) do nothing;

  -- Remember this invoice's spelling for this restaurant, so the
  -- next variant of the same name resolves without a new vendor.
  if v_alias <> '' and not exists (
    select 1 from public.vendor_aliases a
    where a.vendor_id = v_vendor
      and a.restaurant_id = p_restaurant_id
      and lower(a.alias_text) = lower(v_alias)
  ) then
    insert into public.vendor_aliases (vendor_id, alias_text, restaurant_id, confidence)
    values (v_vendor, v_alias, p_restaurant_id, 'data_inferred');
  end if;

  return v_vendor;
end;
$$;

grant execute on function public.register_invoice_vendor(uuid, text, text) to authenticated;
