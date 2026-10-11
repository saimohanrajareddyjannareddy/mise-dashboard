-- 008_seed_rd_aliases.sql
-- Seed canonical items + global aliases for Restaurant Depot's standard
-- abbreviations, taken from a real Turmeric invoice (#23940, 2026-06-22).
-- RD codes are the same for every RD customer, so these are global
-- (restaurant_id NULL). Any restaurant can still override per location.
--
-- After the aliases exist, the backfill at the bottom links existing
-- invoice_lines rows and fills display_name where it was never cleaned.
--
-- Apply in the Supabase SQL editor AFTER 007. Idempotent (re-runnable).

-- ── 1. canonical items ───────────────────────────────────────────
with items(name, category, default_unit) as (
  values
    ('halal chicken thigh meat',        'Proteins',  'LB'),
    ('halal boneless chicken breast',   'Proteins',  'LB'),
    ('shrimp 16/20 raw peeled',         'Proteins',  'LB'),
    ('tempura batter mix',              'Dry Goods', 'LB'),
    ('low-fat traditional paneer',      'Dairy',     'LB'),
    ('heavy cream 40%',                 'Dairy',     'CT'),
    ('whole milk',                      'Dairy',     'GAL'),
    ('sour cream',                      'Dairy',     'LB'),
    ('whipped topping',                 'Dairy',     'OZ'),
    ('milk crate deposit return',       'Credits',   'EA'),
    ('asian garlic',                    'Produce',   'CT'),
    ('cilantro',                        'Produce',   'CT'),
    ('jumbo yellow onion',              'Produce',   'LB'),
    ('red onion',                       'Produce',   'LB'),
    ('green bell pepper',               'Produce',   'LB'),
    ('red bell pepper',                 'Produce',   'LB'),
    ('serrano pepper',                  'Produce',   'LB'),
    ('mango',                           'Produce',   'CT'),
    ('frozen cut green beans',          'Produce',   'LB'),
    ('broccoli crown',                  'Produce',   'CT'),
    ('soybean salad oil',               'Dry Goods', 'LB'),
    ('clear frying oil',                'Dry Goods', 'LB'),
    ('cornstarch',                      'Dry Goods', 'OZ'),
    ('domino sugar',                    'Dry Goods', 'LB'),
    ('tomato puree',                    'Dry Goods', 'CT'),
    ('garbanzo beans',                  'Dry Goods', 'CT'),
    ('ketchup',                         'Dry Goods', 'OZ'),
    ('frozen basil pesto',              'Dry Goods', 'OZ'),
    ('morton bulk salt',                'Dry Goods', 'LB'),
    ('ardent flour',                    'Dry Goods', 'LB'),
    ('texas toast bread',               'Dry Goods', 'OZ'),
    ('coca-cola bag-in-box',            'Beverages', 'GAL'),
    ('diet coke bag-in-box',            'Beverages', 'GAL'),
    ('pure life water 40-pack',         'Beverages', 'CT'),
    ('heavy-duty foil roll 18x500',     'Packaging', 'EA'),
    ('basket liner',                    'Packaging', 'CT'),
    ('hinged flat container 12oz',      'Packaging', 'CT'),
    ('black nitrile gloves large',      'Cleaning',  'CT')
)
insert into public.canonical_items (name, category, default_unit)
select name, category, default_unit from items
on conflict (name) do nothing;

-- ── 2. raw RD text -> canonical item ─────────────────────────────
with aliases(raw_text, name) as (
  values
    ('CHIX HAL THGH MEAT',        'halal chicken thigh meat'),
    ('CHIX HAL BNLS BRST',        'halal boneless chicken breast'),
    ('SHR 16/20 R-PDTFF 2LB',     'shrimp 16/20 raw peeled'),
    ('BATTER TEMPURA KIK 5LB',    'tempura batter mix'),
    ('CHS PANEER LF TRAD 5LB',    'low-fat traditional paneer'),
    ('CREAM 40% PFR',             'heavy cream 40%'),
    ('MILK HOMO GAL',             'whole milk'),
    ('SOUR CREAM JF 5LB',         'sour cream'),
    ('AERO WHIP CLASSIC 15Z',     'whipped topping'),
    ('MLK CRTEDPST RETURN',       'milk crate deposit return'),
    ('PROD GARLC ASN 4/5',        'asian garlic'),
    ('PROD CILANTRO 4/24CT',      'cilantro'),
    ('PROD ONION YLW JMB 50 LB',  'jumbo yellow onion'),
    ('PROD ONION RED 25LBS',      'red onion'),
    ('PROD PEPP GRN BAG 5 LB',    'green bell pepper'),
    ('PROD PEPP RED BAG 5 LB',    'red bell pepper'),
    ('PROD PEPPER SERRAN 5LBS',   'serrano pepper'),
    ('PROD MANGO CASE',           'mango'),
    ('FZ CUT GREEN BEANS 2LB',    'frozen cut green beans'),
    ('BROCCOLI CROWN 4/1',        'broccoli crown'),
    ('OIL SOY SALAD CQ 35LB',     'soybean salad oil'),
    ('OIL CLEAR FRY CQ 35LB',     'clear frying oil'),
    ('STARCH CORN ARGO 16Z',      'cornstarch'),
    ('SUGAR DOMINO 50LB',         'domino sugar'),
    ('PUREE TOMATO CQ #10',       'tomato puree'),
    ('BEAN GARBANZO CQ #10',      'garbanzo beans'),
    ('KETCHUP CQ JUG 114Z',       'ketchup'),
    ('FZ PESTO BASIL 30Z',        'frozen basil pesto'),
    ('SALT BULK MORTON 25LB',     'morton bulk salt'),
    ('FLOUR H&R ARDENT 25LB',     'ardent flour'),
    ('BRD TX TOAST 24Z',          'texas toast bread'),
    ('BIB COKE CLASSIC 2.5GAL',   'coca-cola bag-in-box'),
    ('BIB DIET COKE 2.5GAL',      'diet coke bag-in-box'),
    ('PURE LIFE 40PK 0.5L',       'pure life water 40-pack'),
    ('FOIL ROLL 18X500HD ROLL',   'heavy-duty foil roll 18x500'),
    ('LINER BK SKY3858XX 50CT',   'basket liner'),
    ('CONT HNG FLAT 12Z 100CT',   'hinged flat container 12oz'),
    ('*GLOVE NITRL BLK L',        'black nitrile gloves large')
)
insert into public.ingredient_aliases (raw_text, canonical_item_id, confidence)
select a.raw_text, c.id, 'seed'
from aliases a
join public.canonical_items c on c.name = a.name
on conflict do nothing;

-- ── 3. backfill existing lines ───────────────────────────────────
-- Link every unlinked line through the resolver ...
update public.invoice_lines l
set canonical_item_id = public.resolve_canonical_item(l.item_name, l.restaurant_id)
where l.canonical_item_id is null;

-- ... and fill display_name with the clean canonical name, but ONLY where
-- it was never cleaned before (never overwrite a human edit).
update public.invoice_lines l
set display_name = c.name
from public.canonical_items c
where l.canonical_item_id = c.id
  and (l.display_name is null or l.display_name = l.item_name);
