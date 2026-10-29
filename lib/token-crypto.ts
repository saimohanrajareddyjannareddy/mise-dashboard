import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

/*
 * Server-only encryption for third-party access tokens (Clover OAuth).
 *
 * Key: TOKEN_ENCRYPTION_KEY env var — base64-encoded 32 bytes, set in
 * Vercel, never in the repo and never sent to the browser. Generate one
 * with: openssl rand -base64 32
 *
 * Stored format: base64( iv(12 bytes) || authTag(16 bytes) || ciphertext )
 * so a single text column holds everything decryption needs.
 */

function key(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY
  if (!raw) throw new Error('TOKEN_ENCRYPTION_KEY not set')
  const buf = Buffer.from(raw, 'base64')
  if (buf.length !== 32) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be base64 for exactly 32 bytes')
  }
  return buf
}

export function encryptToken(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

export function decryptToken(packed: string): string {
  const buf = Buffer.from(packed, 'base64')
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const enc = buf.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', key(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
}
