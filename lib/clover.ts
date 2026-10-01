/**
 * Clover POS REST API client (v3).
 *
 * Verified against the official Clover docs (docs.clover.com, 2026-10-01):
 * - Sandbox base URL: https://apisandbox.dev.clover.com
 *   (production US: https://api.clover.com)
 * - Auth: `Authorization: Bearer <api-token>` header
 *   ("Use test API tokens in sandbox" — test API tokens are sandbox-only;
 *   production web apps must use OAuth expiring tokens.)
 * - List orders: GET /v3/merchants/{mId}/orders
 *   ?filter=createdTime>=<ms-epoch>&expand=lineItems,discounts,payments,refunds
 *   &limit=<n>&offset=<n>
 *   (`filter=` syntax per "Create custom orders" tutorial, e.g.
 *   `filter=deletedTime>=1596501066`; expandable fields per "Use expandable
 *   fields"; limit/offset per the REST conventions used across the API.)
 * - All money amounts are in CENTS (e.g. $20.99 -> 2099).
 * - Create order: POST /v3/merchants/{mId}/orders
 *   { state: "Open", currency: "USD", taxRemoved: "false", total: <cents>,
 *     clientCreatedTime: <ms-epoch> }
 * - Add line items (bulk): POST .../orders/{orderId}/bulk_line_items
 *   { items: [{ name, price, ... }] }  (ad-hoc items need no inventory id)
 * - Order-level discount: POST .../orders/{orderId}/discounts
 *   { name, amount: <negative cents> | percentage: <n> }
 *   (discount amounts are NEGATIVE, e.g. "$2 Tuesday" -> amount: -200)
 * - Update order total: POST .../orders/{orderId} { total: <cents> }
 *   (Clover does not auto-recalculate totals after API-side edits.)
 * - Create payment: POST .../orders/{orderId}/payments
 *   { amount: <cents>, tender: { id: <tenderId> } }
 *   (shape confirmed from real-world integrations; cash tender works via API —
 *   card tenders are rejected from the API and must go through a device.)
 * - Refund by amount: POST .../orders/{orderId}/refunds
 *   { refunds: { elements: [{ amount: <cents>, payment: { id } }] } }
 *   (per the official v304 release notes.)
 * - Tenders: GET /v3/merchants/{mId}/tenders — the cash tender carries
 *   labelKey "com.clover.tender.cash" (per "Accept payments and tips").
 * - Delete order: DELETE .../orders/{orderId} (used by the seeder --clean).
 *
 * What was NOT verifiable from the official docs (flagged, not assumed):
 * - The server-side maximum `limit` for list calls. We default to 1000 and
 *   paginate with offset, stopping when a page comes back short — safe
 *   regardless of the true max.
 * - Whether `clientCreatedTime` on order creation backdates the server's
 *   `createdTime`. We send it (harmless if ignored) and bucket sales by
 *   `clientCreatedTime ?? createdTime`, so seeded backdated orders land on
 *   the right day either way.
 * - Per-line-item discounts on the LIST endpoint. Docs say line-item
 *   discounts require expanding `discounts` on the line-items endpoint
 *   ("use the Get all line items for an order endpoint with the discounts
 *   field expanded"), so computeDailySales sums order-level discounts plus
 *   any line-item discounts present in the payload, and documents the gap.
 */

export interface CloverConfig {
  /** e.g. https://apisandbox.dev.clover.com (no trailing slash) */
  baseUrl: string
  merchantId: string
  apiToken: string
}

/** Build config from env. Throws with a helpful message when unset. */
export function cloverConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): CloverConfig {
  const baseUrl = (env.CLOVER_BASE_URL ?? 'https://apisandbox.dev.clover.com').replace(
    /\/+$/,
    '',
  )
  const merchantId = env.CLOVER_MERCHANT_ID ?? ''
  const apiToken = env.CLOVER_API_TOKEN ?? ''
  if (!merchantId) throw new Error('CLOVER_MERCHANT_ID is not set')
  if (!apiToken) throw new Error('CLOVER_API_TOKEN is not set')
  return { baseUrl, merchantId, apiToken }
}

