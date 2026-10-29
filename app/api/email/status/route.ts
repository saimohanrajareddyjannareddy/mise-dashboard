import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { googleConfigured } from '@/lib/gmail'

/* Settings reads this to render the connect/scan card honestly. */
export async function GET(req: NextRequest) {
  const restaurantId = req.nextUrl.searchParams.get('restaurant_id')
  const base = { configured: googleConfigured(), connected: false }
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!restaurantId || !serviceKey) return NextResponse.json(base)

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)
  const { data, error } = await sb
    .from('restaurant_settings')
    .select('mailbox_email, mailbox_connected_at, mailbox_last_scan_at')
    .eq('restaurant_id', restaurantId)
    .single()
  if (error || !data?.mailbox_email) return NextResponse.json(base)
  return NextResponse.json({
    ...base,
    connected: true,
    email: data.mailbox_email,
    connected_at: data.mailbox_connected_at,
    last_scan_at: data.mailbox_last_scan_at,
  })
}
