-- 017_canonical_cleanup.sql
-- Clean the canonical ingredient catalog + backfill line resolution.
--
-- 1) Renames: the catalog was seeded from raw supplier text, so some
--    names carry brands and size words ('ardent flour',
--    'morton bulk salt', 'jumbo yellow onion'). Canonical names are
--    the ingredient itself — lowercase, full words, no brands.
--    Aliases and invoice_lines reference items by id, so renames
--    are safe; recipes_estimated references by NAME and is updated
--    in step 2. Each rename is skipped if the clean name already
--    exists as its own item (a merge is a separate, careful job).
--
-- 2) recipes_estimated follows the renames.
--
-- 3) Backfill: invoice lines saved before the app resolved
--    canonical ids get canonical_item_id from resolve_canonical_item
--    (007) so costing / variance / price history can see them.
--
-- Apply in the Supabase SQL editor. Idempotent (re-runnable).

-- ── 1) Catalog renames ──────────────────────────────────────────────
update public.canonical_items set name = 'flour'
 where name = 'ardent flour'
   and not exists (select 1 from public.canonical_items where name = 'flour');

update public.canonical_items set name = 'garlic'
 where name = 'asian garlic'
   and not exists (select 1 from public.canonical_items where name = 'garlic');

update public.canonical_items set name = 'yellow onion'
 where name = 'jumbo yellow onion'
   and not exists (select 1 from public.canonical_items where name = 'yellow onion');

update public.canonical_items set name = 'salt'
 where name = 'morton bulk salt'
   and not exists (select 1 from public.canonical_items where name = 'salt');

update public.canonical_items set name = 'sugar'
 where name = 'domino sugar'
   and not exists (select 1 from public.canonical_items where name = 'sugar');

update public.canonical_items set name = 'soybean oil'
 where name = 'soybean salad oil'
   and not exists (select 1 from public.canonical_items where name = 'soybean oil');

-- ── 2) Recipes follow the renames ───────────────────────────────────
update public.recipes_estimated set ingredient_name = 'flour'         where ingredient_name = 'ardent flour';
update public.recipes_estimated set ingredient_name = 'garlic'        where ingredient_name = 'asian garlic';
update public.recipes_estimated set ingredient_name = 'yellow onion'  where ingredient_name = 'jumbo yellow onion';
update public.recipes_estimated set ingredient_name = 'salt'          where ingredient_name = 'morton bulk salt';
update public.recipes_estimated set ingredient_name = 'sugar'         where ingredient_name = 'domino sugar';
update public.recipes_estimated set ingredient_name = 'soybean oil'   where ingredient_name = 'soybean salad oil';

-- ── 3) Backfill canonical ids on existing invoice lines ─────────────
update public.invoice_lines l
   set canonical_item_id = public.resolve_canonical_item(l.item_name, l.restaurant_id)
 where l.canonical_item_id is null;
