import { randomBytes } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { GMAIL_SCOPES, googleConfigured } from '@/lib/gmail'

/*
 * Start of the "connect your email" flow. Redirects the owner to
 * Google's consent screen (gmail.readonly, offline access so we get
 * a refresh token for scheduled scans). State + target restaurant
 * ride in an httpOnly cookie, verified in the callback.
 */
export async function GET(req: NextRequest) {
  const restaurantId = req.nextUrl.searchParams.get('restaurant_id')
  const origin = req.nextUrl.origin
  const settingsUrl = new URL('/dashboard/settings', origin)

  if (!googleConfigured()) {
    settingsUrl.searchParams.set('email', 'not_configured')
    return NextResponse.redirect(settingsUrl)
  }
  if (!restaurantId) {
    settingsUrl.searchParams.set('email', 'failed')
    return NextResponse.redirect(settingsUrl)
  }

  const state = randomBytes(16).toString('hex')
  const redirectUri = `${origin}/api/email/callback`
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID!)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', GMAIL_SCOPES.join(' '))
  authUrl.searchParams.set('access_type', 'offline')
  authUrl.searchParams.set('prompt', 'consent')
  authUrl.searchParams.set('state', state)

  const res = NextResponse.redirect(authUrl)
  res.cookies.set('mailbox_oauth_state', `${state}:${restaurantId}`, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/api/email',
    maxAge: 600,
  })
  return res
}
