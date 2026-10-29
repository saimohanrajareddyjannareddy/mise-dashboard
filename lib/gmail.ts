/*
 * Google OAuth + Gmail API helpers (server-side only).
 *
 * Env vars (Vercel):
 *   GOOGLE_CLIENT_ID      — OAuth client from Google Cloud Console
 *   GOOGLE_CLIENT_SECRET  — its secret
 * The OAuth client's authorized redirect URI must be:
 *   https://<your-domain>/api/email/callback
 * Scope requested: gmail.readonly (+ email for the address label).
 * We never send, modify, or delete mail.
 */

export function googleConfigured(): boolean {
  return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET
}

export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'email',
]

export async function exchangeGoogleCode(
  code: string,
  redirectUri: string
): Promise<{ access_token: string; refresh_token?: string }> {
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  if (!resp.ok) throw new Error(`Google token exchange failed: ${await resp.text()}`)
  return resp.json()
}

export async function refreshGoogleAccessToken(refreshToken: string): Promise<string> {
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
  })
  if (!resp.ok) throw new Error(`Google token refresh failed: ${await resp.text()}`)
  const body = await resp.json()
  return body.access_token as string
}

async function gmailFetch(accessToken: string, path: string) {
  const resp = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!resp.ok) throw new Error(`Gmail API ${resp.status}: ${await resp.text()}`)
  return resp.json()
}

export async function gmailProfileEmail(accessToken: string): Promise<string | null> {
  const profile = await gmailFetch(accessToken, 'profile')
  return (profile.emailAddress as string) ?? null
}

export async function listMessagesWithAttachments(
  accessToken: string,
  afterEpochSec: number,
  maxMessages = 100
): Promise<string[]> {
  const ids: string[] = []
  let pageToken: string | undefined
  while (ids.length < maxMessages) {
    const q = encodeURIComponent(`has:attachment after:${afterEpochSec}`)
    const page = await gmailFetch(
      accessToken,
      `messages?q=${q}&maxResults=100${pageToken ? `&pageToken=${pageToken}` : ''}`
    )
    for (const m of page.messages ?? []) ids.push(m.id as string)
    pageToken = page.nextPageToken
    if (!pageToken) break
  }
  return ids.slice(0, maxMessages)
}

export type GmailAttachment = {
  filename: string
  mimeType: string
  attachmentId: string
}

export type GmailMessage = {
  id: string
  from: string
  subject: string
  attachments: GmailAttachment[]
}

type GmailPart = {
  filename?: string
  mimeType?: string
  body?: { attachmentId?: string }
  parts?: GmailPart[]
}

function collectAttachments(part: GmailPart | undefined, out: GmailAttachment[]) {
  if (!part) return
  if (part.filename && part.body?.attachmentId) {
    out.push({
      filename: part.filename,
      mimeType: part.mimeType ?? 'application/octet-stream',
      attachmentId: part.body.attachmentId,
    })
  }
  for (const child of part.parts ?? []) collectAttachments(child, out)
}

export async function getMessage(
  accessToken: string,
  id: string
): Promise<GmailMessage> {
  const msg = await gmailFetch(accessToken, `messages/${id}?format=full`)
  const headers: Array<{ name: string; value: string }> = msg.payload?.headers ?? []
  const header = (name: string) =>
    headers.find((h) => h.name.toLowerCase() === name)?.value ?? ''
  const attachments: GmailAttachment[] = []
  collectAttachments(msg.payload as GmailPart, attachments)
  return { id, from: header('from'), subject: header('subject'), attachments }
}

export async function getAttachmentBytes(
  accessToken: string,
  messageId: string,
  attachmentId: string
): Promise<Buffer> {
  const body = await gmailFetch(
    accessToken,
    `messages/${messageId}/attachments/${attachmentId}`
  )
  const b64url = body.data as string
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(b64, 'base64')
}

/* "Sysco <billing@sysco.com>" / "billing@sysco.com" → "billing@sysco.com" */
export function extractEmailAddress(from: string): string {
  const match = from.match(/<([^>]+)>/)
  return (match ? match[1] : from).trim().toLowerCase()
}
