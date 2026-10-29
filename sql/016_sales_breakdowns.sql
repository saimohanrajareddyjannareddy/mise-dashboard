-- 016_sales_breakdowns.sql
-- Sales totals split by dimension (channel / payment type), one row
-- per restaurant per day per dimension value. Written by the in-app
-- Clover sync (app/api/clover-sync) from the same orders that feed
-- daily_sales; read by the food-cost page's Sales breakdown card.
--
-- Dimensions:
--   order_type — the order's Clover order type label ('Dine In',
--     'To Go', 'Delivery', …) or 'Unspecified' when the order
--     carries none.
--   tender — the tender the order's net was collected with ('Cash',
--     'Credit Card', …). An order's net is allocated across its
--     successful payments pro-rata by payment amount, so the tender
--     rows for a day sum to that day's net sales.
--
-- Net convention matches daily_sales: gross − discounts − refunds,
-- tax excluded (see computeDailySales in lib/clover.ts).
--
-- Apply in the Supabase SQL editor. Idempotent (re-runnable).

create table if not exists public.sales_breakdowns (
  id            uuid        primary key default gen_random_uuid(),
  restaurant_id uuid        not null references public.restaurants(id) on delete cascade,
  date          date        not null,
  dimension     text        not null,
  label         text        not null,
  net_cents     integer     not null default 0,
  order_count   integer     not null default 0,
  source        text        not null default 'clover',
  created_at    timestamptz not null default now(),
  unique (restaurant_id, date, dimension, label, source)
);

create index if not exists idx_sales_breakdowns_restaurant_date
  on public.sales_breakdowns (restaurant_id, date desc);

comment on table public.sales_breakdowns is
  'Daily POS sales split by dimension (order_type / tender), net = gross − discounts − refunds, tax excluded. Replaced per sync window by app/api/clover-sync.';

-- ── RLS: same membership pattern as daily_sales (sql/005) ────────────
alter table public.sales_breakdowns enable row level security;

drop policy if exists "Members see their sales breakdowns"   on public.sales_breakdowns;
drop policy if exists "Members write their sales breakdowns" on public.sales_breakdowns;

create policy "Members see their sales breakdowns"
  on public.sales_breakdowns for select
  using (
    restaurant_id in (
      select restaurant_id from public.user_restaurants where user_id = auth.uid()
    )
  );

create policy "Members write their sales breakdowns"
  on public.sales_breakdowns for all
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

grant all on public.sales_breakdowns to service_role;
