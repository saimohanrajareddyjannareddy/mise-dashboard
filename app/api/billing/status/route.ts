import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripeConfigured } from '@/lib/stripe'

/*
 * Billing state for one restaurant, for the Settings billing card:
 * whether billing is switched on server-side, and whether this
 * restaurant already has a Stripe customer/subscription (the local
 * subscription_status alone can't distinguish "trialing with a real
 * subscription" from the default 'trialing' every new row gets).
 */
export async function GET(req: NextRequest) {
  const restaurantId = req.nextUrl.searchParams.get('restaurant_id')
  let hasSubscription = false
  if (restaurantId && process.env.SUPABASE_SERVICE_KEY) {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY
    )
    const { data } = await sb
      .from('restaurants')
      .select('stripe_subscription_id')
      .eq('id', restaurantId)
      .single()
    hasSubscription = !!data?.stripe_subscription_id
  }
  return NextResponse.json({
    configured: stripeConfigured(),
    has_subscription: hasSubscription,
  })
}
