/**
 * Export the September 2026 test data as a single SQL file.
 *
 * Reuses the exact builders behind --write so the numbers match the
 * TypeScript seed scripts bit-for-bit:
 *   - scripts/simulate-september-sales.ts  -> daily_sales (30 rows)
 *   - scripts/seed-fake-invoices.ts        -> invoice_files/headers/lines
 *
 * The user runs the output in the Supabase SQL editor (which bypasses RLS),
 * so no service key is needed.
 *
 *   npx tsx scripts/export-september-seed.ts [--out sql/006_seed_september_test_data.sql]
 */
import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { categorize } from '../lib/categorize.js'
import { simulateSeptember } from './simulate-september-sales.js'
import { buildSeptember, mulberry32 } from './seed-fake-invoices.js'

const RESTAURANT_ID = '9f798177-5118-428e-b6a2-55eb02f89eaa'
const SALES_SEED = 42
const INVOICE_SEED = 7

const esc = (s: string): string => s.replace(/'/g, "''")
const money = (n: number): string => n.toFixed(2)

function main(): void {
  const outArg = process.argv.indexOf('--out')
  const outPath = new URL(
    outArg >= 0 ? process.argv[outArg + 1] : '../sql/006_seed_september_test_data.sql',
    import.meta.url,
  )

  const { days } = simulateSeptember(SALES_SEED)
  const invoices = buildSeptember(mulberry32(INVOICE_SEED))

  const totNet = days.reduce((s, d) => s + d.netCents, 0)
  const totSpend = invoices.reduce((s, i) => s + i.total, 0)
  const totLines = invoices.reduce((s, i) => s + i.lines.length, 0)

  const L: string[] = []
  L.push('-- 006_seed_september_test_data.sql')
  L.push('-- September 2026 test data for the Turmeric test restaurant.')
  L.push(`-- Restaurant: ${RESTAURANT_ID}`)
  L.push('--')
  L.push('-- Contents: 30 daily_sales rows (simulated Turmeric-menu sales,')
  L.push(`--   net $${money(totNet / 100)}) + ${invoices.length} invoices / ${totLines} lines`)
  L.push(`--   (Turmeric-style purchases, spend $${money(totSpend)}).`)
  L.push('-- Implied food cost %: ' + ((totSpend / (totNet / 100)) * 100).toFixed(1) + '%')
  L.push('--')
  L.push('-- HOW TO RUN: Supabase dashboard -> SQL editor -> paste this file -> Run.')
  L.push('-- Run AFTER sql/005_daily_sales.sql. Idempotent (re-runnable).')
  L.push('')
  L.push('begin;')
  L.push('')

  // ── daily_sales (upsert on the unique restaurant+date) ──────────────────
  L.push('-- 1. Simulated September sales (Turmeric menu, seed 42) --')
  L.push("insert into public.daily_sales")
  L.push('  (restaurant_id, date, gross_cents, discount_cents, refund_cents, net_cents, order_count, source)')
  L.push('values')
  L.push(
    days
      .map(
        (d) =>
          `  ('${RESTAURANT_ID}', '${d.date}', ${d.grossCents}, ${d.discountCents}, ${d.refundCents}, ${d.netCents}, ${d.orderCount}, 'simulation')`,
      )
      .join(',\n'),
  )
  L.push('on conflict (restaurant_id, date) do update set')
  L.push('  gross_cents    = excluded.gross_cents,')
  L.push('  discount_cents = excluded.discount_cents,')
  L.push('  refund_cents   = excluded.refund_cents,')
  L.push('  net_cents      = excluded.net_cents,')
  L.push('  order_count    = excluded.order_count,')
  L.push("  source         = excluded.source;")
  L.push('')

  // ── invoices (delete-then-insert for idempotency) ───────────────────────
  L.push('-- 2. Fake September invoices (Turmeric-style purchases, seed 7) --')
  L.push('-- Remove any previously seeded invoices first.')
  L.push('delete from public.invoice_lines')
  L.push('where header_id in (')
  L.push('  select h.id from public.invoice_headers h')
  L.push('  join public.invoice_files f on f.id = h.file_id')
  L.push(`  where f.restaurant_id = '${RESTAURANT_ID}' and f.drive_file_id like 'seed-turmeric-%'`)
  L.push(');')
  L.push('delete from public.invoice_headers')
  L.push('where file_id in (')
  L.push('  select id from public.invoice_files')
  L.push(`  where restaurant_id = '${RESTAURANT_ID}' and drive_file_id like 'seed-turmeric-%'`)
  L.push(');')
  L.push('delete from public.invoice_files')
  L.push(`where restaurant_id = '${RESTAURANT_ID}' and drive_file_id like 'seed-turmeric-%';`)
  L.push('')

  const fileIds: string[] = []
  const headerIds: string[] = []
  const fileRows: string[] = []
  const headerRows: string[] = []
  const lineRows: string[] = []
  invoices.forEach((inv, i) => {
    const fileId = randomUUID()
    const headerId = randomUUID()
    fileIds.push(fileId)
    headerIds.push(headerId)
    const driveFileId = `seed-turmeric-sep26-${i + 1}`
    fileRows.push(
      `  ('${fileId}', '${RESTAURANT_ID}', '${driveFileId}', '${esc(inv.number)}.pdf', '${inv.date}', ${money(inv.total)}, 'done', 'upload', now())`,
    )
    headerRows.push(
      `  ('${headerId}', '${RESTAURANT_ID}', '${fileId}', '${esc(inv.vendor)}', '${esc(inv.number)}', '${inv.date}', ${money(inv.total)}, 0, ${money(inv.total)})`,
    )
    for (const line of inv.lines) {
      lineRows.push(
        `  ('${headerId}', '${RESTAURANT_ID}', '${inv.date}', '${esc(line.item.raw)}', '${esc(line.item.clean)}', '${categorize(line.item.raw)}', 'case', 0, ${line.qty}, ${money(line.item.price)}, ${money(line.total)})`,
      )
    }
  })

  L.push('-- invoice_files --')
  L.push('insert into public.invoice_files')
  L.push('  (id, restaurant_id, drive_file_id, filename, file_date, file_total, status, source, processed_at)')
  L.push('values')
  L.push(fileRows.join(',\n') + ';')
  L.push('')
  L.push('-- invoice_headers --')
  L.push('insert into public.invoice_headers')
  L.push('  (id, restaurant_id, file_id, vendor, invoice_number, invoice_date, subtotal, tax, total)')
  L.push('values')
  L.push(headerRows.join(',\n') + ';')
  L.push('')
  L.push('-- invoice_lines --')
  L.push('insert into public.invoice_lines')
  L.push('  (header_id, restaurant_id, invoice_date, item_name, display_name, category, purchase_unit, unit_qty, case_qty, unit_price, total)')
  L.push('values')
  L.push(lineRows.join(',\n') + ';')
  L.push('')
  L.push('commit;')
  L.push('')
  L.push('-- 3. (Optional) Link the test login to the test restaurant.')
  L.push("-- Replace 'test-user@example.com' with the test user's login email,")
  L.push('-- uncomment the block below, and re-run just this part.')
  L.push('--')
  L.push('-- insert into public.user_restaurants (user_id, restaurant_id, role)')
  L.push(`-- select id, '${RESTAURANT_ID}', 'owner'`)
  L.push("-- from auth.users where email = 'test-user@example.com'")
  L.push('-- on conflict (user_id, restaurant_id) do update set role = excluded.role;')
  L.push('')
  L.push('-- Verify:')
  L.push(`-- select count(*), sum(net_cents)/100.0 as net_sales from public.daily_sales where restaurant_id = '${RESTAURANT_ID}' and date between '2026-09-01' and '2026-09-30';`)
  L.push(`-- select count(*), sum(total) as spend from public.invoice_headers where restaurant_id = '${RESTAURANT_ID}' and invoice_date between '2026-09-01' and '2026-09-30';`)
  L.push('')

  writeFileSync(outPath, L.join('\n'))
  console.log(`Wrote ${outPath}`)
  console.log(`  daily_sales rows : ${days.length} (net $${money(totNet / 100)})`)
  console.log(`  invoices         : ${invoices.length} (${totLines} lines, spend $${money(totSpend)})`)
  console.log(`  implied food cost: ${((totSpend / (totNet / 100)) * 100).toFixed(1)}%`)
}

main()
