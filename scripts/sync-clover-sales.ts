/**
 * Pull daily sales from the Clover sandbox merchant into Supabase.
 *
 * Reads orders in the trailing --days window (default 7), aggregates them
 * with computeDailySales() from lib/clover.ts (net = gross − discounts −
 * refunds, tax excluded — see lib/clover.ts for the full rationale), and
 * upserts one row per day into public.daily_sales on (restaurant_id, date).
 * The dashboard's food-cost-% KPI reads that table.
 *
 * Run:
 *   npx tsx scripts/sync-clover-sales.ts                      # last 7 days
 *   npx tsx scripts/sync-clover-sales.ts --days 30             # last 30 days
 *   npx tsx scripts/sync-clover-sales.ts --restaurant-id <uuid>
 *   npx tsx scripts/sync-clover-sales.ts --dry-run            # preview only
 *
 * Env (checked in .env.local, never committed):
 *   CLOVER_BASE_URL=https://apisandbox.dev.clover.com
 *   CLOVER_MERCHANT_ID=<test merchant UUID>
 *   CLOVER_API_TOKEN=<test API token from the sandbox dev dashboard>
 *   RESTAURANT_ID=<uuid of the restaurant row in Supabase>   (or --restaurant-id)
 *   NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_KEY
 *
 * Uses the service-role key so it can write across restaurants (RLS would
 * otherwise scope to the caller) — same pattern as backfill-categories.ts.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import {
  cloverConfigFromEnv,
  listAllOrders,
  computeDailySales,
} from '../lib/clover'

// --- Minimal .env.local loader (no dotenv dependency) --------------------
function loadEnvLocal(): void {
  let raw: string
  try {
    raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
  } catch {
    return // fall back to whatever is already in process.env
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i)
    if (!m) continue
    const key = m[1]
    let val = m[2].trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = val
  }
}

function getArg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const DRY_RUN = process.argv.includes('--dry-run')

const fmt = (cents: number) =>
  '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

async function main() {
  loadEnvLocal()

  const days = Math.max(1, parseInt(getArg('--days') ?? '7', 10) || 7)
  const restaurantId = getArg('--restaurant-id') ?? process.env.RESTAURANT_ID
  if (!restaurantId) {
    console.error('Missing restaurant id — pass --restaurant-id or set RESTAURANT_ID.')
    process.exit(1)
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!url || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY (checked .env.local).')
    process.exit(1)
  }

  const cfg = cloverConfigFromEnv()
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

  // UTC-midnight window so every order lands on exactly one day.
  const end = new Date()
  end.setUTCHours(0, 0, 0, 0)
  end.setUTCDate(end.getUTCDate() + 1) // include all of today
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - days)
  const sinceTs = start.getTime()
  const untilTs = end.getTime()

  console.log(
    `Pulling orders from ${start.toISOString().slice(0, 10)} to ${end
      .toISOString()
      .slice(0, 10)} (${days}d)…`,
  )
  const orders = await listAllOrders(cfg, { sinceTs, untilTs })
  console.log(`  fetched ${orders.length} orders`)

  const daily = computeDailySales(orders)
  if (daily.length === 0) {
    console.log('No orders in window — nothing to sync.')
    return
  }

  for (const d of daily) {
    console.log(
      `  ${d.date}: ${d.orderCount} orders  gross ${fmt(d.grossCents)}  ` +
        `disc ${fmt(d.discountCents)}  refunds ${fmt(d.refundCents)}  net ${fmt(d.netCents)}`,
    )
  }

  if (DRY_RUN) {
    console.log('DRY RUN — wrote nothing.')
    return
  }

  const rows = daily.map((d) => ({
    restaurant_id: restaurantId,
    date: d.date,
    gross_cents: d.grossCents,
    discount_cents: d.discountCents,
    refund_cents: d.refundCents,
    net_cents: d.netCents,
    order_count: d.orderCount,
    source: 'clover',
  }))

  const { error } = await supabase
    .from('daily_sales')
    .upsert(rows, { onConflict: 'restaurant_id,date' })
  if (error) {
    console.error('Upsert failed:', error.message)
    process.exit(1)
  }
  console.log(`Upserted ${rows.length} daily_sales rows for restaurant ${restaurantId}.`)
}

main().catch((err) => {
  console.error('Sync failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
