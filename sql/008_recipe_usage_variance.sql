-- 008_recipe_usage_variance.sql
-- Per-dish ingredient costing: theoretical-vs-actual usage reconciliation.
--
-- The pilot restaurant owner was right: nobody can weigh 3g of chili powder
-- per plate. But nobody has to. At month scale the math works without
-- per-plate measurement:
--
--   THEORETICAL = SUM over pos_sales (dishes_sold x recipes_estimated.quantity per dish)
--   ACTUAL      = SUM over invoice_lines (unit_qty x case_qty) for lines already
--                 resolved to a canonical item (007), inside the invoice period
--   VARIANCE    = (actual - theoretical) / theoretical
--
-- The variance is the cost-cutting engine. If chili powder purchases run 3x
-- what the recipes predict, nobody cares whether it was 2g or 6g per plate --
-- the answer is over-portioning or waste, and the owner sees it as one number.
-- Spices are ~2-5% of food cost, so per-plate precision never mattered;
-- the variance number is what drives decisions.
--
-- Unit handling: recipes_estimated.unit is one of 'oz'|'lb'|'each'|'floz'|'g'
-- (see 001); canonical_items.default_unit is 'LB'|'OZ'|'GAL'|'CT'|'EA' (see 007).
-- to_base_unit() normalizes both sides to g / ml / each before comparison.
--
-- Seeding: when a dish has no history, seed recipes_estimated with
-- AI-standard estimates (e.g. chicken biryani ~200g rice, ~250g chicken,
-- 2-4g chili powder per serving, confidence='ai_inferred'). The owner adjusts
-- once if their recipe runs heavier; calibrations self-correct monthly.
--
-- Known limitation (documented, not hidden): this compares PURCHASES vs
-- theoretical usage. True consumption also needs opening/closing stock counts;
-- a stock_counts table is the planned follow-up so the full
-- (opening + purchases - closing) math works.
--
-- Depends on: 001 (recipes_estimated, pos_sales, invoice_lines,
-- invoice_headers), 007 (canonical_items, ingredient_aliases).
-- Apply in the Supabase SQL editor. Idempotent (re-runnable).

-- ── unit_conversions: purchased/packed units -> comparable base ──
create table if not exists public.unit_conversions (
  id            uuid        primary key default gen_random_uuid(),
  from_unit     text        not null,   -- as stored: 'oz','lb','LB','GAL','each',...
  to_base       numeric(14,6) not null, -- multiply qty by this
  base_unit     text        not null,   -- 'g' | 'ml' | 'each'
  restaurant_id uuid        references public.restaurants(id) on delete cascade
                                        -- NULL = global default; set = restaurant override
);

