import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getStripe, stripeConfigured } from '@/lib/stripe'

/*
 * Billing history for the Settings card, read straight from Stripe:
 * the restaurant's recent invoices (date, amount, status, hosted
 * page) and its current subscription's renewal state (trial end /
 * period end / cancel-at-period-end). Reading Stripe directly —
 * rather than the mirrored columns — means the card shows the truth
 * even before the webhook mirror lands.
 */
export async function GET(req: NextRequest) {
  if (!stripeConfigured()) {
    return NextResponse.json({ error: 'Billing is not configured yet' }, { status: 503 })
  }
  if (!process.env.SUPABASE_SERVICE_KEY) {
    return NextResponse.json({ error: 'Server billing is not configured' }, { status: 500 })
  }
  const restaurantId = req.nextUrl.searchParams.get('restaurant_id')
  if (!restaurantId) {
    return NextResponse.json({ error: 'restaurant_id required' }, { status: 400 })
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY
  )
  const { data: restaurant } = await sb
    .from('restaurants')
    .select('stripe_customer_id')
    .eq('id', restaurantId)
    .single()
  if (!restaurant?.stripe_customer_id) {
    return NextResponse.json({ invoices: [], subscription: null })
  }

  const stripe = getStripe()
  try {
    const [invoiceList, subList] = await Promise.all([
      stripe.invoices.list({ customer: restaurant.stripe_customer_id, limit: 12 }),
      stripe.subscriptions.list({ customer: restaurant.stripe_customer_id, status: 'all', limit: 1 }),
    ])
    const invoices = invoiceList.data.map((inv) => ({
      id: inv.id,
      number: inv.number,
      created: inv.created,
      amount_paid: inv.amount_paid,
      total: inv.total,
      currency: inv.currency,
      status: inv.status,
      hosted_invoice_url: inv.hosted_invoice_url,
    }))
    const sub = subList.data[0]
    const subscription = sub
      ? {
          status: sub.status,
          current_period_end: sub.items.data[0]?.current_period_end ?? null,
          trial_end: sub.trial_end,
          cancel_at_period_end: sub.cancel_at_period_end,
          amount: sub.items.data[0]?.price?.unit_amount ?? null,
          currency: sub.items.data[0]?.price?.currency ?? 'usd',
        }
      : null
    return NextResponse.json({ invoices, subscription })
  } catch (e: any) {
    return NextResponse.json(
      { error: `Stripe error: ${e?.message ?? 'unknown'}` },
      { status: 502 }
    )
  }
}
