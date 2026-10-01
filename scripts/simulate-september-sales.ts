/**
 * simulate-september-sales.ts
 *
 * Menu-driven September 2026 sales simulation for the sandbox test restaurant.
 *
 * Why this exists: Clover's API ignores backdated `clientCreatedTime` (verified
 * 2026-10-01), so September-dated orders cannot be created through Clover. The
 * Clover pull + net-sales math is already proven against live sandbox data;
 * this script generates a realistic September (Sep 1–30) from the restaurant's
 * real menu so the dashboard's food-cost-% KPI can be tested against a full
 * month of sales + the user's real September invoices.
 *
 * Usage:
 *   npx tsx scripts/simulate-september-sales.ts                 # preview only
 *   npx tsx scripts/simulate-september-sales.ts --write \
 *     --restaurant-id <uuid> [--seed 42]                        # upsert rows
 *
 * Reads the menu from scripts/turmeric-menu.json:
 *   [{ "name": "...", "priceCents": 1499, "category": "Entrees", "weight": 3 }]
 * `weight` = relative popularity (higher = ordered more often).
 *
 * Calibration (from the owner, 2026-10-01):
 *   weekday (Mon–Thu): $1,500–$2,500 net/day
 *   weekend (Fri–Sun): $3,000–$4,000 net/day
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

interface MenuItem {
  name: string
  priceCents: number
  category: string
  weight: number
}

export type { MenuItem }

interface DayRow {
  date: string
  orderCount: number
  grossCents: number
  discountCents: number
  refundCents: number
  netCents: number
}

export type { DayRow }

/** Deterministic RNG so a seed reproduces the same month. */
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pickWeighted<T extends { weight: number }>(rng: () => number, items: T[]): T {
  const total = items.reduce((s, i) => s + i.weight, 0)
  let r = rng() * total
  for (const it of items) {
    r -= it.weight
    if (r <= 0) return it
  }
  return items[items.length - 1]
}

export function simulateDay(
  date: Date,
  menu: MenuItem[],
  rng: () => number,
  itemSales: Map<string, number>,
): DayRow {
  const dow = date.getUTCDay() // 0=Sun … 6=Sat
  const isWeekend = dow === 0 || dow === 5 || dow === 6
  const targetNet = isWeekend
    ? 300_000 + Math.floor(rng() * 100_001) // $3,000–$4,000
    : 150_000 + Math.floor(rng() * 100_001) // $1,500–$2,500

  let gross = 0
  let discounts = 0
  let orderCount = 0
  let net = 0

  // Build orders until the day's net target is reached.
  while (net < targetNet) {
    const itemCount = 1 + Math.floor(rng() * 3) // 1–3 distinct items
    const seen = new Set<string>()
    let orderGross = 0
    for (let k = 0; k < itemCount; k++) {
      const item = pickWeighted(rng, menu)
      if (seen.has(item.name)) continue
      seen.add(item.name)
      const qty = rng() < 0.25 ? 2 : 1
      orderGross += item.priceCents * qty
      itemSales.set(item.name, (itemSales.get(item.name) ?? 0) + item.priceCents * qty)
    }
    if (orderGross === 0) continue
    // ~8% of orders get 10% off (coupon / happy-hour).
    const discount = rng() < 0.08 ? Math.round(orderGross * 0.1) : 0
    gross += orderGross
    discounts += discount
    net += orderGross - discount
    orderCount++
  }

  // Occasional partial refund (~2 per month).
  const refund = rng() < 0.07 ? 1000 + Math.floor(rng() * 3001) : 0 // $10–$40

  return {
    date: date.toISOString().slice(0, 10),
    orderCount,
    grossCents: gross,
    discountCents: discounts,
    refundCents: refund,
    netCents: gross - discounts - refund,
  }
}

/** Build the full 30-day September simulation. Exported so the SQL seed
 *  exporter reuses the exact same numbers as the --write path. */
