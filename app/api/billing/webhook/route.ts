import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import { getStripe, mapStripeStatus } from '@/lib/stripe'

/*
 * Stripe webhook → restaurants billing mirror.
 *
 * Keeps restaurants.stripe_subscription_id, subscription_status and
 * trial_ends_at in step with Stripe so the UI (and any future access
 * gating) reads local truth. Register this endpoint in the Stripe
 * dashboard with events:
 *   checkout.session.completed
 *   customer.subscription.updated
 *   customer.subscription.deleted
 *   invoice.payment_failed
 * and put its signing secret in STRIPE_WEBHOOK_SECRET.
 */

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  )
}

async function syncSubscription(
  sb: ReturnType<typeof serviceClient>,
  sub: Stripe.Subscription
) {
  const restaurantId = sub.metadata?.restaurant_id
  const patch: Record<string, unknown> = {
    stripe_subscription_id: sub.id,
    subscription_status: mapStripeStatus(sub.status),
  }
  if (sub.trial_end) {
    patch.trial_ends_at = new Date(sub.trial_end * 1000).toISOString()
  }
  if (restaurantId) {
    await sb.from('restaurants').update(patch).eq('id', restaurantId)
  } else {
    await sb
      .from('restaurants')
      .update(patch)
      .eq('stripe_subscription_id', sub.id)
  }
}

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret || !process.env.SUPABASE_SERVICE_KEY) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }
  const sig = req.headers.get('stripe-signature')
  if (!sig) return NextResponse.json({ error: 'Missing signature' }, { status: 400 })

  const stripe = getStripe()
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(await req.text(), sig, secret)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const sb = serviceClient()
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.subscription) {
          const sub = await stripe.subscriptions.retrieve(
            session.subscription as string
          )
          if (!sub.metadata?.restaurant_id && session.metadata?.restaurant_id) {
            sub.metadata = {
              ...sub.metadata,
              restaurant_id: session.metadata.restaurant_id,
            }
          }
          await syncSubscription(sb, sub)
        }
        break
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        await syncSubscription(sb, event.data.object as Stripe.Subscription)
        break
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        // Older API versions carry invoice.subscription; newer ones
        // moved it under parent.subscription_details.
        const legacy = (
          invoice as Stripe.Invoice & {
            subscription?: string | { id: string } | null
          }
        ).subscription
        const subId =
          (typeof legacy === 'string' ? legacy : legacy?.id) ??
          invoice.parent?.subscription_details?.subscription ??
          undefined
        if (subId) {
          await sb
            .from('restaurants')
            .update({ subscription_status: 'past_due' })
            .eq('stripe_subscription_id', subId)
        }
        break
      }
    }
  } catch (e) {
    // Acknowledge anyway: Stripe retries won't fix a data problem,
    // and the subscription.updated stream re-syncs state over time.
    console.error('billing webhook sync', event.type, e)
  }
  return NextResponse.json({ received: true })
}
