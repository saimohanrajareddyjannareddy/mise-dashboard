import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { scanRestaurantMailbox } from '@/lib/email-scan'

/*
 * "Scan now" from Settings. Runs the same scanner the daily cron
 * uses, for one restaurant, and reports what it found.
 */
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
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'Invoice parsing is not configured on the server' },
      { status: 500 }
    )
  }

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)
  try {
    const result = await scanRestaurantMailbox(sb, restaurantId)
    return NextResponse.json(result)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Scan failed'
    if (message === 'migration_needed') {
      return NextResponse.json(
        { error: 'Email scanning needs a quick database update first (migration 013).' },
        { status: 409 }
      )
    }
    if (message === 'mailbox_not_connected') {
      return NextResponse.json(
        { error: 'No mailbox connected for this restaurant' },
        { status: 400 }
      )
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
