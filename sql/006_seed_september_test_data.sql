-- 006_seed_september_test_data.sql
-- September 2026 test data for the Turmeric test restaurant.
-- Restaurant: 9f798177-5118-428e-b6a2-55eb02f89eaa
--
-- Contents: 30 daily_sales rows (simulated Turmeric-menu sales,
--   net $78199.06) + 6 invoices / 105 lines
--   (Turmeric-style purchases, spend $26227.87).
-- Implied food cost %: 33.5%
--
-- HOW TO RUN: Supabase dashboard -> SQL editor -> paste this file -> Run.
-- Run AFTER sql/005_daily_sales.sql. Idempotent (re-runnable).

begin;

-- 1. Simulated September sales (Turmeric menu, seed 42) --
insert into public.daily_sales
  (restaurant_id, date, gross_cents, discount_cents, refund_cents, net_cents, order_count, source)
values
  ('9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-01', 213600, 1840, 1099, 210661, 63, 'simulation'),
  ('9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-02', 190300, 600, 0, 189700, 62, 'simulation'),
  ('9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-03', 204050, 1045, 0, 203005, 64, 'simulation'),
  ('9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-04', 337200, 1520, 0, 335680, 87, 'simulation'),
  ('9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-05', 333700, 3530, 0, 330170, 90, 'simulation'),
  ('9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-06', 403700, 1640, 0, 402060, 112, 'simulation'),
  ('9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-07', 194700, 1560, 0, 193140, 59, 'simulation'),
  ('9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-08', 209850, 200, 0, 209650, 59, 'simulation'),
  ('9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-09', 204250, 1650, 0, 202600, 54, 'simulation'),
  ('9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-10', 214000, 2700, 0, 211300, 60, 'simulation'),
  ('9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-11', 372500, 5310, 0, 367190, 108, 'simulation'),
  ('9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-12', 307750, 3640, 0, 304110, 96, 'simulation'),
  ('9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-13', 371500, 2025, 0, 369475, 110, 'simulation'),
  ('9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-14', 215000, 985, 0, 214015, 56, 'simulation'),
  ('9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-15', 209650, 2290, 0, 207360, 55, 'simulation'),
  ('9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-16', 187800, 2780, 0, 185020, 49, 'simulation'),
  ('9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-17', 243100, 1815, 0, 241285, 69, 'simulation'),
  ('9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-18', 343450, 1040, 0, 342410, 101, 'simulation'),
  ('9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-19', 313750, 1380, 2016, 310354, 84, 'simulation'),
  ('9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-20', 320450, 3165, 1969, 315316, 87, 'simulation'),
  ('9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-21', 200450, 865, 0, 199585, 61, 'simulation'),
  ('9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-22', 252650, 1900, 0, 250750, 78, 'simulation'),
  ('9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-23', 258200, 2140, 0, 256060, 74, 'simulation'),
  ('9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-24', 163550, 305, 0, 163245, 43, 'simulation'),
  ('9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-25', 318850, 1645, 0, 317205, 92, 'simulation'),
  ('9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-26', 309350, 3320, 0, 306030, 83, 'simulation'),
  ('9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-27', 355950, 4805, 0, 351145, 108, 'simulation'),
  ('9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-28', 195800, 895, 0, 194905, 58, 'simulation'),
  ('9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-29', 236100, 790, 0, 235310, 67, 'simulation'),
  ('9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-30', 203400, 2230, 0, 201170, 57, 'simulation')
on conflict (restaurant_id, date) do update set
  gross_cents    = excluded.gross_cents,
  discount_cents = excluded.discount_cents,
  refund_cents   = excluded.refund_cents,
  net_cents      = excluded.net_cents,
  order_count    = excluded.order_count,
  source         = excluded.source;

-- 2. Fake September invoices (Turmeric-style purchases, seed 7) --
-- Remove any previously seeded invoices first.
delete from public.invoice_lines
where header_id in (
  select h.id from public.invoice_headers h
  join public.invoice_files f on f.id = h.file_id
  where f.restaurant_id = '9f798177-5118-428e-b6a2-55eb02f89eaa' and f.drive_file_id like 'seed-turmeric-%'
);
delete from public.invoice_headers
where file_id in (
  select id from public.invoice_files
  where restaurant_id = '9f798177-5118-428e-b6a2-55eb02f89eaa' and drive_file_id like 'seed-turmeric-%'
);
delete from public.invoice_files
where restaurant_id = '9f798177-5118-428e-b6a2-55eb02f89eaa' and drive_file_id like 'seed-turmeric-%';