export function simulateSeptember(seed: number): { days: DayRow[]; itemSales: Map<string, number> } {
  const menu: MenuItem[] = JSON.parse(
    readFileSync(new URL('./turmeric-menu.json', import.meta.url), 'utf-8'),
  )
  if (!menu.length) throw new Error('Menu is empty — fill scripts/turmeric-menu.json first.')
  const rng = mulberry32(seed)
  const days: DayRow[] = []
  const itemSales = new Map<string, number>()
  for (let d = 1; d <= 30; d++) {
    days.push(simulateDay(new Date(Date.UTC(2026, 8, d)), menu, rng, itemSales))
  }
  return { days, itemSales }
}

async function main() {
  const args = process.argv.slice(2)
  const write = args.includes('--write')
  const seedArg = args[args.indexOf('--seed') + 1]
  const seed = seedArg ? parseInt(seedArg, 10) : 42
  const restArg = args[args.indexOf('--restaurant-id') + 1]

  const menu: MenuItem[] = JSON.parse(
    readFileSync(new URL('./turmeric-menu.json', import.meta.url), 'utf-8'),
  )
  if (!menu.length) throw new Error('Menu is empty — fill scripts/turmeric-menu.json first.')

  const rng = mulberry32(seed)
  const days: DayRow[] = []
  const itemSales = new Map<string, number>()
  for (let d = 1; d <= 30; d++) {
    const date = new Date(Date.UTC(2026, 8, d))
    days.push(simulateDay(date, menu, rng, itemSales))
  }

  const fmt = (c: number) => '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })
  let totNet = 0
  let totOrders = 0
  console.log('date        orders      gross   discount    refunds        net')
  for (const day of days) {
    totNet += day.netCents
    totOrders += day.orderCount
    const dow = new Date(day.date + 'T00:00:00Z').toLocaleDateString('en-US', {
      weekday: 'short',
      timeZone: 'UTC',
    })
    console.log(
      `${day.date} (${dow})  ${String(day.orderCount).padStart(4)}  ` +
        `${fmt(day.grossCents).padStart(9)}  ${fmt(day.discountCents).padStart(7)}  ` +
        `${fmt(day.refundCents).padStart(7)}  ${fmt(day.netCents).padStart(9)}`,
    )
  }
  const weekends = days.filter((d) => [0, 5, 6].includes(new Date(d.date + 'T00:00:00Z').getUTCDay()))
  const weekdays = days.filter((d) => ![0, 5, 6].includes(new Date(d.date + 'T00:00:00Z').getUTCDay()))
  const avg = (rows: DayRow[]) => rows.reduce((s, r) => s + r.netCents, 0) / rows.length
  console.log(`\nMonth net sales: ${fmt(totNet)} across ${totOrders} orders`)
  console.log(`Avg weekday net: ${fmt(Math.round(avg(weekdays)))} (target $1,500–$2,500)`)
  console.log(`Avg weekend net: ${fmt(Math.round(avg(weekends)))} (target $3,000–$4,000)`)
  console.log('\nTop 10 sellers (proof the Turmeric menu drove the month):')
  const top = [...itemSales.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
  for (const [name, cents] of top) console.log(`  ${fmt(cents).padStart(9)}  ${name}`)

  if (!write) {
    console.log('\nPreview only. Re-run with --write --restaurant-id <uuid> to upsert into daily_sales.')
    return
  }
  if (!restArg) throw new Error('--write requires --restaurant-id <uuid>')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!url || !serviceKey) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY.')

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })
  const rows = days.map((d) => ({
    restaurant_id: restArg,
    date: d.date,
    gross_cents: d.grossCents,
    discount_cents: d.discountCents,
    refund_cents: d.refundCents,
    net_cents: d.netCents,
    order_count: d.orderCount,
    source: 'simulated',
  }))
  const { error } = await supabase.from('daily_sales').upsert(rows, {
    onConflict: 'restaurant_id,date',
  })
  if (error) throw error
  console.log(`\nUpserted ${rows.length} simulated daily_sales rows for restaurant ${restArg}.`)
}

// Only run main() when executed directly (not when imported by export-september-seed.ts).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
}
