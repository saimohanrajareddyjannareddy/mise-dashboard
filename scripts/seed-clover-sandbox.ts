/**
 * Seed the Clover SANDBOX test merchant with realistic sales history.
 *
 * Creates ~N days of orders (default 7, ending yesterday) with backdated
 * `clientCreatedTime` values, realistic menu items, weekday/weekend volume
 * patterns, a day with order-level discounts, and one order with a partial
 * refund — so the sync script and food-cost-% KPI have something to chew on.
 *
 * Run:
 *   npx tsx scripts/seed-clover-sandbox.ts            # seed 7 days
 *   npx tsx scripts/seed-clover-sandbox.ts --days 30 # seed 30 days
 *   npx tsx scripts/seed-clover-sandbox.ts --clean   # delete seeded orders
 *
 * Env (checked in .env.local, never committed):
 *   CLOVER_BASE_URL=https://apisandbox.dev.clover.com
 *   CLOVER_MERCHANT_ID=<test merchant UUID>
 *   CLOVER_API_TOKEN=<test API token from the sandbox dev dashboard>
 *
 * Created order IDs are tracked in scripts/.clover-seed.json (gitignored)
 * so --clean can delete exactly what was seeded. NOTE: deleting an order
 * that already had a refund/payment only deletes the order record — the
 * --clean pass is best-effort (it reports failures instead of aborting).
 *
 * This script only talks to Clover. Run scripts/sync-clover-sales.ts after
 * to pull the seeded orders into Supabase's daily_sales table.
 */
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  cloverConfigFromEnv,
  getCashTenderId,
  createOrder,
  addLineItems,
  addOrderDiscount,
  updateOrderTotal,
  createPayment,
  createRefund,
  lockOrder,
  deleteOrder,
  type CloverConfig,
  type SeedLineItem,
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

// --- Deterministic RNG so re-runs produce stable-ish data -----------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const TRACK_FILE = resolve(process.cwd(), 'scripts', '.clover-seed.json')

function loadTracked(): string[] {
  try {
    return JSON.parse(readFileSync(TRACK_FILE, 'utf-8')) as string[]
  } catch {
    return []
  }
}

function saveTracked(ids: string[]): void {
  writeFileSync(TRACK_FILE, JSON.stringify(ids, null, 2) + '\n')
}

// --- Menu: [name, priceCents, popularity weight] -----------------------------
// Prefers scripts/turmeric-menu.json (the real restaurant menu) when present;
// falls back to a small generic menu otherwise.
function loadMenu(): Array<[string, number, number]> {
  try {
    const raw = readFileSync(new URL('./turmeric-menu.json', import.meta.url), 'utf-8')
    const items = JSON.parse(raw) as Array<{ name: string; priceCents: number; weight: number }>
    if (items.length > 0) {
      console.log(`Using turmeric-menu.json (${items.length} items).`)
      return items.map((i) => [i.name, i.priceCents, i.weight] as [string, number, number])
    }
  } catch {
    /* fall through to the generic menu */
  }
  console.log('turmeric-menu.json not found — using the generic menu.')
  return [
    ['Margherita Pizza', 1499, 10],
    ['Cheeseburger', 1299, 12],
    ['Caesar Salad', 1099, 6],
    ['Chicken Tenders', 999, 11],
    ['Pasta Alfredo', 1399, 7],
    ['Garlic Bread', 599, 8],
    ['French Fries', 499, 14],
    ['Soft Drink', 299, 16],
    ['Iced Coffee', 450, 7],
    ['Chocolate Cake', 699, 4],
  ]
}

const MENU: Array<[string, number, number]> = loadMenu()

const TOTAL_WEIGHT = MENU.reduce((s, m) => s + m[2], 0)

