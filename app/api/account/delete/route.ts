import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * Delete the signed-in user's account, permanently:
 *   1. Every restaurant they OWN is deleted (all child tables
 *      cascade — invoices, sales, recipes, settings, members).
 *   2. Their memberships in other people's restaurants are removed.
 *   3. Their profile row and auth user are deleted.
 *
 * Guarded by typing the account email, verified server-side
 * against the bearer token's user — the client check is only UX.
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

  const body = (await req.json().catch(() => ({}))) as { confirm_email?: string }
  const confirmEmail = (body.confirm_email || '').trim().toLowerCase()

  const anon = createClient(supabaseUrl, anonKey)
  const { data: userData, error: userErr } = await anon.auth.getUser(token)
  if (userErr || !userData.user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  }
  const user = userData.user
  if (!user.email || confirmEmail !== user.email.toLowerCase()) {
    return NextResponse.json(
      { error: 'Type your account email exactly to confirm deletion.' },
      { status: 400 }
    )
  }

  const sb = createClient(supabaseUrl, serviceKey)

  const { data: memberships, error: memErr } = await sb
    .from('user_restaurants')
    .select('restaurant_id, role')
    .eq('user_id', user.id)
  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 })

  const ownedIds = (memberships ?? [])
    .filter((m) => m.role === 'owner')
    .map((m) => m.restaurant_id as string)

  if (ownedIds.length > 0) {
    // Legacy profiles.restaurant_id is not ON DELETE CASCADE (sql/002).
    await sb.from('profiles').update({ restaurant_id: null }).in('restaurant_id', ownedIds)
    const { error: delErr } = await sb.from('restaurants').delete().in('id', ownedIds)
    if (delErr) {
      return NextResponse.json(
        { error: `Could not delete owned restaurants: ${delErr.message}` },
        { status: 500 }
      )
    }
  }

  // Memberships elsewhere + the profile row (best-effort; the auth
  // deletion below is the point of no return).
  await sb.from('user_restaurants').delete().eq('user_id', user.id)
  await sb.from('profiles').delete().eq('id', user.id)

  const { error: authErr } = await sb.auth.admin.deleteUser(user.id)
  if (authErr) {
    return NextResponse.json(
      { error: `Data deleted but sign-in removal failed: ${authErr.message}` },
      { status: 500 }
    )
  }

  return NextResponse.json({ deleted: true, restaurants_deleted: ownedIds.length })
}
