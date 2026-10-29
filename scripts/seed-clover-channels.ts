/**
 * Seed the Clover SANDBOX test merchant with CHANNEL-TAGGED orders:
 * creates the merchant's order types (Dine In / To Go / Delivery) if
 * missing, then places orders that carry an order type and are paid
 * with a mix of Cash and Credit Card tenders — so the dashboard's
 * Sales breakdown (by channel / by payment) has real splits to show.
 *
 * The previously seeded orders carry no order type and were all paid
 * with the cash tender; they will honestly show as Unspecified/Cash.
 *
 * Run (via with_creds.py so the connector surrogate applies):
 *   python3 ~/workspace/skills/clover-sandbox/bin/with_creds.py \
 *     npx tsx scripts/seed-clover-channels.ts
 *
 * Created order IDs are tracked in scripts/.clover-channels.json.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import {
  cloverConfigFromEnv,
  createOrder,
  addLineItems,
  updateOrderTotal,
  createPayment,
  lockOrder,
  deleteOrder,
  type CloverConfig,
  type SeedLineItem,
} from '../lib/clover'

interface MenuItem {
  category: string
  name: string
  priceCents: number
  weight: number
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

async function api(
  cfg: CloverConfig,
  method: string,
  path: string,
  body?: unknown
): Promise<any> {
  const resp = await fetch(`${cfg.baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.apiToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!resp.ok) {
    throw new Error(`Clover ${method} ${path} → ${resp.status}: ${await resp.text()}`)
  }
  return resp.status === 204 ? null : resp.json()
}

async function main() {
  const cfg = cloverConfigFromEnv()
  const m = cfg.merchantId
  console.log(`Merchant: ${m} via ${cfg.baseUrl}`)

  // 1) Order types — create the standard three if absent.
  const wanted = ['Dine In', 'To Go', 'Delivery']
  const existing = await api(cfg, 'GET', `/v3/merchants/${m}/order_types`)
  const typeIds = new Map<string, string>()
  for (const t of existing.elements ?? []) {
    if (t.label && t.id) typeIds.set(t.label, t.id)
  }
  for (const label of wanted) {
    if (!typeIds.has(label)) {
      const created = await api(cfg, 'POST', `/v3/merchants/${m}/order_types`, { label })
      typeIds.set(label, created.id)
      console.log(`Created order type: ${label} (${created.id})`)
    }
  }
  console.log('Order types:', Object.fromEntries(typeIds))

  // 2) Tenders — cash + credit card ids.
  const tenders = await api(cfg, 'GET', `/v3/merchants/${m}/tenders`)
  const byKey = new Map<string, string>()
  for (const t of tenders.elements ?? []) {
    if (t.labelKey && t.id) byKey.set(t.labelKey, t.id)
  }
  const cashId = byKey.get('com.clover.tender.cash')
  // NOTE: Clover's API rejects native credit/debit payments ("use an
  // external tender type"), so card sales are simulated with the
  // External Payment tender. On a real register they arrive as
  // Credit Card \u2014 the breakdown reads whatever label Clover sends.
  const cardId = byKey.get('com.clover.tender.external_payment')
  if (!cashId || !cardId) throw new Error('Cash or External Payment tender not found')
  console.log(`Tenders: cash=${cashId} card-sim=${cardId}`)

  // 3) Orders — 30, deterministic mix.
  const menu = JSON.parse(
    readFileSync(new URL('./turmeric-menu.json', import.meta.url), 'utf-8')
  ) as MenuItem[]
  const rnd = mulberry32(11)
  const createdIds: string[] = []
  const N = 30
  for (let i = 0; i < N; i++) {
    const typeLabel = i < 15 ? 'Dine In' : i < 25 ? 'To Go' : 'Delivery'
    const tenderId = i % 5 < 2 ? cashId : cardId
    const tenderLabel = tenderId === cashId ? 'Cash' : 'Card (External Payment)'

    const itemCount = 1 + Math.floor(rnd() * 3)
    const items: SeedLineItem[] = []
    let total = 0
    const used = new Set<number>()
    for (let k = 0; k < itemCount; k++) {
      let idx = Math.floor(rnd() * menu.length)
      while (used.has(idx)) idx = Math.floor(rnd() * menu.length)
      used.add(idx)
      const qty = 1 + Math.floor(rnd() * 2)
      items.push({ name: menu[idx].name, priceCents: menu[idx].priceCents, qty })
      total += menu[idx].priceCents * qty
    }

    const order = await createOrder(cfg, { totalCents: total })
    if (!order.id) throw new Error('Order create returned no id')
    try {
      await api(cfg, 'POST', `/v3/merchants/${m}/orders/${order.id}`, {
        orderType: { id: typeIds.get(typeLabel) },
      })
      await addLineItems(cfg, order.id, items)
      await updateOrderTotal(cfg, order.id, total)
      await createPayment(cfg, order.id, tenderId, total)
      await lockOrder(cfg, order.id)
    } catch (e) {
      console.error(`Order ${order.id} failed mid-seed, deleting:`, (e as Error).message)
      await deleteOrder(cfg, order.id).catch(() => {})
      continue
    }
    createdIds.push(order.id)
    console.log(
      `${i + 1}/${N} ${order.id} ${typeLabel} · ${tenderLabel} · $${(total / 100).toFixed(2)}`
    )
    await new Promise((r) => setTimeout(r, 150))
  }

  writeFileSync(
    new URL('./.clover-channels.json', import.meta.url),
    JSON.stringify(createdIds, null, 2)
  )
  console.log(`Done: ${createdIds.length} channel-tagged orders created.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