function pickItem(rand: () => number): [string, number] {
  let roll = rand() * TOTAL_WEIGHT
  for (const [name, price, weight] of MENU) {
    roll -= weight
    if (roll <= 0) return [name, price]
  }
  return [MENU[0][0], MENU[0][1]]
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function getArg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function clean(cfg: CloverConfig): Promise<void> {
  const ids = loadTracked()
  if (ids.length === 0) {
    console.log('Nothing tracked — nothing to clean.')
    return
  }
  console.log(`Deleting ${ids.length} seeded orders…`)
  let ok = 0
  for (const id of ids) {
    try {
      await deleteOrder(cfg, id)
      ok++
    } catch (err) {
      console.error(`  ✗ ${id}: ${(err as Error).message}`)
    }
    await sleep(50)
  }
  console.log(`Deleted ${ok}/${ids.length}.`)
  try {
    unlinkSync(TRACK_FILE)
  } catch {
    /* already gone */
  }
}

async function seed(days: number): Promise<void> {
  loadEnvLocal()
  const cfg = cloverConfigFromEnv()
  const tenderId = await getCashTenderId(cfg)
  console.log(`Seeding ${days} days of sandbox orders on merchant ${cfg.merchantId}…`)

  const tracked: string[] = loadTracked()
  const rand = mulberry32(20261001)

  // Discount day = 3rd seeded day; refund order = last seeded day.
  const discountDayIdx = 2
  const refundDayIdx = days - 1

  const now = new Date()
  let seededOrders = 0

  for (let d = days; d >= 1; d--) {
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    day.setUTCDate(day.getUTCDate() - d)
    const dow = day.getUTCDay() // 0 = Sunday
    const isWeekend = dow === 0 || dow === 5 || dow === 6
    // Realistic volume: lunch + dinner rush, busier on weekends.
    const orderCount = Math.round(
      (isWeekend ? 34 : 22) + (rand() * 12 - 6),
    )
    const dayIdx = days - d
    const dayLabel = day.toISOString().slice(0, 10)

    for (let i = 0; i < orderCount; i++) {
      // Spread orders across 11:00–21:30 UTC (lunch + dinner rushes).
      const rush = rand()
      const hour = rush < 0.4 ? 11 + Math.floor(rand() * 3) : 17 + Math.floor(rand() * 4)
      const minute = Math.floor(rand() * 60)
      const clientCreatedTime = Date.UTC(
        day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour, minute,
      )

      const itemCount = 1 + Math.floor(rand() * 3)
      const items: SeedLineItem[] = []
      const seen = new Set<string>()
      for (let k = 0; k < itemCount; k++) {
        const [name, price] = pickItem(rand)
        if (seen.has(name)) continue
        seen.add(name)
        items.push({ name, priceCents: price, qty: 1 + Math.floor(rand() * 2) })
      }

      const gross = items.reduce((s, it) => s + it.priceCents * it.qty, 0)
      const order = await createOrder(cfg, { totalCents: gross, clientCreatedTime })
      const orderId = order.id
      if (!orderId) {
        console.error('  ✗ order creation returned no id — skipping')
        continue
      }
      tracked.push(orderId)

      await addLineItems(cfg, orderId, items)

      // Discount day: 10% off every 3rd order ("staff meal" promo).
      let discount = 0
      if (dayIdx === discountDayIdx && i % 3 === 0) {
        discount = Math.round(gross * 0.1)
        await addOrderDiscount(cfg, orderId, 'Staff meal 10%', -discount)
      }

      const total = gross - discount
      await updateOrderTotal(cfg, orderId, total).catch((err) =>
        console.error(`  ⚠ total update failed for ${orderId}: ${(err as Error).message}`),
      )

      // Cash payment for the full (post-discount) total.
      const payment = await createPayment(cfg, orderId, tenderId, total).catch((err) => {
        console.error(`  ⚠ payment failed for ${orderId}: ${(err as Error).message}`)
        return null
      })

      // One partial refund on the last seeded day (customer complaint, $8.50).
      if (dayIdx === refundDayIdx && i === 0 && payment?.id) {
        await createRefund(cfg, orderId, payment.id, 850).catch((err) =>
          console.error(`  ⚠ refund failed for ${orderId}: ${(err as Error).message}`),
        )
      }

      await lockOrder(cfg, orderId).catch(() => {
        /* cosmetic only — an unlocked order still syncs fine */
      })

      seededOrders++
      if (seededOrders % 25 === 0) process.stdout.write(`  ${seededOrders} orders…\n`)
      await sleep(50) // be polite to the sandbox API
    }

    console.log(`  ${dayLabel}: ${orderCount} orders`)
    saveTracked(tracked) // incremental — a crash mid-run still leaves --clean working
  }

  console.log(`\nDone — ${seededOrders} orders seeded.`)
  console.log('Next: npx tsx scripts/sync-clover-sales.ts --days ' + days)
}

async function main() {
  loadEnvLocal()

  if (process.argv.includes('--clean')) {
    await clean(cloverConfigFromEnv())
    return
  }
  const days = Math.max(1, parseInt(getArg('--days') ?? '7', 10) || 7)
  await seed(days)
}

main().catch((err) => {
  console.error('Seed failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
