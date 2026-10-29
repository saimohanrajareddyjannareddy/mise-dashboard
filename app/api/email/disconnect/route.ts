import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/* Disconnect the mailbox: wipe the stored token and connection. */
export async function POST(req: NextRequest) {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!serviceKey) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 })
  }
  const { restaurant_id: restaurantId } = (await req.json()) as {
    restaurant_id?: string
  }
  if (!restaurantId) {
    return NextResponse.json({ error: 'restaurant_id required' }, { status: 400 })
  }
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)
  const { error } = await sb
    .from('restaurant_settings')
    .update({
      mailbox_provider: null,
      mailbox_email: null,
      mailbox_token_enc: null,
      mailbox_connected_at: null,
      mailbox_last_scan_at: null,
    })
    .eq('restaurant_id', restaurantId)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
