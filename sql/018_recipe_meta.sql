-- 018_recipe_meta.sql
-- Recipe-level metadata: which recipes are COMPONENTS (prep /
-- sub-recipes like sambar or coconut chutney) and what one batch
-- yields. Dishes are the default (no row needed); a component row
-- says "this recipe makes yield_qty yield_unit of a preparation
-- that other recipes consume by weight/volume".
--
-- Dish costing resolves a component ingredient through its batch
-- recipe (batch cost ÷ yield = cost per oz), and usage_variance
-- (sql/008) expands components into their raw ingredients.
--
-- Apply in the Supabase SQL editor. Idempotent. Run BEFORE
-- sql/008_recipe_usage_variance.sql (its function reads this table).

create table if not exists public.recipe_meta (
  id            uuid        primary key default gen_random_uuid(),
  restaurant_id uuid        not null references public.restaurants(id) on delete cascade,
  recipe_name   text        not null,  -- matches recipes_estimated.menu_item_name
  kind          text        not null default 'component'
                  check (kind in ('component')),
  yield_qty     numeric(12,4) not null,
  yield_unit    text        not null,  -- 'oz' | 'lb' | 'each' | 'floz' | 'g'
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (restaurant_id, recipe_name)
);

create index if not exists idx_recipe_meta_restaurant
  on public.recipe_meta (restaurant_id);

comment on table public.recipe_meta is
  'Component (sub-recipe) definitions: batch yield for preparations like sambar / coconut chutney that dish recipes consume by oz.';

-- ── RLS: same membership pattern as the other tenant tables ─────────
alter table public.recipe_meta enable row level security;

drop policy if exists "Members see their recipe meta"   on public.recipe_meta;
drop policy if exists "Members write their recipe meta" on public.recipe_meta;

create policy "Members see their recipe meta"
  on public.recipe_meta for select
  using (
    restaurant_id in (
      select restaurant_id from public.user_restaurants where user_id = auth.uid()
    )
  );

create policy "Members write their recipe meta"
  on public.recipe_meta for all
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

grant all on public.recipe_meta to service_role;
