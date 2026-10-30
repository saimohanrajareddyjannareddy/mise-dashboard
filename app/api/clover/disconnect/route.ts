import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * Disconnect the restaurant's Clover OAuth connection: clears the
 * encrypted token + OAuth markers. The merchant id is cleared too
 * unless a manual API key remains (that pairing is a manual setup).
 * Sales sync stops until the restaurant reconnects.
 */
export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 })
  }

  const authHeader = req.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { restaurant_id?: string }
  const restaurantId = body.restaurant_id
  if (!restaurantId) {
    return NextResponse.json({ error: 'restaurant_id required' }, { status: 400 })
  }

  const anon = createClient(supabaseUrl, anonKey)
  const { data: userData, error: userErr } = await anon.auth.getUser(token)
  if (userErr || !userData.user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  }

  const sb = createClient(supabaseUrl, serviceKey)
  const { data: membership } = await sb
    .from('user_restaurants')
    .select('restaurant_id')
    .eq('user_id', userData.user.id)
    .eq('restaurant_id', restaurantId)
    .maybeSingle()
  if (!membership) return NextResponse.json({ error: 'Not your restaurant' }, { status: 403 })

  const { data: settings } = await sb
    .from('restaurant_settings')
    .select('clover_api_key')
    .eq('restaurant_id', restaurantId)
    .maybeSingle()

  const update: Record<string, string | null> = {
    clover_token_enc: null,
    clover_auth_method: null,
    clover_connected_at: null,
  }
  if (!settings?.clover_api_key) update.clover_merchant_id = null

  const { error: upErr } = await sb
    .from('restaurant_settings')
    .update(update)
    .eq('restaurant_id', restaurantId)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  return NextResponse.json({ disconnected: true })
}
