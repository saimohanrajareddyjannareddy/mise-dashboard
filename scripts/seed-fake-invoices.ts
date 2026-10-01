/**
 * Seed fake September 2026 invoices for the Turmeric test restaurant.
 *
 * Mirrors exactly what the dashboard's upload flow writes
 * (app/dashboard/upload/page.tsx): one invoice_files row + one
 * invoice_headers row + N invoice_lines rows per invoice. Line categories
 * are produced by the REAL lib/categorize.ts so the seeded data behaves
 * like parser output.
 *
 * Target: ~$23.5k of September spend -> ~30% food cost against the
 * ~$78.2k of simulated September sales.
 *
 *   npx tsx scripts/seed-fake-invoices.ts --seed 7
 *   npx tsx scripts/seed-fake-invoices.ts --write --restaurant-id <uuid> [--seed 7]
 *
 * --write is idempotent: it deletes previously seeded rows
 * (drive_file_id LIKE 'seed-turmeric-%') before inserting.
 */
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'node:url'
import { categorize } from '../lib/categorize.js'

type Item = { raw: string; clean: string; price: number } // price per case, dollars

// --- Turmeric-style wholesale catalog (RD-style raw names) -----------------
const RD_ITEMS: Item[] = [
  { raw: 'CHIX BREAST B/S 40LB', clean: 'Chicken Breast Boneless Skinless 40lb', price: 89.99 },
  { raw: 'CHIX LEG QTR 40LB', clean: 'Chicken Leg Quarters 40lb', price: 54.99 },
  { raw: 'LAMB LEG B/I 30LB', clean: 'Lamb Leg Bone-In 30lb', price: 189.99 },
  { raw: 'GOAT MEAT B/I 30LB', clean: 'Goat Meat Bone-In 30lb', price: 174.99 },
  { raw: 'SHRMP 31/40 5LB', clean: 'Shrimp 31/40 5lb', price: 42.99 },
  { raw: 'TILAPIA FILLET 10LB', clean: 'Tilapia Fillet 10lb', price: 39.99 },
  { raw: 'YOG PLAIN 5GAL', clean: 'Plain Yogurt 5gal', price: 24.99 },
  { raw: 'PANEER 12/1LB', clean: 'Paneer 12/1lb', price: 58.99 },
  { raw: 'MILK WHOLE GAL', clean: 'Whole Milk Gallon', price: 4.49 },
  { raw: 'BUTTER SOLID 36/1LB', clean: 'Butter Solid 36/1lb', price: 89.99 },
  { raw: 'CREAM HEAVY QT', clean: 'Heavy Cream Quart', price: 5.99 },
  { raw: 'PROD ONION YLW 50LB', clean: 'Yellow Onions 50lb', price: 24.99 },
  { raw: 'PROD TOMATO 25LB', clean: 'Tomatoes 25lb', price: 32.99 },
  { raw: 'PROD CILANTRO 12CT', clean: 'Cilantro 12ct', price: 14.99 },
  { raw: 'PROD GINGER 10LB', clean: 'Ginger 10lb', price: 19.99 },
  { raw: 'PROD GARLIC 10LB', clean: 'Garlic 10lb', price: 22.99 },
  { raw: 'PROD JALAPENO 10LB', clean: 'Jalapeno 10lb', price: 16.99 },
  { raw: 'PROD LEMON 20LB', clean: 'Lemons 20lb', price: 24.99 },
  { raw: 'PROD CAULIFLOWER 12CT', clean: 'Cauliflower 12ct', price: 28.99 },
  { raw: 'PROD SPINACH 4/2.5LB', clean: 'Spinach 4/2.5lb', price: 18.99 },
  { raw: 'BASMATI RICE 2/20LB', clean: 'Basmati Rice 2/20lb', price: 64.99 },
  { raw: 'FLOUR ATTA 4/10LB', clean: 'Atta Flour 4/10lb', price: 32.99 },
  { raw: 'FLOUR AP 50LB', clean: 'All-Purpose Flour 50lb', price: 24.99 },
  { raw: 'OIL CANOLA 35LB', clean: 'Canola Oil 35lb', price: 42.99 },
  { raw: 'OIL MUSTARD 5GAL', clean: 'Mustard Oil 5gal', price: 54.99 },
  { raw: 'SP CUMIN GND 5LB', clean: 'Ground Cumin 5lb', price: 38.99 },
  { raw: 'SP TURMERIC GND 5LB', clean: 'Ground Turmeric 5lb', price: 24.99 },
  { raw: 'SP GARAM MASALA 5LB', clean: 'Garam Masala 5lb', price: 44.99 },
  { raw: 'SP CHILI KASHMIRI 5LB', clean: 'Kashmiri Chili 5lb', price: 32.99 },
  { raw: 'SP CORIANDER GND 5LB', clean: 'Ground Coriander 5lb', price: 22.99 },
  { raw: 'BEAN CHICKPEA 6/#10', clean: 'Chickpeas 6/#10', price: 28.99 },
  { raw: 'LENTIL RED 20LB', clean: 'Red Lentils 20lb', price: 26.99 },
  { raw: 'LENTIL BLACK URAD 20LB', clean: 'Black Urad Dal 20lb', price: 29.99 },
  { raw: 'SUGAR 50LB', clean: 'Sugar 50lb', price: 34.99 },
  { raw: 'SALT 50LB', clean: 'Salt 50lb', price: 12.99 },
  { raw: 'TOMATO CQ CRUSHED 6/#10', clean: 'Crushed Tomatoes 6/#10', price: 24.99 },
  { raw: 'MILK COCONUT 12/13.5OZ', clean: 'Coconut Milk 12/13.5oz', price: 22.99 },
  { raw: 'MANGO PULP 12/30OZ', clean: 'Mango Pulp 12/30oz', price: 38.99 },
  { raw: 'JUICE LEMON 1GAL', clean: 'Lemon Juice 1gal', price: 12.99 },
  { raw: 'CONT HINGED 9X9 200CT', clean: 'Hinged Containers 9x9 200ct', price: 32.99 },
  { raw: 'BAG TSHIRT 1000CT', clean: 'T-Shirt Bags 1000ct', price: 28.99 },
  { raw: 'FOIL ROLL 18IN 1000FT', clean: 'Foil Roll 18in 1000ft', price: 34.99 },
]

