import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { CloverSyncError, syncRestaurantClover } from '@/lib/clover-sync'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!

/**
 * Manual sync (Settings → Sync now). The work lives in
 * lib/clover-sync.ts, shared with the daily cron
 * (app/api/clover/sync-all) so the two paths can't drift.
 */
export async function POST(req: NextRequest) {
  if (!SUPABASE_SERVICE_KEY) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_KEY not set' }, { status: 500 })
  }

  const { restaurant_id } = await req.json()
  if (!restaurant_id) {
    return NextResponse.json({ error: 'restaurant_id required' }, { status: 400 })
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  try {
    const r = await syncRestaurantClover(sb, restaurant_id)
    return NextResponse.json({
      count: r.count,
      daily_days: r.dailyDays,
      breakdown_rows: r.breakdownRows,
      breakdown_error: r.breakdownError,
      expand_used: r.expandUsed,
      fields_missing: r.fieldsMissing,
      auth_source: r.authSource,
    })
  } catch (e) {
    if (e instanceof CloverSyncError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