// ---------------------------------------------------------------------------
// Wire types (subset of the v3 order model we actually use)
// ---------------------------------------------------------------------------

export interface CloverDiscount {
  id?: string
  name?: string
  /** Clover stores discount amounts as NEGATIVE cents (e.g. -200 = $2 off). */
  amount?: number
  percentage?: number
}

export interface CloverLineItem {
  id?: string
  name?: string
  /** Per-unit price in cents. */
  price?: number
  /** Quantity — v3 uses `unitQty`; some payloads expose `quantity`. */
  unitQty?: number
  quantity?: number
  discounts?: { elements?: CloverDiscount[] }
}

export interface CloverPayment {
  id?: string
  /** Amount in cents (positive). */
  amount?: number
  tipAmount?: number
  taxAmount?: number
  result?: string
  createdTime?: number
}

export interface CloverRefund {
  id?: string
  /** Amount in cents (positive). */
  amount?: number
  createdTime?: number
}

export interface CloverOrder {
  id?: string
  state?: string
  /** Server-stamped creation time, ms since epoch. */
  createdTime?: number
  /** Client-stamped creation time, ms since epoch (settable on create). */
  clientCreatedTime?: number
  modifiedTime?: number
  /** Order total in cents — can be STALE after API-side edits. */
  total?: number
  taxAmount?: number
  currency?: string
  lineItems?: { elements?: CloverLineItem[] }
  discounts?: { elements?: CloverDiscount[] }
  payments?: { elements?: CloverPayment[] }
  refunds?: { elements?: CloverRefund[] }
}

export interface CloverTender {
  id?: string
  label?: string
  labelKey?: string
}

export class CloverApiError extends Error {
  constructor(
    public status: number,
    public path: string,
    public body: string,
  ) {
    super(`Clover API ${status} on ${path}: ${body.slice(0, 300)}`)
    this.name = 'CloverApiError'
  }
}

// ---------------------------------------------------------------------------
// Low-level fetch
// ---------------------------------------------------------------------------

async function cloverFetch(
  cfg: CloverConfig,
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const resp = await fetch(`${cfg.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${cfg.apiToken}`,
      Accept: 'application/json',
      ...(init.headers ?? {}),
    },
  })
  if (!resp.ok) {
    throw new CloverApiError(resp.status, path, await resp.text())
  }
  const text = await resp.text()
  return text ? (JSON.parse(text) as unknown) : null
}

