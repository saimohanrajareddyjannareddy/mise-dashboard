import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { cloverOauthConfigured, cloverOauthHost } from '@/lib/clover-oauth'

/*
 * Starts the Clover OAuth flow: remembers which restaurant is
 * connecting (state nonce + restaurant id in an httpOnly cookie),
 * then sends the merchant to Clover's authorize page. Clover sends
 * them back to /api/clover/callback with a code.
 */
export async function GET(req: NextRequest) {
  const settingsUrl = new URL('/dashboard/settings', req.url)
  const restaurantId = req.nextUrl.searchParams.get('restaurant_id')

  if (!restaurantId) {
    settingsUrl.searchParams.set('clover', 'missing_restaurant')
    return NextResponse.redirect(settingsUrl)
  }
  if (!cloverOauthConfigured()) {
    settingsUrl.searchParams.set('clover', 'not_configured')
    return NextResponse.redirect(settingsUrl)
  }

  const state = randomUUID()
  const authorize = new URL('/oauth/authorize', cloverOauthHost())
  authorize.searchParams.set('client_id', process.env.CLOVER_APP_ID!)
  authorize.searchParams.set(
    'redirect_uri',
    new URL('/api/clover/callback', req.url).toString()
  )
  authorize.searchParams.set('response_type', 'code')
  authorize.searchParams.set('state', state)

  const res = NextResponse.redirect(authorize)
  res.cookies.set('clover_oauth_state', `${state}.${restaurantId}`, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/api/clover',
    maxAge: 600,
    secure: req.nextUrl.protocol === 'https:',
  })
  return res
}
