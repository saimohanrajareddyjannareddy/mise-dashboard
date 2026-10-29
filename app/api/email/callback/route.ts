import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { encryptToken } from '@/lib/token-crypto'
import {
  exchangeGoogleCode,
  gmailProfileEmail,
  googleConfigured,
} from '@/lib/gmail'

/*
 * Google redirects here after consent. Verify the state cookie,
 * exchange the code, encrypt the refresh token, and store the
 * connection on restaurant_settings (service role). Every failure
 * lands back on Settings with a readable banner state — including
 * "run migration 013 first".
 */
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin
  const settingsUrl = new URL('/dashboard/settings', origin)
  const done = (status: string) => {
    settingsUrl.searchParams.set('email', status)
    const res = NextResponse.redirect(settingsUrl)
    res.cookies.delete('mailbox_oauth_state')
    return res
  }

  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const cookie = req.cookies.get('mailbox_oauth_state')?.value
  if (!code || !state || !cookie) return done('failed')
  const [cookieState, restaurantId] = cookie.split(':')
  if (cookieState !== state || !restaurantId) return done('failed')
  if (!googleConfigured()) return done('not_configured')

  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!serviceKey) return done('failed')

  try {
    const redirectUri = `${origin}/api/email/callback`
    const tokens = await exchangeGoogleCode(code, redirectUri)
    if (!tokens.refresh_token) return done('failed')
    const email = await gmailProfileEmail(tokens.access_token)

    let tokenEnc: string
    try {
      tokenEnc = encryptToken(
        JSON.stringify({ refresh_token: tokens.refresh_token })
      )
    } catch {
      return done('no_encryption_key')
    }

    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)
    const payload = {
      restaurant_id: restaurantId,
      mailbox_provider: 'gmail',
      mailbox_email: email,
      mailbox_token_enc: tokenEnc,
      mailbox_connected_at: new Date().toISOString(),
    }
    const { error } = await sb
      .from('restaurant_settings')
      .upsert(payload, { onConflict: 'restaurant_id' })
    if (error) {
      return done(
        error.message.includes('mailbox_') ? 'migration_needed' : 'failed'
      )
    }
    return done('connected')
  } catch {
    return done('failed')
  }
}