-- invoice_files --
insert into public.invoice_files
  (id, restaurant_id, drive_file_id, filename, file_date, file_total, status, source, processed_at)
values
  ('ca34183f-96b9-4a0a-9cae-ceed3e78f089', '9f798177-5118-428e-b6a2-55eb02f89eaa', 'seed-turmeric-sep26-1', 'RD-SEP26-001.pdf', '2026-09-03', 5566.80, 'done', 'upload', now()),
  ('234debb3-bc5e-42a5-8a29-776ee426d18b', '9f798177-5118-428e-b6a2-55eb02f89eaa', 'seed-turmeric-sep26-2', 'AB-0926-001.pdf', '2026-09-08', 2309.49, 'done', 'upload', now()),
  ('343470e4-3941-40c0-b895-a7de82149fea', '9f798177-5118-428e-b6a2-55eb02f89eaa', 'seed-turmeric-sep26-3', 'RD-SEP26-002.pdf', '2026-09-10', 6061.73, 'done', 'upload', now()),
  ('6765d0d1-a82a-4238-a86c-3cbedf80adac', '9f798177-5118-428e-b6a2-55eb02f89eaa', 'seed-turmeric-sep26-4', 'RD-SEP26-003.pdf', '2026-09-17', 6186.23, 'done', 'upload', now()),
  ('a1e9b9d7-d97c-46f6-9641-661e3cffb82b', '9f798177-5118-428e-b6a2-55eb02f89eaa', 'seed-turmeric-sep26-5', 'AB-0926-002.pdf', '2026-09-22', 2244.55, 'done', 'upload', now()),
  ('da8c3095-b24c-4555-bfd2-a200fd5e8476', '9f798177-5118-428e-b6a2-55eb02f89eaa', 'seed-turmeric-sep26-6', 'RD-SEP26-004.pdf', '2026-09-24', 3859.07, 'done', 'upload', now());

-- invoice_headers --
insert into public.invoice_headers
  (id, restaurant_id, file_id, vendor, invoice_number, invoice_date, subtotal, tax, total)
values
  ('b3391d67-4642-4bf6-b15d-1507561b0025', '9f798177-5118-428e-b6a2-55eb02f89eaa', 'ca34183f-96b9-4a0a-9cae-ceed3e78f089', 'Restaurant Depot', 'RD-SEP26-001', '2026-09-03', 5566.80, 0, 5566.80),
  ('abb62512-7100-4afa-bdd6-569667a3b04f', '9f798177-5118-428e-b6a2-55eb02f89eaa', '234debb3-bc5e-42a5-8a29-776ee426d18b', 'Apna Bazaar Wholesale', 'AB-0926-001', '2026-09-08', 2309.49, 0, 2309.49),
  ('4e781b94-9712-45d8-8513-d6f4797419e2', '9f798177-5118-428e-b6a2-55eb02f89eaa', '343470e4-3941-40c0-b895-a7de82149fea', 'Restaurant Depot', 'RD-SEP26-002', '2026-09-10', 6061.73, 0, 6061.73),
  ('9a3505e4-11f0-44b7-9d1b-f35a77474fba', '9f798177-5118-428e-b6a2-55eb02f89eaa', '6765d0d1-a82a-4238-a86c-3cbedf80adac', 'Restaurant Depot', 'RD-SEP26-003', '2026-09-17', 6186.23, 0, 6186.23),
  ('107c2233-2319-4de4-999b-c9b6b907aab8', '9f798177-5118-428e-b6a2-55eb02f89eaa', 'a1e9b9d7-d97c-46f6-9641-661e3cffb82b', 'Apna Bazaar Wholesale', 'AB-0926-002', '2026-09-22', 2244.55, 0, 2244.55),
  ('1f54e310-6391-413f-a27b-aee0501002af', '9f798177-5118-428e-b6a2-55eb02f89eaa', 'da8c3095-b24c-4555-bfd2-a200fd5e8476', 'Restaurant Depot', 'RD-SEP26-004', '2026-09-24', 3859.07, 0, 3859.07);

