import type { PosAdapter, PosSaleRow } from './types'
import { computeDailySales, type CloverOrder as RefCloverOrder, type DailySales } from '../clover'

export interface CloverCreds {
  clover_merchant_id: string
  clover_api_key: string
  // 'sandbox' hits the Clover sandbox hosts (OAuth test merchants);
  // anything else uses production. Manual tokens historically always
  // used production, so this stays unset on that path.
  clover_env?: string
}

interface CloverLineItem {
  id?: string
  name?: string
  quantity?: number
  price?: number
  unitName?: string
  modifications?: { elements?: Array<{ name?: string }> }
}

interface CloverOrder {
  id?: string
  createdTime?: number
  lineItems?: { elements?: CloverLineItem[] }
}

// Clover stores price in cents and createdTime in ms-since-epoch.
// sale_date is UTC-derived; restaurant-tz handling is a future TODO once
// the restaurants table carries a tz column.
export const cloverAdapter: PosAdapter<CloverCreds> = {
  source: 'clover',

  async fetchSales({ restaurant_id, creds, sinceTs }) {
    if (!creds.clover_merchant_id || !creds.clover_api_key) {
      throw new Error('Clover credentials missing')
    }

    const apiHost =
      creds.clover_env === 'sandbox'
        ? 'https://apisandbox.dev.clover.com'
        : 'https://api.clover.com'
    const url = `${apiHost}/v3/merchants/${creds.clover_merchant_id}/orders?filter=createdTime>=${sinceTs}&expand=lineItems&limit=1000`

    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${creds.clover_api_key}`,
        Accept: 'application/json',
      },
    })
    if (!resp.ok) {
      throw new Error(`Clover API ${resp.status}: ${await resp.text()}`)
    }

    const body = (await resp.json()) as { elements?: CloverOrder[] }
    const orders = body.elements ?? []

    const rows: PosSaleRow[] = []
    for (const order of orders) {
      const ts = order.createdTime
      const saleTs = ts ? new Date(ts).toISOString() : null
      const saleDate = ts
        ? new Date(ts).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10)

      for (const li of order.lineItems?.elements ?? []) {
        const modifierNames =
          li.modifications?.elements
            ?.map((m) => m.name)
            .filter((s): s is string => Boolean(s)) ?? []
        const unitPrice = li.price != null ? li.price / 100 : null
        const quantity = li.quantity ?? 1

        rows.push({
          restaurant_id,
          pos_source: 'clover',
          pos_order_id: order.id ?? null,
          pos_line_id: li.id ?? null,
          sale_date: saleDate,
          sale_ts: saleTs,
          item_name: li.name ?? 'Unknown',
          category: null,
          quantity,
          unit: li.unitName ?? null,
          unit_price: unitPrice,
          revenue: unitPrice != null ? unitPrice * quantity : 0,
          modifiers: modifierNames.length > 0 ? modifierNames : null,
          raw: li,
        })
      }
    }
    return rows
  },
}

/**
 * Daily sales aggregates for the same order window — the food-cost
 * page, Home KPIs and the assistant read daily_sales, NOT pos_sales.
 * Uses the reference math (computeDailySales in lib/clover.ts:
 * net = gross − discounts − refunds, tax excluded) so the in-app
 * sync and the old sync script can never disagree.
 *
 * Orders are bucketed by createdTime (server time) so the
 * aggregates always agree with pos_sales' sale_date. Real POS
 * devices stamp clientCreatedTime == createdTime; API-seeded test
 * orders set clientCreatedTime arbitrarily, which would scatter
 * the aggregates onto dates nothing else recognizes.
 */
export async function fetchCloverDailySales(
  creds: CloverCreds,
  sinceTs: number
): Promise<DailySales[]> {
  if (!creds.clover_merchant_id || !creds.clover_api_key) {
    throw new Error('Clover credentials missing')
  }
  const apiHost =
    creds.clover_env === 'sandbox'
      ? 'https://apisandbox.dev.clover.com'
      : 'https://api.clover.com'
  const authHeader = 'Bearer ' + creds.clover_api_key

  const fetchOrders = async (expand: string): Promise<RefCloverOrder[]> => {
    const url = `${apiHost}/v3/merchants/${creds.clover_merchant_id}/orders?filter=createdTime>=${sinceTs}&expand=${expand}&limit=1000`
    const resp = await fetch(url, {
      headers: { Authorization: authHeader, Accept: 'application/json' },
    })
    if (!resp.ok) {
      throw new Error(`Clover API ${resp.status}: ${await resp.text()}`)
    }
    const body = (await resp.json()) as { elements?: RefCloverOrder[] }
    return body.elements ?? []
  }

  let orders: RefCloverOrder[]
  try {
    orders = await fetchOrders('lineItems,discounts,payments,refunds')
  } catch {
    // Some tokens can't expand refunds — retry without it (refunds
    // then read as zero) rather than failing the whole sync.
    orders = await fetchOrders('lineItems,discounts,payments')
  }
  return computeDailySales(
    orders.map((o) => ({ ...o, clientCreatedTime: o.createdTime }))
  )
}
