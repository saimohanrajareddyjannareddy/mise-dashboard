import { NextResponse } from 'next/server'
import { whatsappConfigured, whatsappIntakeNumber } from '@/lib/whatsapp'

/*
 * WhatsApp intake configuration probe for the Settings card.
 * Reports only whether the server-side Meta credentials exist
 * (never their values) and the public intake number to display.
 */
export async function GET() {
  return NextResponse.json({
    configured: whatsappConfigured(),
    intake_number: whatsappIntakeNumber(),
  })
}