const SPECIALTY_ITEMS: Item[] = [
  { raw: 'SP CARDAMOM GREEN 2LB', clean: 'Green Cardamom 2lb', price: 64.99 },
  { raw: 'SP SAFFRON 1OZ', clean: 'Saffron 1oz', price: 89.99 },
  { raw: 'SP FENUGREEK 5LB', clean: 'Fenugreek 5lb', price: 18.99 },
  { raw: 'SP MUSTARD SEED 5LB', clean: 'Mustard Seed 5lb', price: 16.99 },
  { raw: 'BASMATI RICE 2/20LB', clean: 'Basmati Rice 2/20lb', price: 64.99 },
  { raw: 'FLOUR ATTA 4/10LB', clean: 'Atta Flour 4/10lb', price: 32.99 },
  { raw: 'PANEER 12/1LB', clean: 'Paneer 12/1lb', price: 58.99 },
  { raw: 'LENTIL TOOR 20LB', clean: 'Toor Dal 20lb', price: 27.99 },
  { raw: 'LENTIL CHANA 20LB', clean: 'Chana Dal 20lb', price: 24.99 },
  { raw: 'SP TAMARIND PASTE 5LB', clean: 'Tamarind Paste 5lb', price: 21.99 },
  { raw: 'SP CURRY LEAF DRIED 2LB', clean: 'Dried Curry Leaves 2lb', price: 26.99 },
  { raw: 'GHEE 4/1GAL', clean: 'Ghee 4/1gal', price: 72.99 },
]

// --- Seeded RNG (mulberry32) ----------------------------------------------
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Line = { item: Item; qty: number; total: number }
type Invoice = { vendor: string; number: string; date: string; lines: Line[]; total: number }

export type { Line, Invoice }

function buildInvoice(
  vendor: string, number: string, date: string,
  catalog: Item[], lineCount: number, qtyMin: number, qtyMax: number,
  rng: () => number,
): Invoice {
  const picked = [...catalog].sort(() => rng() - 0.5).slice(0, lineCount)
  const lines: Line[] = picked.map((item) => {
    const qty = qtyMin + Math.floor(rng() * (qtyMax - qtyMin + 1))
    return { item, qty, total: Math.round(item.price * qty * 100) / 100 }
  })
  const total = Math.round(lines.reduce((s, l) => s + l.total, 0) * 100) / 100
  return { vendor, number, date, lines, total }
}

/** Build the September invoice set. Exported so the SQL seed exporter
 *  reuses the exact same numbers as the --write path. */
export function buildSeptember(rng: () => number): Invoice[] {
  const invoices: Invoice[] = []
  // Weekly Restaurant Depot runs (Thursdays)
  const rdDates = ['2026-09-03', '2026-09-10', '2026-09-17', '2026-09-24']
  rdDates.forEach((date, i) => {
    invoices.push(buildInvoice(
      'Restaurant Depot', `RD-SEP26-${String(i + 1).padStart(3, '0')}`, date,
      RD_ITEMS, 20 + Math.floor(rng() * 5), 3, 8, rng,
    ))
  })
  // Biweekly Indian wholesale runs
  const spDates = ['2026-09-08', '2026-09-22']
  spDates.forEach((date, i) => {
    invoices.push(buildInvoice(
      'Apna Bazaar Wholesale', `AB-0926-${String(i + 1).padStart(3, '0')}`, date,
      SPECIALTY_ITEMS, 10 + Math.floor(rng() * 3), 3, 6, rng,
    ))
  })
  return invoices.sort((a, b) => a.date.localeCompare(b.date))
}

