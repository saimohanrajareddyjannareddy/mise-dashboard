'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRestaurant } from '@/lib/restaurant'
import { Upload, FileText, CheckCircle, AlertCircle, Download, X, Store } from 'lucide-react'

type ParsedItem = {
  item_name: string
  display_name: string
  category: string
  quantity: number
  purchase_unit: string
  unit_price: number
  total: number
}

type ParsedInvoice = {
  vendor: string
  invoice_number: string | null
  invoice_date: string | null
  subtotal: number | null
  tax: number | null
  total: number | null
  items: ParsedItem[]
}

const CATEGORY_COLORS: Record<string, string> = {
  Proteins: 'bg-red-100 text-red-700',
  Produce: 'bg-green-100 text-green-700',
  Dairy: 'bg-blue-100 text-blue-700',
  'Dry Goods': 'bg-yellow-100 text-yellow-700',
  Beverages: 'bg-cyan-100 text-cyan-700',
  Packaging: 'bg-gray-100 text-gray-600',
  Cleaning: 'bg-teal-100 text-teal-700',
  Credits: 'bg-rose-100 text-rose-700',
  Other: 'bg-amber-100 text-amber-700',
}

/* Comparison key for supplier names: case/whitespace-insensitive. */
function normKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

/*
 * Reconciliation checks on an extraction. Any failure flags the invoice
 * for the human review queue at save time — this is how AI misreads
 * (wrong totals, dropped lines) get caught instead of landing silently
 * in the books. Tolerances are loose on purpose: flag real mismatches,
 * not rounding noise.
 */
function reviewFlagsFor(p: ParsedInvoice): string[] {
  const flags: string[] = []
  const lineSum = p.items.reduce((s, i) => s + (i.total || 0), 0)
  if (p.total != null && Math.abs(lineSum - p.total) > Math.max(0.05, Math.abs(p.total) * 0.01)) {
    flags.push(
      `Line items add up to $${lineSum.toFixed(2)} but the invoice total says $${p.total.toFixed(2)}`
    )
  }
  const badLines = p.items.filter(
    (i) =>
      i.quantity > 0 &&
      i.unit_price > 0 &&
      Math.abs(i.quantity * i.unit_price - (i.total || 0)) >
        Math.max(0.05, Math.abs(i.total || 0) * 0.02)
  )
  if (badLines.length > 0) {
    flags.push(
      `${badLines.length} line${badLines.length > 1 ? 's have' : ' has'} qty × price that doesn't match the line total`
    )
  }
  if (!p.vendor || p.vendor.trim().toLowerCase() === 'unknown') {
    flags.push('Supplier name could not be read')
  }
  if (!p.invoice_date) {
    flags.push('Invoice date could not be read')
  }
  return flags
}

function downloadCSVTemplate() {
  const headers = ['item_name', 'display_name', 'category', 'quantity', 'purchase_unit', 'unit_price', 'total', 'invoice_date', 'invoice_number', 'vendor']
  const example = ['CHIX BRST BNLS', 'Chicken Breast Boneless', 'Protein', '40', 'lb', '3.49', '139.60', '2024-04-20', 'INV-001', 'Restaurant Depot']
  const csv = [headers, example].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  a.download = 'invoice-template.csv'
  a.click()
}