-- invoice_lines --
insert into public.invoice_lines
  (header_id, restaurant_id, invoice_date, item_name, display_name, category, purchase_unit, unit_qty, case_qty, unit_price, total)
values
  ('b3391d67-4642-4bf6-b15d-1507561b0025', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-03', 'MILK COCONUT 12/13.5OZ', 'Coconut Milk 12/13.5oz', 'Dairy', 'case', 0, 7, 22.99, 160.93),
  ('b3391d67-4642-4bf6-b15d-1507561b0025', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-03', 'PANEER 12/1LB', 'Paneer 12/1lb', 'Dairy', 'case', 0, 5, 58.99, 294.95),
  ('b3391d67-4642-4bf6-b15d-1507561b0025', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-03', 'PROD GARLIC 10LB', 'Garlic 10lb', 'Produce', 'case', 0, 5, 22.99, 114.95),
  ('b3391d67-4642-4bf6-b15d-1507561b0025', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-03', 'JUICE LEMON 1GAL', 'Lemon Juice 1gal', 'Beverages', 'case', 0, 8, 12.99, 103.92),
  ('b3391d67-4642-4bf6-b15d-1507561b0025', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-03', 'PROD JALAPENO 10LB', 'Jalapeno 10lb', 'Produce', 'case', 0, 4, 16.99, 67.96),
  ('b3391d67-4642-4bf6-b15d-1507561b0025', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-03', 'PROD CAULIFLOWER 12CT', 'Cauliflower 12ct', 'Produce', 'case', 0, 5, 28.99, 144.95),
  ('b3391d67-4642-4bf6-b15d-1507561b0025', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-03', 'CREAM HEAVY QT', 'Heavy Cream Quart', 'Dairy', 'case', 0, 5, 5.99, 29.95),
  ('b3391d67-4642-4bf6-b15d-1507561b0025', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-03', 'CHIX LEG QTR 40LB', 'Chicken Leg Quarters 40lb', 'Proteins', 'case', 0, 7, 54.99, 384.93),
  ('b3391d67-4642-4bf6-b15d-1507561b0025', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-03', 'PROD SPINACH 4/2.5LB', 'Spinach 4/2.5lb', 'Produce', 'case', 0, 5, 18.99, 94.95),
  ('b3391d67-4642-4bf6-b15d-1507561b0025', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-03', 'MANGO PULP 12/30OZ', 'Mango Pulp 12/30oz', 'Other', 'case', 0, 8, 38.99, 311.92),
  ('b3391d67-4642-4bf6-b15d-1507561b0025', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-03', 'SHRMP 31/40 5LB', 'Shrimp 31/40 5lb', 'Proteins', 'case', 0, 6, 42.99, 257.94),
  ('b3391d67-4642-4bf6-b15d-1507561b0025', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-03', 'SALT 50LB', 'Salt 50lb', 'Dry Goods', 'case', 0, 5, 12.99, 64.95),
  ('b3391d67-4642-4bf6-b15d-1507561b0025', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-03', 'LENTIL BLACK URAD 20LB', 'Black Urad Dal 20lb', 'Other', 'case', 0, 5, 29.99, 149.95),
  ('b3391d67-4642-4bf6-b15d-1507561b0025', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-03', 'BUTTER SOLID 36/1LB', 'Butter Solid 36/1lb', 'Dairy', 'case', 0, 6, 89.99, 539.94),
  ('b3391d67-4642-4bf6-b15d-1507561b0025', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-03', 'OIL MUSTARD 5GAL', 'Mustard Oil 5gal', 'Dry Goods', 'case', 0, 4, 54.99, 219.96),
  ('b3391d67-4642-4bf6-b15d-1507561b0025', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-03', 'TOMATO CQ CRUSHED 6/#10', 'Crushed Tomatoes 6/#10', 'Dry Goods', 'case', 0, 8, 24.99, 199.92),
  ('b3391d67-4642-4bf6-b15d-1507561b0025', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-03', 'CHIX BREAST B/S 40LB', 'Chicken Breast Boneless Skinless 40lb', 'Proteins', 'case', 0, 6, 89.99, 539.94),
  ('b3391d67-4642-4bf6-b15d-1507561b0025', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-03', 'TILAPIA FILLET 10LB', 'Tilapia Fillet 10lb', 'Proteins', 'case', 0, 8, 39.99, 319.92),
  ('b3391d67-4642-4bf6-b15d-1507561b0025', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-03', 'GOAT MEAT B/I 30LB', 'Goat Meat Bone-In 30lb', 'Proteins', 'case', 0, 8, 174.99, 1399.92),
  ('b3391d67-4642-4bf6-b15d-1507561b0025', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-03', 'CONT HINGED 9X9 200CT', 'Hinged Containers 9x9 200ct', 'Packaging', 'case', 0, 5, 32.99, 164.95),
  ('abb62512-7100-4afa-bdd6-569667a3b04f', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-08', 'BASMATI RICE 2/20LB', 'Basmati Rice 2/20lb', 'Dry Goods', 'case', 0, 5, 64.99, 324.95),
  ('abb62512-7100-4afa-bdd6-569667a3b04f', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-08', 'SP MUSTARD SEED 5LB', 'Mustard Seed 5lb', 'Dry Goods', 'case', 0, 4, 16.99, 67.96),
  ('abb62512-7100-4afa-bdd6-569667a3b04f', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-08', 'FLOUR ATTA 4/10LB', 'Atta Flour 4/10lb', 'Dry Goods', 'case', 0, 4, 32.99, 131.96),
  ('abb62512-7100-4afa-bdd6-569667a3b04f', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-08', 'PANEER 12/1LB', 'Paneer 12/1lb', 'Dairy', 'case', 0, 4, 58.99, 235.96),
  ('abb62512-7100-4afa-bdd6-569667a3b04f', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-08', 'SP FENUGREEK 5LB', 'Fenugreek 5lb', 'Dry Goods', 'case', 0, 6, 18.99, 113.94),
  ('abb62512-7100-4afa-bdd6-569667a3b04f', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-08', 'SP CURRY LEAF DRIED 2LB', 'Dried Curry Leaves 2lb', 'Dry Goods', 'case', 0, 6, 26.99, 161.94),
  ('abb62512-7100-4afa-bdd6-569667a3b04f', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-08', 'LENTIL TOOR 20LB', 'Toor Dal 20lb', 'Other', 'case', 0, 5, 27.99, 139.95),
  ('abb62512-7100-4afa-bdd6-569667a3b04f', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-08', 'SP SAFFRON 1OZ', 'Saffron 1oz', 'Dry Goods', 'case', 0, 5, 89.99, 449.95),
  ('abb62512-7100-4afa-bdd6-569667a3b04f', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-08', 'GHEE 4/1GAL', 'Ghee 4/1gal', 'Other', 'case', 0, 4, 72.99, 291.96),
  ('abb62512-7100-4afa-bdd6-569667a3b04f', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-08', 'SP CARDAMOM GREEN 2LB', 'Green Cardamom 2lb', 'Dry Goods', 'case', 0, 5, 64.99, 324.95),
  ('abb62512-7100-4afa-bdd6-569667a3b04f', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-08', 'SP TAMARIND PASTE 5LB', 'Tamarind Paste 5lb', 'Dry Goods', 'case', 0, 3, 21.99, 65.97),
  ('4e781b94-9712-45d8-8513-d6f4797419e2', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-10', 'CHIX BREAST B/S 40LB', 'Chicken Breast Boneless Skinless 40lb', 'Proteins', 'case', 0, 6, 89.99, 539.94),
  ('4e781b94-9712-45d8-8513-d6f4797419e2', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-10', 'CHIX LEG QTR 40LB', 'Chicken Leg Quarters 40lb', 'Proteins', 'case', 0, 6, 54.99, 329.94),
  ('4e781b94-9712-45d8-8513-d6f4797419e2', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-10', 'MILK COCONUT 12/13.5OZ', 'Coconut Milk 12/13.5oz', 'Dairy', 'case', 0, 6, 22.99, 137.94),
  ('4e781b94-9712-45d8-8513-d6f4797419e2', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-10', 'LAMB LEG B/I 30LB', 'Lamb Leg Bone-In 30lb', 'Proteins', 'case', 0, 3, 189.99, 569.97),
  ('4e781b94-9712-45d8-8513-d6f4797419e2', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-10', 'SP CORIANDER GND 5LB', 'Ground Coriander 5lb', 'Dry Goods', 'case', 0, 5, 22.99, 114.95),
  ('4e781b94-9712-45d8-8513-d6f4797419e2', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-10', 'PROD LEMON 20LB', 'Lemons 20lb', 'Produce', 'case', 0, 8, 24.99, 199.92),
  ('4e781b94-9712-45d8-8513-d6f4797419e2', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-10', 'FLOUR AP 50LB', 'All-Purpose Flour 50lb', 'Dry Goods', 'case', 0, 7, 24.99, 174.93),
  ('4e781b94-9712-45d8-8513-d6f4797419e2', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-10', 'PROD SPINACH 4/2.5LB', 'Spinach 4/2.5lb', 'Produce', 'case', 0, 6, 18.99, 113.94),
  ('4e781b94-9712-45d8-8513-d6f4797419e2', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-10', 'PANEER 12/1LB', 'Paneer 12/1lb', 'Dairy', 'case', 0, 7, 58.99, 412.93),
  ('4e781b94-9712-45d8-8513-d6f4797419e2', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-10', 'PROD ONION YLW 50LB', 'Yellow Onions 50lb', 'Produce', 'case', 0, 4, 24.99, 99.96),
  ('4e781b94-9712-45d8-8513-d6f4797419e2', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-10', 'PROD GARLIC 10LB', 'Garlic 10lb', 'Produce', 'case', 0, 8, 22.99, 183.92),
  ('4e781b94-9712-45d8-8513-d6f4797419e2', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-10', 'LENTIL BLACK URAD 20LB', 'Black Urad Dal 20lb', 'Other', 'case', 0, 3, 29.99, 89.97),
  ('4e781b94-9712-45d8-8513-d6f4797419e2', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-10', 'TOMATO CQ CRUSHED 6/#10', 'Crushed Tomatoes 6/#10', 'Dry Goods', 'case', 0, 7, 24.99, 174.93),
  ('4e781b94-9712-45d8-8513-d6f4797419e2', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-10', 'BEAN CHICKPEA 6/#10', 'Chickpeas 6/#10', 'Dry Goods', 'case', 0, 5, 28.99, 144.95),
  ('4e781b94-9712-45d8-8513-d6f4797419e2', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-10', 'SP TURMERIC GND 5LB', 'Ground Turmeric 5lb', 'Dry Goods', 'case', 0, 4, 24.99, 99.96),
  ('4e781b94-9712-45d8-8513-d6f4797419e2', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-10', 'OIL CANOLA 35LB', 'Canola Oil 35lb', 'Dry Goods', 'case', 0, 5, 42.99, 214.95),
  ('4e781b94-9712-45d8-8513-d6f4797419e2', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-10', 'BUTTER SOLID 36/1LB', 'Butter Solid 36/1lb', 'Dairy', 'case', 0, 4, 89.99, 359.96),
  ('4e781b94-9712-45d8-8513-d6f4797419e2', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-10', 'PROD TOMATO 25LB', 'Tomatoes 25lb', 'Produce', 'case', 0, 8, 32.99, 263.92),
  ('4e781b94-9712-45d8-8513-d6f4797419e2', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-10', 'GOAT MEAT B/I 30LB', 'Goat Meat Bone-In 30lb', 'Proteins', 'case', 0, 8, 174.99, 1399.92),
  ('4e781b94-9712-45d8-8513-d6f4797419e2', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-10', 'SP CUMIN GND 5LB', 'Ground Cumin 5lb', 'Dry Goods', 'case', 0, 6, 38.99, 233.94),
  ('4e781b94-9712-45d8-8513-d6f4797419e2', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-10', 'MILK WHOLE GAL', 'Whole Milk Gallon', 'Dairy', 'case', 0, 8, 4.49, 35.92),
  ('4e781b94-9712-45d8-8513-d6f4797419e2', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-10', 'OIL MUSTARD 5GAL', 'Mustard Oil 5gal', 'Dry Goods', 'case', 0, 3, 54.99, 164.97),
  ('9a3505e4-11f0-44b7-9d1b-f35a77474fba', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-17', 'SP CHILI KASHMIRI 5LB', 'Kashmiri Chili 5lb', 'Dry Goods', 'case', 0, 3, 32.99, 98.97),
  ('9a3505e4-11f0-44b7-9d1b-f35a77474fba', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-17', 'SP GARAM MASALA 5LB', 'Garam Masala 5lb', 'Dry Goods', 'case', 0, 7, 44.99, 314.93),
  ('9a3505e4-11f0-44b7-9d1b-f35a77474fba', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-17', 'MILK COCONUT 12/13.5OZ', 'Coconut Milk 12/13.5oz', 'Dairy', 'case', 0, 8, 22.99, 183.92),
  ('9a3505e4-11f0-44b7-9d1b-f35a77474fba', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-17', 'LAMB LEG B/I 30LB', 'Lamb Leg Bone-In 30lb', 'Proteins', 'case', 0, 4, 189.99, 759.96),
  ('9a3505e4-11f0-44b7-9d1b-f35a77474fba', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-17', 'SP CUMIN GND 5LB', 'Ground Cumin 5lb', 'Dry Goods', 'case', 0, 5, 38.99, 194.95),
  ('9a3505e4-11f0-44b7-9d1b-f35a77474fba', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-17', 'OIL MUSTARD 5GAL', 'Mustard Oil 5gal', 'Dry Goods', 'case', 0, 7, 54.99, 384.93),
  ('9a3505e4-11f0-44b7-9d1b-f35a77474fba', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-17', 'SHRMP 31/40 5LB', 'Shrimp 31/40 5lb', 'Proteins', 'case', 0, 7, 42.99, 300.93),
  ('9a3505e4-11f0-44b7-9d1b-f35a77474fba', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-17', 'PROD SPINACH 4/2.5LB', 'Spinach 4/2.5lb', 'Produce', 'case', 0, 6, 18.99, 113.94),
  ('9a3505e4-11f0-44b7-9d1b-f35a77474fba', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-17', 'PROD GARLIC 10LB', 'Garlic 10lb', 'Produce', 'case', 0, 5, 22.99, 114.95),
  ('9a3505e4-11f0-44b7-9d1b-f35a77474fba', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-17', 'TILAPIA FILLET 10LB', 'Tilapia Fillet 10lb', 'Proteins', 'case', 0, 8, 39.99, 319.92),
  ('9a3505e4-11f0-44b7-9d1b-f35a77474fba', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-17', 'CHIX LEG QTR 40LB', 'Chicken Leg Quarters 40lb', 'Proteins', 'case', 0, 8, 54.99, 439.92),
  ('9a3505e4-11f0-44b7-9d1b-f35a77474fba', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-17', 'BUTTER SOLID 36/1LB', 'Butter Solid 36/1lb', 'Dairy', 'case', 0, 3, 89.99, 269.97),
  ('9a3505e4-11f0-44b7-9d1b-f35a77474fba', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-17', 'SUGAR 50LB', 'Sugar 50lb', 'Dry Goods', 'case', 0, 6, 34.99, 209.94),
  ('9a3505e4-11f0-44b7-9d1b-f35a77474fba', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-17', 'PANEER 12/1LB', 'Paneer 12/1lb', 'Dairy', 'case', 0, 4, 58.99, 235.96),
  ('9a3505e4-11f0-44b7-9d1b-f35a77474fba', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-17', 'BASMATI RICE 2/20LB', 'Basmati Rice 2/20lb', 'Dry Goods', 'case', 0, 6, 64.99, 389.94),
  ('9a3505e4-11f0-44b7-9d1b-f35a77474fba', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-17', 'CONT HINGED 9X9 200CT', 'Hinged Containers 9x9 200ct', 'Packaging', 'case', 0, 5, 32.99, 164.95),
  ('9a3505e4-11f0-44b7-9d1b-f35a77474fba', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-17', 'GOAT MEAT B/I 30LB', 'Goat Meat Bone-In 30lb', 'Proteins', 'case', 0, 6, 174.99, 1049.94),
  ('9a3505e4-11f0-44b7-9d1b-f35a77474fba', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-17', 'MILK WHOLE GAL', 'Whole Milk Gallon', 'Dairy', 'case', 0, 5, 4.49, 22.45),
  ('9a3505e4-11f0-44b7-9d1b-f35a77474fba', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-17', 'BAG TSHIRT 1000CT', 'T-Shirt Bags 1000ct', 'Packaging', 'case', 0, 7, 28.99, 202.93),
  ('9a3505e4-11f0-44b7-9d1b-f35a77474fba', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-17', 'SP CORIANDER GND 5LB', 'Ground Coriander 5lb', 'Dry Goods', 'case', 0, 6, 22.99, 137.94),
  ('9a3505e4-11f0-44b7-9d1b-f35a77474fba', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-17', 'YOG PLAIN 5GAL', 'Plain Yogurt 5gal', 'Dairy', 'case', 0, 8, 24.99, 199.92),
  ('9a3505e4-11f0-44b7-9d1b-f35a77474fba', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-17', 'PROD LEMON 20LB', 'Lemons 20lb', 'Produce', 'case', 0, 3, 24.99, 74.97),
  ('107c2233-2319-4de4-999b-c9b6b907aab8', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-22', 'LENTIL CHANA 20LB', 'Chana Dal 20lb', 'Other', 'case', 0, 3, 24.99, 74.97),
  ('107c2233-2319-4de4-999b-c9b6b907aab8', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-22', 'SP CARDAMOM GREEN 2LB', 'Green Cardamom 2lb', 'Dry Goods', 'case', 0, 6, 64.99, 389.94),
  ('107c2233-2319-4de4-999b-c9b6b907aab8', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-22', 'SP CURRY LEAF DRIED 2LB', 'Dried Curry Leaves 2lb', 'Dry Goods', 'case', 0, 3, 26.99, 80.97),
  ('107c2233-2319-4de4-999b-c9b6b907aab8', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-22', 'SP SAFFRON 1OZ', 'Saffron 1oz', 'Dry Goods', 'case', 0, 6, 89.99, 539.94),
  ('107c2233-2319-4de4-999b-c9b6b907aab8', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-22', 'LENTIL TOOR 20LB', 'Toor Dal 20lb', 'Other', 'case', 0, 4, 27.99, 111.96),
  ('107c2233-2319-4de4-999b-c9b6b907aab8', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-22', 'SP TAMARIND PASTE 5LB', 'Tamarind Paste 5lb', 'Dry Goods', 'case', 0, 6, 21.99, 131.94),
  ('107c2233-2319-4de4-999b-c9b6b907aab8', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-22', 'SP MUSTARD SEED 5LB', 'Mustard Seed 5lb', 'Dry Goods', 'case', 0, 4, 16.99, 67.96),
  ('107c2233-2319-4de4-999b-c9b6b907aab8', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-22', 'PANEER 12/1LB', 'Paneer 12/1lb', 'Dairy', 'case', 0, 5, 58.99, 294.95),
  ('107c2233-2319-4de4-999b-c9b6b907aab8', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-22', 'GHEE 4/1GAL', 'Ghee 4/1gal', 'Other', 'case', 0, 4, 72.99, 291.96),
  ('107c2233-2319-4de4-999b-c9b6b907aab8', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-22', 'BASMATI RICE 2/20LB', 'Basmati Rice 2/20lb', 'Dry Goods', 'case', 0, 4, 64.99, 259.96),
  ('1f54e310-6391-413f-a27b-aee0501002af', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-24', 'SP CUMIN GND 5LB', 'Ground Cumin 5lb', 'Dry Goods', 'case', 0, 7, 38.99, 272.93),
  ('1f54e310-6391-413f-a27b-aee0501002af', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-24', 'PROD GARLIC 10LB', 'Garlic 10lb', 'Produce', 'case', 0, 5, 22.99, 114.95),
  ('1f54e310-6391-413f-a27b-aee0501002af', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-24', 'PROD CILANTRO 12CT', 'Cilantro 12ct', 'Produce', 'case', 0, 3, 14.99, 44.97),
  ('1f54e310-6391-413f-a27b-aee0501002af', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-24', 'SALT 50LB', 'Salt 50lb', 'Dry Goods', 'case', 0, 7, 12.99, 90.93),
  ('1f54e310-6391-413f-a27b-aee0501002af', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-24', 'MANGO PULP 12/30OZ', 'Mango Pulp 12/30oz', 'Other', 'case', 0, 3, 38.99, 116.97),
  ('1f54e310-6391-413f-a27b-aee0501002af', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-24', 'PROD CAULIFLOWER 12CT', 'Cauliflower 12ct', 'Produce', 'case', 0, 3, 28.99, 86.97),
  ('1f54e310-6391-413f-a27b-aee0501002af', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-24', 'CREAM HEAVY QT', 'Heavy Cream Quart', 'Dairy', 'case', 0, 4, 5.99, 23.96),
  ('1f54e310-6391-413f-a27b-aee0501002af', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-24', 'PROD SPINACH 4/2.5LB', 'Spinach 4/2.5lb', 'Produce', 'case', 0, 4, 18.99, 75.96),
  ('1f54e310-6391-413f-a27b-aee0501002af', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-24', 'TILAPIA FILLET 10LB', 'Tilapia Fillet 10lb', 'Proteins', 'case', 0, 7, 39.99, 279.93),
  ('1f54e310-6391-413f-a27b-aee0501002af', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-24', 'PROD ONION YLW 50LB', 'Yellow Onions 50lb', 'Produce', 'case', 0, 3, 24.99, 74.97),
  ('1f54e310-6391-413f-a27b-aee0501002af', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-24', 'BAG TSHIRT 1000CT', 'T-Shirt Bags 1000ct', 'Packaging', 'case', 0, 6, 28.99, 173.94),
  ('1f54e310-6391-413f-a27b-aee0501002af', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-24', 'LENTIL BLACK URAD 20LB', 'Black Urad Dal 20lb', 'Other', 'case', 0, 5, 29.99, 149.95),
  ('1f54e310-6391-413f-a27b-aee0501002af', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-24', 'CONT HINGED 9X9 200CT', 'Hinged Containers 9x9 200ct', 'Packaging', 'case', 0, 6, 32.99, 197.94),
  ('1f54e310-6391-413f-a27b-aee0501002af', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-24', 'BEAN CHICKPEA 6/#10', 'Chickpeas 6/#10', 'Dry Goods', 'case', 0, 3, 28.99, 86.97),
  ('1f54e310-6391-413f-a27b-aee0501002af', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-24', 'TOMATO CQ CRUSHED 6/#10', 'Crushed Tomatoes 6/#10', 'Dry Goods', 'case', 0, 3, 24.99, 74.97),
  ('1f54e310-6391-413f-a27b-aee0501002af', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-24', 'CHIX BREAST B/S 40LB', 'Chicken Breast Boneless Skinless 40lb', 'Proteins', 'case', 0, 3, 89.99, 269.97),
  ('1f54e310-6391-413f-a27b-aee0501002af', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-24', 'GOAT MEAT B/I 30LB', 'Goat Meat Bone-In 30lb', 'Proteins', 'case', 0, 7, 174.99, 1224.93),
  ('1f54e310-6391-413f-a27b-aee0501002af', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-24', 'SP TURMERIC GND 5LB', 'Ground Turmeric 5lb', 'Dry Goods', 'case', 0, 4, 24.99, 99.96),
  ('1f54e310-6391-413f-a27b-aee0501002af', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-24', 'PANEER 12/1LB', 'Paneer 12/1lb', 'Dairy', 'case', 0, 4, 58.99, 235.96),
  ('1f54e310-6391-413f-a27b-aee0501002af', '9f798177-5118-428e-b6a2-55eb02f89eaa', '2026-09-24', 'LENTIL RED 20LB', 'Red Lentils 20lb', 'Other', 'case', 0, 6, 26.99, 161.94);

commit;

-- 3. (Optional) Link the test login to the test restaurant.
-- Replace 'test-user@example.com' with the test user's login email,
-- uncomment the block below, and re-run just this part.
--
-- insert into public.user_restaurants (user_id, restaurant_id, role)
-- select id, '9f798177-5118-428e-b6a2-55eb02f89eaa', 'owner'
-- from auth.users where email = 'test-user@example.com'
-- on conflict (user_id, restaurant_id) do update set role = excluded.role;

-- Verify:
-- select count(*), sum(net_cents)/100.0 as net_sales from public.daily_sales where restaurant_id = '9f798177-5118-428e-b6a2-55eb02f89eaa' and date between '2026-09-01' and '2026-09-30';
-- select count(*), sum(total) as spend from public.invoice_headers where restaurant_id = '9f798177-5118-428e-b6a2-55eb02f89eaa' and invoice_date between '2026-09-01' and '2026-09-30';
