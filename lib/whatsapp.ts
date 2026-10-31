import { createHmac, timingSafeEqual } from 'crypto'

/*
 * WhatsApp Business Platform (Cloud API) helpers — server-side only.
 *
 * Configuration (Vercel env on the live project):
 *   WHATSAPP_ACCESS_TOKEN    — Meta access token (test token in test
 *                              mode; a system-user token for production)
 *   WHATSAPP_PHONE_NUMBER_ID — the sending number's phone_number_id
 *   WHATSAPP_VERIFY_TOKEN    — our own string, pasted into Meta's
 *                              webhook config; proves the GET is Meta
 *   WHATSAPP_APP_SECRET      — Meta app secret; when set, webhook
 *                              POST signatures are enforced
 *   WHATSAPP_INTAKE_NUMBER   — display form of the intake number,
 *                              shown in Settings (e.g. +1 555-010-1234)
 *   WHATSAPP_GRAPH_VERSION   — optional, defaults to v23.0
 */

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v23.0'

export function whatsappConfigured(): boolean {
  return Boolean(
    process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID
  )
}

export function whatsappVerifyToken(): string | null {
  return process.env.WHATSAPP_VERIFY_TOKEN || null
}

export function whatsappIntakeNumber(): string | null {
  return process.env.WHATSAPP_INTAKE_NUMBER || null
}

/** Verify Meta's X-Hub-Signature-256 over the raw request body. */
export function verifyWhatsappSignature(
  rawBody: string,
  signatureHeader: string | null
): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET
  // Test mode may run before the app secret is pasted in; the route
  // logs that case. Once the secret exists, signatures are enforced.
  if (!secret) return true
  if (!signatureHeader?.startsWith('sha256=')) return false
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  const provided = signatureHeader.slice('sha256='.length)
  const a = Buffer.from(expected)
  const b = Buffer.from(provided)
  return a.length === b.length && timingSafeEqual(a, b)
}

function graphUrl(path: string): string {
  return `https://graph.facebook.com/${GRAPH_VERSION}/${path}`
}

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN ?? ''}` }
}

/**
 * Two-step media download: the media id resolves to a temporary
 * signed URL, and the bytes come from that URL (both calls need
 * the access token).
 */
export async function downloadWhatsappMedia(
  mediaId: string
): Promise<{ bytes: Buffer; mime: string }> {
  const metaResp = await fetch(graphUrl(mediaId), { headers: authHeaders() })
  if (!metaResp.ok) {
    throw new Error(`media lookup failed (HTTP ${metaResp.status})`)
  }
  const meta = (await metaResp.json()) as { url?: string; mime_type?: string }
  if (!meta.url) throw new Error('media lookup returned no URL')
  const fileResp = await fetch(meta.url, { headers: authHeaders() })
  if (!fileResp.ok) {
    throw new Error(`media download failed (HTTP ${fileResp.status})`)
  }
  const bytes = Buffer.from(await fileResp.arrayBuffer())
  return { bytes, mime: meta.mime_type || 'application/octet-stream' }
}

/**
 * Send a free-form text reply. Only valid inside the 24-hour
 * customer-service window the sender opened by messaging us —
 * which is always the case for intake replies. Failures are
 * swallowed by callers: a lost reply must never fail an import.
 */
export async function sendWhatsappText(to: string, body: string): Promise<void> {
  if (!whatsappConfigured()) return
  const resp = await fetch(
    graphUrl(`${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`),
    {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { body, preview_url: false },
      }),
    }
  )
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '')
    throw new Error(`WhatsApp reply failed (HTTP ${resp.status}) ${detail.slice(0, 200)}`)
  }
}

/** Digits-only international form, matching WhatsApp's `from`. */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `1${digits}`
  return digits
}