export default function UploadPage() {
  const { current } = useRestaurant()
  const restaurantId = current?.id ?? null
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<'idle' | 'parsing' | 'done' | 'saving' | 'saved' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [parsed, setParsed] = useState<ParsedInvoice | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [savedReview, setSavedReview] = useState(false)
  // Known supplier spellings for this restaurant: catalog display names
  // win, then spellings from past invoices. Used to reuse one canonical
  // spelling per supplier (no "RESTAURANT DEPOT" vs "Restaurant Depot"
  // fragmentation) and to detect genuinely new suppliers.
  const [vendorCanon, setVendorCanon] = useState<Map<string, string>>(new Map())
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!restaurantId) return
    let cancelled = false
    ;(async () => {
      const map = new Map<string, string>()
      const { data: vs } = await supabase.from('vendors').select('display_name')
      vs?.forEach((v) => map.set(normKey(v.display_name), v.display_name))
      const { data: hs } = await supabase
        .from('invoice_headers')
        .select('vendor')
        .eq('restaurant_id', restaurantId)
      hs?.forEach((h) => {
        if (h.vendor && !map.has(normKey(h.vendor))) map.set(normKey(h.vendor), h.vendor)
      })
      if (!cancelled) setVendorCanon(map)
    })()
    return () => {
      cancelled = true
    }
  }, [restaurantId])

  function reset() {
    setFile(null); setParsed(null); setStatus('idle'); setErrorMsg(''); setSavedId(null); setSavedReview(false)
  }

  async function parseFile(f: File) {
    setFile(f); setStatus('parsing'); setParsed(null); setErrorMsg('')
    const form = new FormData()
    form.append('file', f)
    try {
      const resp = await fetch('/api/parse-invoice', { method: 'POST', body: form })
      const json = await resp.json()
      if (!resp.ok) { setStatus('error'); setErrorMsg(json.error || 'Parse failed'); return }
      setParsed(json); setStatus('done')
    } catch (e: any) {
      setStatus('error'); setErrorMsg(e.message || 'Network error')
    }
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) parseFile(f)
  }, [])

  async function saveInvoice() {
    if (!parsed || !restaurantId) return
    setStatus('saving')
    try {
      // Resolve the supplier: reuse the canonical spelling if we've seen
      // this name before, and register the vendor in the catalog (RPC
      // from sql/011 — matches an existing vendor or creates a
      // restaurant-scoped one, links it, and remembers this spelling).
      // Any failure (e.g. 011 not run yet) just skips the linking.
      let vendorName = (parsed.vendor || 'Unknown').trim().replace(/\s+/g, ' ')
      let vendorId: string | null = null
      if (vendorName && vendorName.toLowerCase() !== 'unknown') {
        vendorName = vendorCanon.get(normKey(vendorName)) ?? vendorName
        try {
          const { data: vid, error: vErr } = await supabase.rpc('register_invoice_vendor', {
            p_restaurant_id: restaurantId,
            p_display_name: vendorName,
            p_alias_text: parsed.vendor,
          })
          if (!vErr && vid) vendorId = vid as string
        } catch {
          // Pre-011 database: proceed without the catalog link.
        }
      }

      // Register the upload in invoice_files so the AI Automation page counts it.
      // drive_file_id is UNIQUE NOT NULL; synthesize one since uploads don't go through Drive.
      const { data: fileRow, error: fErr } = await supabase
        .from('invoice_files')
        .insert({
          restaurant_id: restaurantId,
          drive_file_id: `upload-${crypto.randomUUID()}`,
          filename: file?.name ?? 'manual-upload',
          file_date: parsed.invoice_date,
          file_total: parsed.total ?? parsed.items.reduce((s, i) => s + (i.total || 0), 0),
          status: 'done',
          source: 'upload',
          vendor_id: vendorId,
          processed_at: new Date().toISOString(),
        })
        .select('id')
        .single()
      if (fErr || !fileRow) throw new Error(fErr?.message || 'Failed to register file')

      // Reconciliation check: extractions that don't add up go to the
      // review queue instead of silently landing in the books.
      const flags = reviewFlagsFor(parsed)
      const headerPayload: Record<string, unknown> = {
        restaurant_id: restaurantId,
        file_id: fileRow.id,
        vendor: vendorName,
        invoice_number: parsed.invoice_number,
        invoice_date: parsed.invoice_date,
        subtotal: parsed.subtotal,
        tax: parsed.tax,
        total: parsed.total ?? parsed.items.reduce((s, i) => s + (i.total || 0), 0),
      }
      if (flags.length > 0) {
        headerPayload.review_status = 'needs_review'
        headerPayload.review_reason = flags.join('; ')
      }
      let { data: header, error: hErr } = await supabase
        .from('invoice_headers')
        .insert(headerPayload)
        .select('id')
        .single()
      // Until sql/010_review_queue.sql runs, the review columns don't
      // exist — retry without them so uploads never break.
      if (hErr && hErr.message.includes('review_status')) {
        delete headerPayload.review_status
        delete headerPayload.review_reason
        ;({ data: header, error: hErr } = await supabase
          .from('invoice_headers')
          .insert(headerPayload)
          .select('id')
          .single())
      }
      if (hErr || !header) throw new Error(hErr?.message || 'Failed to save header')

      const lineItems = parsed.items.map(item => ({
        header_id: header.id,
        restaurant_id: restaurantId,
        invoice_date: parsed.invoice_date,
        item_name: item.item_name,
        display_name: item.display_name,
        category: item.category,
        purchase_unit: item.purchase_unit,
        unit_qty: item.purchase_unit === 'lb' || item.purchase_unit === 'each' ? item.quantity : 0,
        case_qty: item.purchase_unit === 'case' ? item.quantity : 0,
        unit_price: item.unit_price,
        total: item.total,
      }))
      const { error: lErr } = await supabase.from('invoice_lines').insert(lineItems)
      if (lErr) throw new Error(lErr.message)

      setSavedId(header.id); setSavedReview(flags.length > 0); setStatus('saved')
    } catch (e: any) {
      setStatus('error'); setErrorMsg(e.message || 'Save failed')
    }
  }

  const netTotal = parsed ? parsed.items.reduce((s, i) => s + (i.total || 0), 0) : 0
  const credits = parsed ? parsed.items.filter(i => (i.total || 0) < 0) : []
  const regular = parsed ? parsed.items.filter(i => (i.total || 0) >= 0) : []

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Upload Invoice</h1>
          <p className="text-gray-500 text-sm">Drop any invoice — PDF, image, Excel, or CSV — and AI will parse it.</p>
        </div>
        <button onClick={downloadCSVTemplate}
          className="flex items-center gap-2 px-4 py-2 bg-white border rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition">
          <Download size={14} /> CSV Template
        </button>
      </div>

      {status === 'saved' && savedId ? (
        savedReview ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 flex items-start gap-4">
            <AlertCircle size={24} className="text-amber-500 mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold text-amber-800 mb-1">Saved — flagged for review</div>
              <div className="text-sm text-amber-700 mb-3">
                Some numbers on this invoice didn&apos;t add up, so it&apos;s in the review queue instead of
                straight into your books. Check it against the original when you get a moment.
              </div>
              <div className="flex gap-3">
                <a href="/dashboard/review"
                  className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm hover:bg-amber-600 transition">
                  Go to Review Queue
                </a>
                <a href={`/dashboard/invoices/${savedId}`}
                  className="px-4 py-2 bg-white border border-amber-300 text-amber-700 rounded-lg text-sm hover:bg-amber-50 transition">
                  View Invoice
                </a>
                <button onClick={reset}
                  className="px-4 py-2 bg-white border border-amber-300 text-amber-700 rounded-lg text-sm hover:bg-amber-50 transition">
                  Upload Another
                </button>
              </div>
            </div>
          </div>
        ) : (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 flex items-start gap-4">
          <CheckCircle size={24} className="text-green-500 mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold text-green-800 mb-1">Invoice saved successfully</div>
            <div className="text-sm text-green-600 mb-3">{parsed?.items.length} line items added to your records.</div>
            <div className="flex gap-3">
              <a href={`/dashboard/invoices/${savedId}`}
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition">
                View Invoice
              </a>
              <button onClick={reset}
                className="px-4 py-2 bg-white border border-green-300 text-green-700 rounded-lg text-sm hover:bg-green-50 transition">
                Upload Another
              </button>
            </div>
          </div>
        </div>
        )
      ) : status === 'idle' || (!file && status !== 'error') ? (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-16 text-center cursor-pointer transition ${dragging ? 'border-amber-500 bg-amber-50' : 'border-gray-200 hover:border-amber-400 hover:bg-gray-50'}`}>
          <input ref={inputRef} type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.xlsx,.xls,.csv"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) parseFile(f) }} />
          <Upload size={40} className={`mx-auto mb-4 ${dragging ? 'text-amber-500' : 'text-gray-300'}`} />
          <div className="text-gray-700 font-medium mb-1">Drop invoice here or click to browse</div>
          <div className="text-gray-400 text-sm">PDF, PNG, JPG, Excel, CSV supported</div>
        </div>
      ) : null}

      {status === 'parsing' && (
        <div className="border rounded-xl p-12 text-center">
          <div className="flex items-center justify-center gap-3 text-gray-500">
            <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
            <span>Parsing <span className="font-medium text-gray-700">{file?.name}</span> with AI...</span>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 flex items-start gap-3">
          <AlertCircle size={18} className="text-red-500 mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="font-medium text-red-800 mb-0.5">Parse failed</div>
            <div className="text-sm text-red-600">{errorMsg}</div>
          </div>
          <button onClick={reset} className="text-red-400 hover:text-red-600"><X size={16} /></button>
        </div>
      )}

      {(status === 'done' || status === 'saving') && parsed && (
        <>
          <div className="bg-white rounded-xl border p-6 mb-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <FileText size={16} className="text-amber-500" />
                  <span className="font-semibold text-gray-800">{parsed.vendor || 'Unknown Vendor'}</span>
                </div>
                <div className="text-sm text-gray-500">
                  {parsed.invoice_date && <span>{parsed.invoice_date} · </span>}
                  {parsed.invoice_number && <span>Invoice #{parsed.invoice_number} · </span>}
                  {regular.length} items{credits.length > 0 && `, ${credits.length} credit${credits.length > 1 ? 's' : ''}`}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-400 uppercase tracking-wide">Net Total</div>
                <div className="text-2xl font-bold text-amber-500">
                  ${netTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          </div>

          {(() => {
            const raw = (parsed.vendor || '').trim().replace(/\s+/g, ' ')
            if (!raw || raw.toLowerCase() === 'unknown') return null
            if (vendorCanon.has(normKey(raw))) return null
            return (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 flex items-start gap-3">
                <Store size={18} className="text-blue-500 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <span className="font-medium text-blue-800">New supplier: {raw}. </span>
                  <span className="text-blue-600">
                    First invoice from them — saving adds them to your supplier list automatically. No setup needed.
                  </span>
                </div>
              </div>
            )
          })()}

          {(() => {
            const flags = reviewFlagsFor(parsed)
            if (flags.length === 0) return null
            return (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex items-start gap-3">
                <AlertCircle size={18} className="text-amber-500 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <div className="font-medium text-amber-800 mb-1">This one needs a human look</div>
                  <ul className="text-amber-700 list-disc list-inside space-y-0.5">
                    {flags.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                  <div className="text-amber-600 mt-1">Saving will send it to the review queue.</div>
                </div>
              </div>
            )
          })()}

          <div className="bg-white rounded-xl border overflow-hidden mb-6">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr className="text-gray-400 text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-3">Item</th>
                  <th className="text-left px-4 py-3">Category</th>
                  <th className="text-right px-4 py-3">Qty</th>
                  <th className="text-right px-4 py-3">Unit</th>
                  <th className="text-right px-4 py-3">Unit Price</th>
                  <th className="text-right px-4 py-3">Total</th>
                </tr>
              </thead>
              <tbody>
                {regular.map((item, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{item.display_name}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${CATEGORY_COLORS[item.category] || CATEGORY_COLORS.Other}`}>{item.category}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{item.quantity}</td>
                    <td className="px-4 py-3 text-right text-gray-400 text-xs">{item.purchase_unit}</td>
                    <td className="px-4 py-3 text-right text-gray-600">${(item.unit_price ?? 0).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">${(item.total ?? 0).toFixed(2)}</td>
                  </tr>
                ))}
                {credits.map((item, i) => (
                  <tr key={`cr-${i}`} className="border-b last:border-0 bg-red-50">
                    <td className="px-4 py-3 font-medium text-red-700">{item.display_name} <span className="text-xs font-normal ml-1">(credit/return)</span></td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${CATEGORY_COLORS[item.category] || CATEGORY_COLORS.Other}`}>{item.category}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-red-600">{item.quantity}</td>
                    <td className="px-4 py-3 text-right text-red-400 text-xs">{item.purchase_unit}</td>
                    <td className="px-4 py-3 text-right text-red-600">${(item.unit_price ?? 0).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-red-600">${(item.total ?? 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={saveInvoice} disabled={status === 'saving'}
              className="px-6 py-2.5 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50 transition">
              {status === 'saving' ? 'Saving...' : 'Save to Records'}
            </button>
            <button onClick={reset}
              className="px-4 py-2.5 bg-white border rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition">
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  )
}
