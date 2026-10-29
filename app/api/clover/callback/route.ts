import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cloverOauthConfigured, cloverOauthHost } from '@/lib/clover-oauth'
import { encryptToken } from '@/lib/token-crypto'

/*
 * Clover OAuth callback. Verifies the state cookie set by
 * /api/clover/connect, exchanges the code for an access token
 * server-side (the app secret never leaves the server), encrypts the
 * token, and stores it on the restaurant's settings row via the
 * service-role client. Always lands back on Settings with a
 * ?clover=<result> flag the page turns into a banner.
 */
export async function GET(req: NextRequest) {
  const settingsUrl = new URL('/dashboard/settings', req.url)
  const back = (result: string) => {
    settingsUrl.searchParams.set('clover', result)
    const res = NextResponse.redirect(settingsUrl)
    res.cookies.delete('clover_oauth_state')
    return res
  }

  if (!cloverOauthConfigured()) return back('not_configured')

  const merchantIdParam = req.nextUrl.searchParams.get('merchant_id')
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const cookie = req.cookies.get('clover_oauth_state')?.value
  // Distinct result codes per failure point — the generic 'failed'
  // hid WHERE the flow broke (cookie? state? the token exchange?),
  // which made remote diagnosis a guessing game.
  if (!code) return back('no_code')
  if (!state) return back('no_state')
  if (!cookie) return back('cookie_missing')

  const [expectedState, restaurantId] = cookie.split('.')
  if (!expectedState || state !== expectedState || !restaurantId) {
    return back('state_mismatch')
  }

  // Exchange the code for an access token. Clover's token endpoint
  // takes form-encoded fields (per Clover's OAuth docs) — a JSON
  // body is ignored there, which reads as a failed exchange.
  let accessToken: string | undefined
  let merchantId: string | undefined
  try {
    const resp = await fetch(`${cloverOauthHost()}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.CLOVER_APP_ID!,
        client_secret: process.env.CLOVER_APP_SECRET!,
        code,
      }),
    })
    if (!resp.ok) return back(`exchange_${resp.status}`)
    const body = await resp.json()
    accessToken = body.access_token
    // The token body carries only the access token; the merchant id
    // arrives as a query param on Clover's callback redirect.
    merchantId = body.merchant_id || merchantIdParam || undefined
  } catch {
    return back('exchange_network')
  }
  if (!accessToken || !merchantId) return back('exchange_no_token')

  if (!process.env.SUPABASE_SERVICE_KEY) return back('failed')
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY
  )

  let encrypted: string
  try {
    encrypted = encryptToken(accessToken)
  } catch {
    return back('no_encryption_key')
  }

  const { error } = await sb
    .from('restaurant_settings')
    .upsert(
      {
        restaurant_id: restaurantId,
        clover_merchant_id: merchantId,
        clover_token_enc: encrypted,
        clover_auth_method: 'oauth',
        clover_connected_at: new Date().toISOString(),
      },
      { onConflict: 'restaurant_id' }
    )
  if (error) {
    // sql/012 not run yet — the encrypted-token columns don't exist.
    if (error.message.includes('clover_token_enc')) return back('migration_needed')
    return back('db_error')
  }

  return back('connected')
}
