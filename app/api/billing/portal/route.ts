import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStripe, stripeConfigured } from '@/lib/stripe'

/*
 * Creates a Stripe Billing Portal session so the restaurant can
 * update its card, see invoices, or cancel — all on Stripe's pages,
 * nothing payment-related is built here. Returns the portal URL.
 */
export async function POST(req: NextRequest) {
  if (!stripeConfigured()) {
    return NextResponse.json({ error: 'Billing is not configured yet' }, { status: 503 })
  }
  if (!process.env.SUPABASE_SERVICE_KEY) {
    return NextResponse.json({ error: 'Server billing is not configured' }, { status: 500 })
  }
  const { restaurant_id } = await req.json()
  if (!restaurant_id) {
    return NextResponse.json({ error: 'restaurant_id required' }, { status: 400 })
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY
  )
  const { data: restaurant } = await sb
    .from('restaurants')
    .select('stripe_customer_id')
    .eq('id', restaurant_id)
    .single()
  if (!restaurant?.stripe_customer_id) {
    return NextResponse.json(
      { error: 'No billing account yet — subscribe first' },
      { status: 400 }
    )
  }

  const stripe = getStripe()
  const session = await stripe.billingPortal.sessions.create({
    customer: restaurant.stripe_customer_id,
    return_url: `${req.nextUrl.origin}/dashboard/settings`,
  })
  return NextResponse.json({ url: session.url })
}