-- One factor per unit per scope (global scope = zero uuid).
create unique index if not exists uq_unit_conversions_scope
  on public.unit_conversions (
    from_unit,
    coalesce(restaurant_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- Seed the kitchen-standard conversions (global rows).
insert into public.unit_conversions (from_unit, to_base, base_unit) values
  ('g',    1,        'g'),
  ('kg',   1000,     'g'),
  ('oz',   28.3495,  'g'),
  ('lb',   453.592,  'g'),
  ('LB',   453.592,  'g'),
  ('OZ',   28.3495,  'g'),
  ('ml',   1,        'ml'),
  ('floz', 29.5735,  'ml'),
  ('GAL',  3785.41,  'ml'),
  ('gal',  3785.41,  'ml'),
  ('each', 1,        'each'),
  ('EA',   1,        'each'),
  ('CT',   1,        'each'),
  ('ct',   1,        'each')
on conflict do nothing;

comment on table public.unit_conversions is
  'Unit -> base-unit factors. NULL restaurant_id = global; set = restaurant override. to_base_unit() uses these.';

-- ── to_base_unit: normalize any qty to g / ml / each ─────────────
-- Restaurant-scoped row wins over global, mirroring resolve_canonical_item().
-- Unknown unit passes through unchanged (better than silently zeroing).
create or replace function public.to_base_unit(p_qty numeric, p_unit text, p_restaurant_id uuid)
returns numeric
language sql
stable
as $$
  select p_qty * coalesce(
    (select c.to_base
     from public.unit_conversions c
     where c.from_unit = p_unit
       and (c.restaurant_id = p_restaurant_id or c.restaurant_id is null)
     order by (c.restaurant_id is null)   -- false (scoped) sorts before true (global)
     limit 1),
    1)
$$;

comment on function public.to_base_unit(numeric, text, uuid) is
  'Normalizes a quantity into grams / ml / each using unit_conversions. Unknown units pass through.';

-- ── usage_variance: the reconciliation engine ────────────────────
-- One row per canonical ingredient: what the month''s sales said you should
-- have used (theoretical) vs what invoices say you bought (actual).
-- Rows are ordered by |variance| so the biggest leaks surface first.
--
-- Join notes:
--  * pos_sales.item_name -> recipes_estimated.menu_item_name is an exact
--    match today; if POS names drift, normalize here (same aliasing idea as
--    ingredient_aliases in 007).
--  * actual uses canonical_item_id only: unresolved lines (NULL) are
--    invisible here by design -- review the unreviewed queue first or the
--    variance is under-counted.
--  * zero-theoretical rows (ingredient bought but in no recipe) return
--    variance_pct NULL and sort last; they still show as pure purchases.
create or replace function public.usage_variance(
  p_restaurant_id uuid,
  p_start date,
  p_end date
)
returns table (
  ingredient        text,
  theoretical_base  numeric,
  actual_base       numeric,
  variance_pct      numeric,
  notes             text
)
language sql
stable
as $$
  with theoretical as (
    select r.ingredient_name as ingredient,
           sum(s.quantity * to_base_unit(r.quantity, r.unit, s.restaurant_id)) as qty
    from public.pos_sales s
    join public.recipes_estimated r
      on  r.restaurant_id  = s.restaurant_id
      and r.menu_item_name = s.item_name
    where s.restaurant_id = p_restaurant_id
      and s.sale_date between p_start and p_end
    group by r.ingredient_name
  ),
  actual as (
    select ci.name as ingredient,
           sum(to_base_unit(
             l.unit_qty * coalesce(l.case_qty, 1),
             coalesce(ci.default_unit, 'EA'),
             l.restaurant_id
           )) as qty
    from public.invoice_lines l
    join public.canonical_items ci on ci.id = l.canonical_item_id
    join public.invoice_headers h  on h.id  = l.header_id
    where l.restaurant_id = p_restaurant_id
      and h.invoice_date between p_start and p_end
    group by ci.name
  )
  select
    coalesce(t.ingredient, a.ingredient) as ingredient,
    round(coalesce(t.qty, 0), 1)         as theoretical_base,
    round(coalesce(a.qty, 0), 1)         as actual_base,
    case
      when coalesce(t.qty, 0) = 0 then null
      else round((coalesce(a.qty, 0) - t.qty) / t.qty * 100, 1)
    end                                  as variance_pct,
    case
      when t.qty is null then 'purchased but in no recipe yet'
      when a.qty is null then 'in recipes, nothing purchased in period'
      else null
    end                                  as notes
  from theoretical t
  full outer join actual a on a.ingredient = t.ingredient
  order by abs(coalesce(
    case when coalesce(t.qty, 0) = 0 then null
         else (coalesce(a.qty, 0) - t.qty) / t.qty end, 0)) desc
$$;

comment on function public.usage_variance(uuid, date, date) is
  'Per-dish costing reconciliation: theoretical usage (sales x recipes_estimated) vs actual purchases (invoice_lines via canonical_items), ordered by |variance| so the biggest leaks surface first. Base units are g/ml/each.';

-- ── RLS: same membership pattern as every other tenant table ──────
-- unit_conversions: global rows readable by all authed; restaurant rows by members.
alter table public.unit_conversions enable row level security;

drop policy if exists "See global + own unit conversions" on public.unit_conversions;
create policy "See global + own unit conversions"
  on public.unit_conversions for select
  using (
    restaurant_id is null
    or restaurant_id in (
      select restaurant_id from public.user_restaurants where user_id = auth.uid()
    )
  );

drop policy if exists "Members write their unit conversions" on public.unit_conversions;
create policy "Members write their unit conversions"
  on public.unit_conversions for all
  using (
    restaurant_id in (
      select restaurant_id from public.user_restaurants where user_id = auth.uid()
    )
  )
  with check (
    restaurant_id in (
      select restaurant_id from public.user_restaurants where user_id = auth.uid()
    )
  );

grant all on public.unit_conversions to service_role;

-- usage_variance() runs with caller''s rights, so it only ever reads
-- invoices/sales/recipes the caller''s restaurant membership permits.