function ordersPath(cfg: CloverConfig): string {
  return `/v3/merchants/${cfg.merchantId}/orders`
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export interface ListOrdersOptions {
  /** ms epoch — maps to `filter=createdTime>=<ts>` */
  sinceTs: number
  /** ms epoch — maps to `filter=createdTime<<ts>` (ANDed with sinceTs) */
  untilTs?: number
  expand?: string
  limit?: number
  offset?: number
}

export async function listOrders(
  cfg: CloverConfig,
  opts: ListOrdersOptions,
): Promise<{ elements: CloverOrder[] }> {
  const params = new URLSearchParams()
  // NOTE: Clover does not support comma-joined range filters on the same field
  // (e.g. `createdTime>=X,createdTime<Y` 400s). Use two `filter` params instead.
  params.append('filter', `createdTime>=${opts.sinceTs}`)
  if (opts.untilTs != null) params.append('filter', `createdTime<${opts.untilTs}`)
  params.set('expand', opts.expand ?? 'lineItems,discounts,payments,refunds')
  params.set('limit', String(opts.limit ?? 1000))
  params.set('offset', String(opts.offset ?? 0))
  const body = (await cloverFetch(
    cfg,
    `${ordersPath(cfg)}?${params.toString()}`,
  )) as { elements?: CloverOrder[] }
  return { elements: body.elements ?? [] }
}

/** Fetch every page for the window. Stops when a page comes back short. */
export async function listAllOrders(
  cfg: CloverConfig,
  opts: Omit<ListOrdersOptions, 'limit' | 'offset'> & { pageSize?: number },
): Promise<CloverOrder[]> {
  const pageSize = opts.pageSize ?? 500
  const all: CloverOrder[] = []
  let offset = 0
  for (;;) {
    const { elements } = await listOrders(cfg, { ...opts, limit: pageSize, offset })
    all.push(...elements)
    if (elements.length < pageSize) break
    offset += pageSize
  }
  return all
}

export async function getTenders(cfg: CloverConfig): Promise<CloverTender[]> {
  const body = (await cloverFetch(
    cfg,
    `/v3/merchants/${cfg.merchantId}/tenders`,
  )) as { elements?: CloverTender[] }
  return body.elements ?? []
}

/** Find the cash tender (labelKey com.clover.tender.cash), else first tender. */
export async function getCashTenderId(cfg: CloverConfig): Promise<string> {
  const tenders = await getTenders(cfg)
  const cash =
    tenders.find((t) => t.labelKey === 'com.clover.tender.cash') ??
    tenders.find((t) => (t.label ?? '').toLowerCase() === 'cash') ??
    tenders[0]
  if (!cash?.id) throw new Error('No usable tender found on this merchant')
  return cash.id
}

// ---------------------------------------------------------------------------
// Writes (used by the sandbox seeder)
// ---------------------------------------------------------------------------

export async function createOrder(
  cfg: CloverConfig,
  args: { totalCents: number; clientCreatedTime?: number },
): Promise<CloverOrder> {
  return (await cloverFetch(cfg, ordersPath(cfg), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      state: 'Open',
      currency: 'USD',
      taxRemoved: 'false',
      total: args.totalCents,
      ...(args.clientCreatedTime != null
        ? { clientCreatedTime: args.clientCreatedTime }
        : {}),
    }),
  })) as CloverOrder
}

export interface SeedLineItem {
  name: string
  /** per-unit price in cents */
  priceCents: number
  qty: number
}

/** Bulk-add ad-hoc line items (one entry per unit — avoids qty-field ambiguity). */
export async function addLineItems(
  cfg: CloverConfig,
  orderId: string,
  items: SeedLineItem[],
): Promise<void> {
  const expanded = items.flatMap((it) =>
    Array.from({ length: it.qty }, () => ({ name: it.name, price: it.priceCents })),
  )
  await cloverFetch(cfg, `${ordersPath(cfg)}/${orderId}/bulk_line_items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: expanded }),
  })
}

/** amountCents must be NEGATIVE (Clover convention, e.g. -500 = $5 off). */
export async function addOrderDiscount(
  cfg: CloverConfig,
  orderId: string,
  name: string,
  amountCents: number,
): Promise<void> {
  await cloverFetch(cfg, `${ordersPath(cfg)}/${orderId}/discounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, amount: amountCents }),
  })
}

/** Recalculate the order total after API-side edits (Clover won't do it). */
export async function updateOrderTotal(
  cfg: CloverConfig,
  orderId: string,
  totalCents: number,
): Promise<void> {
  await cloverFetch(cfg, `${ordersPath(cfg)}/${orderId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ total: totalCents }),
  })
}

export async function createPayment(
  cfg: CloverConfig,
  orderId: string,
  tenderId: string,
  amountCents: number,
): Promise<CloverPayment> {
  return (await cloverFetch(cfg, `${ordersPath(cfg)}/${orderId}/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: amountCents, tender: { id: tenderId } }),
  })) as CloverPayment
}

export async function createRefund(
  cfg: CloverConfig,
  orderId: string,
  paymentId: string,
  amountCents: number,
): Promise<void> {
  await cloverFetch(cfg, `${ordersPath(cfg)}/${orderId}/refunds`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      refunds: { elements: [{ amount: amountCents, payment: { id: paymentId } }] },
    }),
  })
}

