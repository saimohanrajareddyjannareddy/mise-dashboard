/*
 * Clover OAuth configuration (server-side only).
 *
 * Env vars (Vercel):
 *   CLOVER_APP_ID      — the app's ID from the Clover developer dashboard
 *   CLOVER_APP_SECRET  — the app's secret (never exposed to the browser)
 *   CLOVER_ENV         — 'sandbox' to target Clover sandbox merchants,
 *                        anything else (or unset) targets production
 *
 * The app's OAuth redirect URL registered in the Clover developer
 * dashboard must be:  https://<your-domain>/api/clover/callback
 */

export function cloverEnv(): 'sandbox' | 'production' {
  return process.env.CLOVER_ENV === 'sandbox' ? 'sandbox' : 'production'
}

export function cloverOauthHost(): string {
  return cloverEnv() === 'sandbox'
    ? 'https://sandbox.dev.clover.com'
    : 'https://www.clover.com'
}

export function cloverOauthConfigured(): boolean {
  return !!process.env.CLOVER_APP_ID && !!process.env.CLOVER_APP_SECRET
}
