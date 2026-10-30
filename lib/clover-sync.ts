import type { SupabaseClient } from '@supabase/supabase-js'
import {
  cloverAdapter,
  fetchCloverSalesAggregates,
  type CloverCreds,
} from '@/lib/pos/clover'
import { decryptToken } from '@/lib/token-crypto'
import { cloverEnv } from '@/lib/clover-oauth'

const WINDOW_DAYS = 30
const INSERT_CHUNK = 500

/** Error carrying the HTTP status the manual route used to return. */
export class CloverSyncError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

export interface CloverSyncResult {
  /** pos_sales line rows written. */
  count: number
  /** daily_sales days written. */
  dailyDays: number
  /** sales_breakdowns rows written. */
  breakdownRows: number
  /** Non-fatal breakdown problem (e.g. sql/016 not run yet). */
  breakdownError: string | null
  /** Which expansion set the Clover API accepted for aggregates. */
  expandUsed: string | null
  /** Breakdown data Clover didn't return (e.g. 'channel', 'payment'). */
  fieldsMissing: string[]
}

/**
 * Sync one restaurant's Clover sales: pos_sales line items for the
 * trailing 30 days, plus the daily_sales aggregates and the
 * channel/tender breakdowns computed from the same orders (the
 * pages and the assistant read those, not pos_sales).
 *
 * Shared by the manual route (Settings → Sync now) and the daily
 * cron (app/api/clover/sync-all) so both paths can never drift.
 */
export async function syncRestaurantClover(
  sb: SupabaseClient,
  restaurantId: string
): Promise<CloverSyncResult> {
  // Prefer the OAuth columns; fall back to the legacy select until
  // sql/012 has run (the wider select errors when they don't exist).
  type SettingsRow = {
    clover_merchant_id: string | null
    clover_api_key: string | null
    clover_token_enc?: string | null
  }
  const full = await sb
    .from('restaurant_settings')
    .select('clover_merchant_id, clover_api_key, clover_token_enc')
    .eq('restaurant_id', restaurantId)
    .single()
  let settings: SettingsRow | null = (full.data as SettingsRow) ?? null
  if (full.error) {
    const legacy = await sb
      .from('restaurant_settings')
      .select('clover_merchant_id, clover_api_key')
      .eq('restaurant_id', restaurantId)
      .single()
    settings = (legacy.data as SettingsRow) ?? null
  }

  // OAuth token wins when present; the manual plaintext key is the
  // fallback for restaurants that haven't reconnected yet.
  let apiToken: string | null = settings?.clover_api_key ?? null
  // The Clover environment is a property of OUR deployment, not of
  // the token: a manual sandbox token must still hit the sandbox
  // host (previously env was only set on the OAuth branch, which
  // sent manual sandbox tokens to the production API).
  const env: string | undefined = cloverEnv()
  if (settings?.clover_token_enc) {
    try {
      apiToken = decryptToken(settings.clover_token_enc)
    } catch {
      throw new CloverSyncError(
        'Stored Clover token could not be decrypted (TOKEN_ENCRYPTION_KEY missing or changed)',
        500
      )
    }
  }

  if (!settings?.clover_merchant_id || !apiToken) {
    throw new CloverSyncError('Clover not configured for this restaurant', 400)
  }
  const creds: CloverCreds = {
    clover_merchant_id: settings.clover_merchant_id,
    clover_api_key: apiToken,
    clover_env: env,
  }

  const sinceTs = Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000
  const sinceDate = new Date(sinceTs).toISOString().slice(0, 10)

  let rows
  try {
    rows = await cloverAdapter.fetchSales({
      restaurant_id: restaurantId,
      creds,
      sinceTs,
    })
  } catch (e) {
    throw new CloverSyncError((e as Error).message, 502)
  }

  if (rows.length === 0) {
    return { count: 0, dailyDays: 0, breakdownRows: 0, breakdownError: null, expandUsed: null, fieldsMissing: [] }
  }

  // pos_sales has a unique INDEX with coalesce(...) expressions that
  // PostgREST can't target for upsert. Delete-then-insert the window
  // for this (restaurant_id, pos_source). Cost: a partial-failure
  // window can lose the pre-existing rows for the window. A future
  // migration adding a real unique constraint or a SECURITY DEFINER
  // RPC replaces this.
  const { error: delError } = await sb
    .from('pos_sales')
    .delete()
    .eq('restaurant_id', restaurantId)
    .eq('pos_source', 'clover')
    .gte('sale_date', sinceDate)
  if (delError) throw new CloverSyncError(delError.message, 500)

  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const { error } = await sb.from('pos_sales').insert(rows.slice(i, i + INSERT_CHUNK))
    if (error) throw new CloverSyncError(error.message, 500)
  }

  // The food-cost page, Home KPIs and the assistant read DAILY
  // aggregates (daily_sales) — a table the old sync script maintained
  // but the in-app sync originally didn't, so a successful sync still
  // left those pages reading an empty table. Compute the aggregates
  // from the same orders and replace the window's rows. The same
  // pass also produces the channel/tender breakdowns
  // (sales_breakdowns).
  let dailyDays = 0
  let breakdownRows = 0
  let expandUsed: string | null = null
  let fieldsMissing: string[] = []
  let breakdownError: string | null = null
  try {
    const aggregates = await fetchCloverSalesAggregates(creds, sinceTs)
    const daily = aggregates.daily
    if (daily.length > 0) {
      const { error: dailyDelError } = await sb
        .from('daily_sales')
        .delete()
        .eq('restaurant_id', restaurantId)
        .eq('source', 'clover')
        .gte('date', sinceDate)
      if (dailyDelError) throw new CloverSyncError(dailyDelError.message, 500)
      const { error: dailyError } = await sb.from('daily_sales').insert(
        daily.map((d) => ({
          restaurant_id: restaurantId,
          date: d.date,
          gross_cents: d.grossCents,
          discount_cents: d.discountCents,
          refund_cents: d.refundCents,
          net_cents: d.netCents,
          order_count: d.orderCount,
          source: 'clover',
        }))
      )
      if (dailyError) throw new CloverSyncError(dailyError.message, 500)
      dailyDays = daily.length
    }

    // Breakdowns are additive: a missing table (sql/016 not run yet)
    // must not fail a sync whose totals landed.
    try {
      const { error: bdDelError } = await sb
        .from('sales_breakdowns')
        .delete()
        .eq('restaurant_id', restaurantId)
        .eq('source', 'clover')
        .gte('date', sinceDate)
      if (bdDelError) throw new Error(bdDelError.message)
      if (aggregates.breakdowns.length > 0) {
        const { error: bdError } = await sb.from('sales_breakdowns').insert(
          aggregates.breakdowns.map((b) => ({
            restaurant_id: restaurantId,
            date: b.date,
            dimension: b.dimension,
            label: b.label,
            net_cents: b.netCents,
            order_count: b.orderCount,
            source: 'clover',
          }))
        )
        if (bdError) throw new Error(bdError.message)
      }
      breakdownRows = aggregates.breakdowns.length
      expandUsed = aggregates.expandUsed
      fieldsMissing = [
        ...(aggregates.fields.orderType ? [] : ['channel']),
        ...(aggregates.fields.payments ? [] : ['payment']),
      ]
    } catch (e) {
      breakdownError = (e as Error).message
    }
  } catch (e) {
    if (e instanceof CloverSyncError) throw e
    throw new CloverSyncError(
      `Daily sales aggregation failed: ${(e as Error).message}`,
      502
    )
  }

  return { count: rows.length, dailyDays, breakdownRows, breakdownError, expandUsed, fieldsMissing }
}
