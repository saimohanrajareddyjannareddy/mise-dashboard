import { NextRequest, NextResponse } from 'next/server'
import { parseInvoiceBytes } from '@/lib/parse-invoice'

/* Thin wrapper over lib/parse-invoice (shared with the email scanner). */
export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  try {
    const bytes = Buffer.from(await file.arrayBuffer())
    const parsed = await parseInvoiceBytes(bytes, file.type || 'application/octet-stream')
    return NextResponse.json(parsed)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Parse failed' },
      { status: 500 }
    )
  }
}
