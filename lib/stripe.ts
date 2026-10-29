import Stripe from 'stripe'

/*
 * Stripe billing (server-side only).
 *
 * Env vars (Vercel):
 *   STRIPE_SECRET_KEY      — sk_live_… / sk_test_…
 *   STRIPE_PRICE_ID        — the per-location monthly Price (price_…)
 *                            created in the Stripe dashboard; the
 *                            amount lives there, never in code
 *   STRIPE_WEBHOOK_SECRET  — whsec_… for the /api/billing/webhook
 *                            endpoint
 *
 * One Stripe Customer per restaurant OWNER is possible, but the
 * schema models one subscription per restaurant, so each restaurant
 * gets its own Customer + Subscription (001_foundation comments).
 */

export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_PRICE_ID
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY not set')
  return new Stripe(key)
}

/* Map Stripe's subscription statuses onto the values the
 * restaurants.subscription_status CHECK constraint allows. */
export function mapStripeStatus(status: string): string {
  switch (status) {
    case 'trialing':
    case 'active':
    case 'past_due':
    case 'canceled':
    case 'paused':
    case 'incomplete':
      return status
    case 'unpaid':
      return 'past_due'
    case 'incomplete_expired':
      return 'canceled'
    default:
      return 'incomplete'
  }
}
