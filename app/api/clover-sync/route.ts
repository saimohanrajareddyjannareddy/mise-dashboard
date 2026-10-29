import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cloverAdapter, fetchCloverSalesAggregates, type CloverCreds } from '@/lib/pos/clover'
import { decryptToken } from '@/lib/token-crypto'
import { cloverEnv } from '@/lib/clover-oauth'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!
const WINDOW_DAYS = 30
const INSERT_CHUNK = 500

export async function POST(req: NextRequest) {
  if (!SUPABASE_SERVICE_KEY) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_KEY not set' }, { status: 500 })
  }

  const { restaurant_id } = await req.json()
  if (!restaurant_id) {
    return NextResponse.json({ error: 'restaurant_id required' }, { status: 400 })
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

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
    .eq('restaurant_id', restaurant_id)
    .single()
  let settings: SettingsRow | null = (full.data as SettingsRow) ?? null
  if (full.error) {
    const legacy = await sb
      .from('restaurant_settings')
      .select('clover_merchant_id, clover_api_key')
      .eq('restaurant_id', restaurant_id)
      .single()
    settings = (legacy.data as SettingsRow) ?? null
  }

  // OAuth token wins when present; the manual plaintext key is the
  // fallback for restaurants that haven't reconnected yet.
  let apiToken: string | null = settings?.clover_api_key ?? null
  let env: string | undefined
  if (settings?.clover_token_enc) {
    try {
      apiToken = decryptToken(settings.clover_token_enc)
      env = cloverEnv()
    } catch {
      return NextResponse.json(
        { error: 'Stored Clover token could not be decrypted (TOKEN_ENCRYPTION_KEY missing or changed)' },
        { status: 500 },
      )
    }
  }

  if (!settings?.clover_merchant_id || !apiToken) {
    return NextResponse.json(
      { error: 'Clover not configured for this restaurant' },
      { status: 400 },
    )
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
      restaurant_id,
      creds,
      sinceTs,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }

  if (rows.length === 0) return NextResponse.json({ count: 0 })

  // pos_sales has a unique INDEX with coalesce(...) expressions that PostgREST
  // can't target for upsert. Delete-then-insert the window for this
  // (restaurant_id, pos_source). Cost: a partial-failure window can lose the
  // pre-existing rows for the window. A future migration adding a real
  // unique constraint or a SECURITY DEFINER RPC replaces this.
  const { error: delError } = await sb
    .from('pos_sales')
    .delete()
    .eq('restaurant_id', restaurant_id)
    .eq('pos_source', 'clover')
    .gte('sale_date', sinceDate)
  if (delError) return NextResponse.json({ error: delError.message }, { status: 500 })

  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const { error } = await sb.from('pos_sales').insert(rows.slice(i, i + INSERT_CHUNK))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // The food-cost page, Home KPIs and the assistant read DAILY
  // aggregates (daily_sales) — a table the old sync script maintained
  // but this route never did, so a successful sync still left those
  // pages reading an empty table. Compute the aggregates from the
  // same orders and replace the window's rows. The same pass also
  // produces the channel/tender breakdowns (sales_breakdowns).
  let dailyDays = 0
  let breakdownRows = 0
  let breakdownError: string | null = null
  try {
    const aggregates = await fetchCloverSalesAggregates(creds, sinceTs)
    const daily = aggregates.daily
    if (daily.length > 0) {
      const { error: dailyDelError } = await sb
        .from('daily_sales')
        .delete()
        .eq('restaurant_id', restaurant_id)
        .eq('source', 'clover')
        .gte('date', sinceDate)
      if (dailyDelError) {
        return NextResponse.json({ error: dailyDelError.message }, { status: 500 })
      }
      const { error: dailyError } = await sb.from('daily_sales').insert(
        daily.map((d) => ({
          restaurant_id,
          date: d.date,
          gross_cents: d.grossCents,
          discount_cents: d.discountCents,
          refund_cents: d.refundCents,
          net_cents: d.netCents,
          order_count: d.orderCount,
          source: 'clover',
        }))
      )
      if (dailyError) {
        return NextResponse.json({ error: dailyError.message }, { status: 500 })
      }
      dailyDays = daily.length
    }

    // Breakdowns are additive: a missing table (sql/016 not run yet)
    // must not fail a sync whose totals landed.
    try {
      const { error: bdDelError } = await sb
        .from('sales_breakdowns')
        .delete()
        .eq('restaurant_id', restaurant_id)
        .eq('source', 'clover')
        .gte('date', sinceDate)
      if (bdDelError) throw new Error(bdDelError.message)
      if (aggregates.breakdowns.length > 0) {
        const { error: bdError } = await sb.from('sales_breakdowns').insert(
          aggregates.breakdowns.map((b) => ({
            restaurant_id,
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
    } catch (e) {
      breakdownError = (e as Error).message
    }
  } catch (e) {
    return NextResponse.json(
      { error: `Daily sales aggregation failed: ${(e as Error).message}` },
      { status: 502 }
    )
  }

  return NextResponse.json({
    count: rows.length,
    daily_days: dailyDays,
    breakdown_rows: breakdownRows,
    breakdown_error: breakdownError,
  })
}
