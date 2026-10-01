-- 005_daily_sales.sql
-- Daily-aggregated POS sales (one row per restaurant per day). Written by the
-- Clover sync script (scripts/sync-clover-sales.ts); read by the dashboard's
-- food-cost-% KPI (invoice spend ÷ net sales, trailing 30 days).
--
-- Net-sales convention: net_cents = gross_cents − discount_cents − refund_cents,
-- tax excluded. See computeDailySales() in lib/clover.ts for the full rationale.
-- One row per day is deliberate: the KPI only needs daily net sales, while
-- order line items already live in pos_sales for drill-down.
--
-- Apply in the Supabase SQL editor. Idempotent (re-runnable).

create table if not exists public.daily_sales (
  id            uuid        primary key default gen_random_uuid(),
  restaurant_id uuid        not null references public.restaurants(id) on delete cascade,
  date          date        not null,
  gross_cents   integer     not null default 0,
  discount_cents integer    not null default 0,
  refund_cents  integer     not null default 0,
  net_cents     integer     not null default 0,
  order_count   integer     not null default 0,
  source        text        not null default 'clover',
  created_at    timestamptz not null default now(),
  unique (restaurant_id, date)
);

create index if not exists idx_daily_sales_restaurant_date
  on public.daily_sales (restaurant_id, date desc);

comment on table public.daily_sales is
  'Daily POS sales aggregates (net = gross − discounts − refunds, tax excluded). Upserted by scripts/sync-clover-sales.ts on (restaurant_id, date).';

-- ── RLS: same membership pattern as every other tenant table ──────────────
alter table public.daily_sales enable row level security;

drop policy if exists "Members see their daily sales"   on public.daily_sales;
drop policy if exists "Members write their daily sales" on public.daily_sales;

create policy "Members see their daily sales"
  on public.daily_sales for select
  using (
    restaurant_id in (
      select restaurant_id from public.user_restaurants where user_id = auth.uid()
    )
  );

create policy "Members write their daily sales"
  on public.daily_sales for all
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

grant all on public.daily_sales to service_role;