/** Best-effort finalize so seeded orders look like completed sales. */
export async function lockOrder(cfg: CloverConfig, orderId: string): Promise<void> {
  await cloverFetch(cfg, `${ordersPath(cfg)}/${orderId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: 'locked' }),
  })
}

export async function deleteOrder(cfg: CloverConfig, orderId: string): Promise<void> {
  await cloverFetch(cfg, `${ordersPath(cfg)}/${orderId}`, { method: 'DELETE' })
}

// ---------------------------------------------------------------------------
// Daily sales aggregation
// ---------------------------------------------------------------------------

export interface DailySales {
  /** YYYY-MM-DD (UTC day) */
  date: string
  grossCents: number
  discountCents: number
  refundCents: number
  netCents: number
  orderCount: number
}

/**
 * NET-SALES DEFINITION (chosen for the food-cost-% KPI):
 *
 *   net = gross − discounts − refunds,   tax excluded.
 *
 * Rationale, field by field:
 * - gross = Σ over line items of (price × qty), in cents. We deliberately do
 *   NOT use order.total: Clover only recalculates order.total when the POS
 *   app touches the order — after API-side edits it goes stale unless the
 *   caller manually POSTs a recalculated total. Line items are the source of
 *   truth we control.
 * - discounts = order-level discounts + any line-item discounts present in
 *   the payload. Clover stores discount amounts as NEGATIVE cents; we take
 *   abs() so the math is sign-agnostic. NOTE: per the official docs,
 *   line-item discounts are only returned when line items are fetched with
 *   `discounts` expanded (a per-order call), so on the list endpoint they
 *   are usually absent — order-level discounts are the reliable source.
 * - refunds = Σ order.refunds[].amount (positive cents).
 * - tax (order.taxAmount) is EXCLUDED: food-cost % compares ingredient spend
 *   against sales net of tax, the standard restaurant-accounting basis.
 * - tips and service charges are excluded (not food sales).
 *
 * Date bucketing uses clientCreatedTime ?? createdTime (UTC day). Clover
 * devices stamp both; clientCreatedTime is the business-meaningful instant
 * (when the sale happened), while createdTime is when the server saw it.
 * (The existing adapter notes restaurant-tz bucketing as a future TODO once
 * the restaurants table carries a tz column — same caveat applies here.)
 */
export function computeDailySales(orders: CloverOrder[]): DailySales[] {
  const byDay = new Map<string, DailySales>()

  for (const order of orders) {
    const ts = order.clientCreatedTime ?? order.createdTime
    if (ts == null) continue
    const date = new Date(ts).toISOString().slice(0, 10)

    let gross = 0
    let lineDiscounts = 0
    for (const li of order.lineItems?.elements ?? []) {
      const qty = li.unitQty ?? li.quantity ?? 1
      gross += (li.price ?? 0) * qty
      for (const d of li.discounts?.elements ?? []) {
        lineDiscounts += Math.abs(d.amount ?? 0)
      }
    }

    let orderDiscounts = 0
    for (const d of order.discounts?.elements ?? []) {
      orderDiscounts += Math.abs(d.amount ?? 0)
    }

    let refunds = 0
    for (const r of order.refunds?.elements ?? []) {
      refunds += Math.abs(r.amount ?? 0)
    }

    const discountCents = Math.round(orderDiscounts + lineDiscounts)
    const refundCents = Math.round(refunds)
    const grossCents = Math.round(gross)
    const netCents = Math.max(0, grossCents - discountCents - refundCents)

    const day = byDay.get(date) ?? {
      date,
      grossCents: 0,
      discountCents: 0,
      refundCents: 0,
      netCents: 0,
      orderCount: 0,
    }
    day.grossCents += grossCents
    day.discountCents += discountCents
    day.refundCents += refundCents
    day.netCents += netCents
    day.orderCount += 1
    byDay.set(date, day)
  }

  return [...byDay.values()].sort((a, b) => (a.date < b.date ? -1 : 1))
}
