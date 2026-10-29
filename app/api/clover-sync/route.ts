import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cloverAdapter, type CloverCreds } from '@/lib/pos/clover'
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

  return NextResponse.json({ count: rows.length })
}
