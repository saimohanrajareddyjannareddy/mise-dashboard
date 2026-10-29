import { NextResponse } from 'next/server'
import { cloverEnv, cloverOauthConfigured } from '@/lib/clover-oauth'

/* Lets the Settings page show the "Connect with Clover" button only
 * when the server actually has the OAuth app credentials. */
export async function GET() {
  return NextResponse.json({
    oauth_configured: cloverOauthConfigured(),
    env: cloverEnv(),
  })
}