function getArg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main(): Promise<void> {
  const seed = Number(getArg('--seed') ?? '7')
  const write = process.argv.includes('--write')
  const restaurantId = getArg('--restaurant-id')
  const rng = mulberry32(seed)
  const invoices = buildSeptember(rng)

  const monthTotal = invoices.reduce((s, i) => s + i.total, 0)
  console.log(`Seeded invoices for September 2026 (seed ${seed}):\n`)
  console.log('date        vendor                  number        lines      total')
  for (const inv of invoices) {
    console.log(
      `${inv.date}  ${inv.vendor.padEnd(22)}  ${inv.number.padEnd(12)}  ${String(inv.lines.length).padStart(3)}  $${inv.total.toFixed(2).padStart(9)}`,
    )
  }
  console.log(`\nSeptember invoice spend: $${monthTotal.toFixed(2)}`)
  console.log(`Implied food cost vs $78,199.06 September sales: ${(monthTotal / 78199.06 * 100).toFixed(1)}%`)

  // Category sanity check on a few raw names
  const sample = ['CHIX BREAST B/S 40LB', 'PROD ONION YLW 50LB', 'BASMATI RICE 2/20LB', 'CONT HINGED 9X9 200CT']
  console.log('\nCategory check:', sample.map((n) => `${n} -> ${categorize(n)}`).join(' | '))

  if (!write) {
    console.log('\nPreview only. Re-run with --write --restaurant-id <uuid> to insert into invoice_files/headers/lines.')
    return
  }
  if (!restaurantId) throw new Error('Pass --restaurant-id <uuid> with --write.')

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!url || !serviceKey) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY.')
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

  // Idempotent: remove previously seeded rows (lines -> headers -> files).
  const { data: oldFiles } = await supabase.from('invoice_files')
    .select('id').eq('restaurant_id', restaurantId).like('drive_file_id', 'seed-turmeric-%')
  const oldFileIds = (oldFiles ?? []).map((f) => f.id)
  if (oldFileIds.length > 0) {
    const { data: oldHeaders } = await supabase.from('invoice_headers')
      .select('id').in('file_id', oldFileIds)
    const oldHeaderIds = (oldHeaders ?? []).map((h) => h.id)
    if (oldHeaderIds.length > 0) {
      const { error } = await supabase.from('invoice_lines').delete().in('header_id', oldHeaderIds)
      if (error) throw new Error('Failed to delete old seeded lines: ' + error.message)
    }
    let err = (await supabase.from('invoice_headers').delete().in('file_id', oldFileIds)).error
    if (err) throw new Error('Failed to delete old seeded headers: ' + err.message)
    err = (await supabase.from('invoice_files').delete().in('id', oldFileIds)).error
    if (err) throw new Error('Failed to delete old seeded files: ' + err.message)
    console.log(`\nRemoved ${oldFileIds.length} previously seeded invoice(s).`)
  }

  let n = 0
  for (const inv of invoices) {
    n++
    const driveFileId = `seed-turmeric-sep26-${n}`
    const { data: fileRow, error: fErr } = await supabase.from('invoice_files').insert({
      restaurant_id: restaurantId,
      drive_file_id: driveFileId,
      filename: `${inv.number}.pdf`,
      file_date: inv.date,
      file_total: inv.total,
      status: 'done',
      source: 'upload', // must satisfy invoice_files_source_check (email|portal|upload|api)
      processed_at: new Date().toISOString(),
    }).select('id').single()
    if (fErr || !fileRow) throw new Error('Failed to insert invoice_files: ' + (fErr?.message ?? 'no row'))

    const { data: header, error: hErr } = await supabase.from('invoice_headers').insert({
      restaurant_id: restaurantId,
      file_id: fileRow.id,
      vendor: inv.vendor,
      invoice_number: inv.number,
      invoice_date: inv.date,
      subtotal: inv.total,
      tax: 0,
      total: inv.total,
    }).select('id').single()
    if (hErr || !header) throw new Error('Failed to insert invoice_headers: ' + (hErr?.message ?? 'no row'))

    const lines = inv.lines.map((l) => ({
      header_id: header.id,
      restaurant_id: restaurantId,
      invoice_date: inv.date,
      item_name: l.item.raw,
      display_name: l.item.clean,
      category: categorize(l.item.raw),
      purchase_unit: 'case',
      unit_qty: 0,
      case_qty: l.qty,
      unit_price: l.item.price,
      total: l.total,
    }))
    const { error: lErr } = await supabase.from('invoice_lines').insert(lines)
    if (lErr) throw new Error('Failed to insert invoice_lines: ' + lErr.message)
    console.log(`Inserted ${inv.number} (${inv.vendor}): $${inv.total.toFixed(2)} — ${lines.length} lines`)
  }
  console.log(`\nDone. ${invoices.length} invoices, $${monthTotal.toFixed(2)} total spend.`)
}

// Only run main() when executed directly (not when imported by export-september-seed.ts).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error('Error:', e.message); process.exit(1) })
}
