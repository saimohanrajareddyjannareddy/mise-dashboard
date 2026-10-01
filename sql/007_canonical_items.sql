-- 007_canonical_items.sql
-- Canonical ingredient catalog + alias map (the "one format for every supplier").
--
-- Problem: every supplier prints line items differently ("CHKN THIGH 40LB",
-- "Rack L-A-M 20LB", handwritten photo notes...). The dashboard should show
-- one canonical form ("chicken thigh", "rack of lamb") no matter the source.
--
-- Design:
--   canonical_items    global catalog: one row per ingredient ("chicken thigh").
--                      Shared across restaurants (like vendors). Never deleted,
--                      only added — the dictionary gets smarter for everyone.
--   ingredient_aliases raw supplier text -> canonical item. restaurant_id NULL
--                      = global alias; set = that restaurant's override
--                      ("dark meat" -> their "chicken thigh").
--   invoice_lines.canonical_item_id links an extracted line to the catalog.
--
-- Flow for the extraction worker (Postmark/upload/scraper):
--   1. extract raw line text as today (item_name keeps the ORIGINAL text —
--      never destroy it; it's the audit trail)
--   2. select resolve_canonical_item(raw_text, restaurant_id)
--   3. hit  -> set invoice_lines.canonical_item_id (+ display_name)
--      miss -> leave null + queue the raw text for human review; a reviewer
--              confirms the canonical item once and every future invoice with
--              the same raw text resolves automatically.
--
-- This is the same dictionary the recipe table (recipes_estimated) needs:
-- recipe ingredients reference canonical_items.name, invoice lines resolve to
-- canonical_items.id, and theoretical-vs-actual usage becomes computable.
--
-- Apply in the Supabase SQL editor AFTER 005/006. Idempotent (re-runnable).

-- ── canonical_items ──────────────────────────────────────────────
create table if not exists public.canonical_items (
  id            uuid        primary key default gen_random_uuid(),
  name          text        not null,   -- canonical form: 'chicken thigh' (lowercase, full words, no abbreviations)
  category      text,                   -- same taxonomy as invoice_lines.category ('Proteins','Produce',...)
  default_unit  text,                   -- 'LB'|'OZ'|'GAL'|'CT'|'EA' — most common purchase unit
  created_at    timestamptz not null default now(),
  unique (name)
);

comment on table public.canonical_items is
  'Global canonical ingredient catalog. One row per ingredient; shared across restaurants. invoice_lines.canonical_item_id points here.';

-- ── ingredient_aliases ───────────────────────────────────────────
create table if not exists public.ingredient_aliases (
  id                uuid        primary key default gen_random_uuid(),
  raw_text          text        not null,   -- as printed on the invoice: 'CHKN THIGH 40LB'
  raw_normalized    text        not null
                      generated always as (
                        lower(regexp_replace(trim(raw_text), '\s+', ' ', 'g'))
                      ) stored,              -- 'chkn thigh 40lb' — matching key, auto-maintained
  canonical_item_id uuid        not null references public.canonical_items(id) on delete cascade,
  restaurant_id     uuid        references public.restaurants(id) on delete cascade,
                                            -- NULL = global alias; set = this restaurant's override
  confidence        text        not null default 'ai_suggested'
                      check (confidence in ('ai_suggested','user_confirmed','seed')),
  created_at        timestamptz not null default now()
);

-- One alias per normalized raw text per scope (global scope = zero uuid).
create unique index if not exists uq_ingredient_aliases_scope
  on public.ingredient_aliases (
    raw_normalized,
    coalesce(restaurant_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
create index if not exists idx_ingredient_aliases_item
  on public.ingredient_aliases (canonical_item_id);
create index if not exists idx_ingredient_aliases_restaurant
  on public.ingredient_aliases (restaurant_id);

comment on table public.ingredient_aliases is
  'Raw supplier text -> canonical item. NULL restaurant_id = global; set = per-restaurant override. First AI/user confirmation caches forever.';

-- ── link invoice_lines to the catalog ────────────────────────────
alter table public.invoice_lines
  add column if not exists canonical_item_id uuid
    references public.canonical_items(id) on delete set null;

create index if not exists idx_invoice_lines_canonical
  on public.invoice_lines (canonical_item_id);

comment on column public.invoice_lines.canonical_item_id is
  'Resolved canonical ingredient (via resolve_canonical_item). NULL = not yet reviewed; item_name always keeps the original supplier text.';

-- ── resolver: restaurant-scoped alias wins, else global ───────────
create or replace function public.resolve_canonical_item(p_raw text, p_restaurant_id uuid)
returns uuid
language sql
stable
as $$
  select a.canonical_item_id
  from public.ingredient_aliases a
  where a.raw_normalized = lower(regexp_replace(trim(p_raw), '\s+', ' ', 'g'))
    and (a.restaurant_id = p_restaurant_id or a.restaurant_id is null)
  order by (a.restaurant_id is null)   -- false (scoped) sorts before true (global)
  limit 1
$$;

comment on function public.resolve_canonical_item(text, uuid) is
  'Returns the canonical_items.id for a raw invoice line, preferring the restaurant''s own alias over the global one. NULL when unreviewed.';

-- ── RLS ──────────────────────────────────────────────────────────
-- canonical_items: global catalog — any authed user reads; writes via service_role.
alter table public.canonical_items enable row level security;

drop policy if exists "Authed users see canonical items" on public.canonical_items;
create policy "Authed users see canonical items"
  on public.canonical_items for select
  using (auth.role() = 'authenticated');

grant select on public.canonical_items to authenticated;
grant all    on public.canonical_items to service_role;

-- ingredient_aliases: global rows readable by all authed; restaurant rows by members.
-- Members may add/confirm aliases for their own restaurant.
alter table public.ingredient_aliases enable row level security;

drop policy if exists "See global + own ingredient aliases" on public.ingredient_aliases;
create policy "See global + own ingredient aliases"
  on public.ingredient_aliases for select
  using (
    restaurant_id is null
    or restaurant_id in (
      select restaurant_id from public.user_restaurants where user_id = auth.uid()
    )
  );

drop policy if exists "Members write their ingredient aliases" on public.ingredient_aliases;
create policy "Members write their ingredient aliases"
  on public.ingredient_aliases for all
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

grant all on public.ingredient_aliases to service_role;
