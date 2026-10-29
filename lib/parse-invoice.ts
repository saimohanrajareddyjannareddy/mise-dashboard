import { categorize } from './categorize'

/*
 * Invoice extraction core, shared by the upload route and the email
 * scanner. Bytes + MIME type in, structured invoice out (Claude
 * vision/document parsing, then the same item normalization the
 * upload flow has always applied).
 */

export type ParsedItem = {
  item_name: string
  display_name: string
  category: string
  quantity: number
  purchase_unit: string
  unit_price: number
  total: number
}

export type ParsedInvoice = {
  vendor: string
  invoice_number: string | null
  invoice_date: string | null
  subtotal: number | null
  tax: number | null
  total: number | null
  items: ParsedItem[]
}

const SYSTEM_PROMPT = `You are an invoice parser. Extract all line items from the invoice and return ONLY valid JSON.

Output this exact schema (no markdown, no explanation):
{
  "vendor": "vendor name",
  "invoice_number": "string or null",
  "invoice_date": "YYYY-MM-DD or null",
  "subtotal": number or null,
  "tax": number or null,
  "total": number or null,
  "items": [
    {
      "item_name": "exact name from invoice",
      "display_name": "clean readable name (expand abbreviations, proper case)",
      "quantity": number,
      "purchase_unit": "lb | each | case",
      "unit_price": number,
      "total": number
    }
  ]
}

Rules:
- purchase_unit: "lb" if sold by weight, "case" if sold as a case of multiple units, "each" for everything else
- Skip non-product rows: taxes, fees, subtotals, payment rows, tips
- display_name: expand abbreviations (SHR→Shrimp, CHIX→Chicken, BTR→Butter, BNLS→Boneless, BRST→Breast, THGH→Thigh, PROD→remove, FZ→Frozen, GARLC→Garlic, HAL→Halal, etc.)
- Negative lines are NOT all the same — read them carefully:
  - DISCOUNT: a line with quantity 0 (or no quantity) and a negative amount naming an item that is also purchased on this invoice is a price discount on that item (Restaurant Depot prints e.g. "0  25  -$19.40", meaning 25% off the item above). Do NOT emit it as its own item — subtract it from the matching item's total and recompute that item's unit_price; its quantity does not change.
  - RETURN: a line with a NEGATIVE quantity is goods the buyer gave back. Net it against the matching purchased item: reduce that item's quantity and total by the returned amounts, and if the net quantity reaches 0, omit the item entirely. Emit a standalone negative item ONLY when the returned item was not purchased on this same invoice. A PARTIAL return (returned quantity smaller than purchased quantity) still leaves the item on the invoice with its remaining quantity and total — e.g. bought 2 cases for $126.80, returned 1 case for $63.40 → the item stays: quantity 1 case, total $63.40. Never drop a partially returned item.
  - "Previous Balance" and similar account-balance rows are not products and are not part of this invoice's subtotal — skip them entirely.
- If quantity is missing assume 1
- All numbers as floats, no currency symbols`

export async function parseInvoiceBytes(
  bytes: Buffer,
  mime: string
): Promise<ParsedInvoice> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set in environment')

  const base64 = bytes.toString('base64')
  let contentBlock: Record<string, unknown>
  if (mime === 'application/pdf') {
    contentBlock = {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: base64 },
    }
  } else if (mime.startsWith('image/')) {
    contentBlock = {
      type: 'image',
      source: { type: 'base64', media_type: mime, data: base64 },
    }
  } else {
    contentBlock = {
      type: 'text',
      text: `Invoice content:\n\n${bytes.toString('utf-8')}`,
    }
  }

  const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'pdfs-2024-09-25',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-7',
      max_tokens: 16384,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            contentBlock,
            { type: 'text', text: 'Parse this invoice and return the JSON.' },
          ],
        },
      ],
    }),
  })

  if (!claudeResp.ok) {
    const err = await claudeResp.text()
    throw new Error(`Claude API error (${claudeResp.status}): ${err}`)
  }

  const result = await claudeResp.json()
  if (result.stop_reason === 'max_tokens') {
    // A many-line invoice overflowed the response budget — say so
    // plainly instead of failing JSON.parse on a truncated string.
    throw new Error(
      'This invoice has too many lines to read in one pass. Try uploading it as two parts.'
    )
  }
  let raw: string = result.content[0].text.trim()
  raw = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')
  const parsed = JSON.parse(raw) as ParsedInvoice

  for (const item of parsed.items || []) {
    item.category = categorize(item.item_name || '')
    item.display_name = item.display_name || item.item_name
    item.purchase_unit = item.purchase_unit || 'each'
    const qty = item.quantity || 1
    const price = item.unit_price || 0
    const total = item.total || 0
    if (price && !total) item.total = Math.round(price * qty * 100) / 100
    else if (total && !price)
      item.unit_price = Math.round((total / qty) * 10000) / 10000
  }

  // Discount backstop: a negative line with quantity 0 naming a
  // purchased item is a register discount (see the prompt rules) —
  // fold it into that item even if the model emitted it separately.
  // Genuine returns carry a negative quantity and are left alone.
  if (parsed.items) {
    const norm = (s: string) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ')
    const kept: typeof parsed.items = []
    for (const item of parsed.items) {
      if ((item.total || 0) < 0 && !item.quantity) {
        const parent = kept.find(
          (k) => (k.total || 0) > 0 && norm(k.item_name) === norm(item.item_name)
        )
        if (parent) {
          parent.total = Math.round(((parent.total || 0) + item.total) * 100) / 100
          const q = parent.quantity || 1
          parent.unit_price = Math.round((parent.total / q) * 10000) / 10000
          continue
        }
      }
      kept.push(item)
    }
    parsed.items = kept
  }

  return parsed
}
