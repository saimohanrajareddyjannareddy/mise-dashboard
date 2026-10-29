import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { scanRestaurantMailbox } from '@/lib/email-scan'

/*
 * Daily automatic scan for every restaurant with a connected
 * mailbox. Invoked by Vercel Cron (see vercel.json), which sends
 * Authorization: Bearer <CRON_SECRET> when that env var is set.
 */
async function run(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json(
      { error: 'CRON_SECRET not set — scheduled scans are off' },
      { status: 500 }
    )
  }
  if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!serviceKey) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 })
  }

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)
  const { data: rows, error } = await sb
    .from('restaurant_settings')
    .select('restaurant_id')
    .not('mailbox_token_enc', 'is', null)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const summary: Array<Record<string, unknown>> = []
  for (const row of rows ?? []) {
    const restaurantId = row.restaurant_id as string
    try {
      const result = await scanRestaurantMailbox(sb, restaurantId)
      summary.push({ restaurant_id: restaurantId, ...result })
    } catch (e) {
      summary.push({
        restaurant_id: restaurantId,
        error: e instanceof Error ? e.message : 'scan failed',
      })
    }
  }
  return NextResponse.json({ restaurants: summary.length, summary })
}

export async function GET(req: NextRequest) {
  return run(req)
}

export async function POST(req: NextRequest) {
  return run(req)
}
