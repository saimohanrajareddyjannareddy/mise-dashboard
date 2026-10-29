'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRestaurant } from '@/lib/restaurant'
import { Upload, FileText, CheckCircle, AlertCircle, Download, X, Store } from 'lucide-react'
import { reviewFlagsFor } from '@/lib/review-flags'
import ReceiptScanner from '@/components/ReceiptScanner'
import { useActivity } from '@/lib/activity'

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

const CATEGORIES = ['Proteins', 'Produce', 'Dairy', 'Dry Goods', 'Beverages', 'Packaging', 'Cleaning', 'Credits', 'Other']

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

/* reviewFlagsFor lives in lib/review-flags (shared with the email scanner). */
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
  const activity = useActivity()
  const [dragging, setDragging] = useState(false)
  const [fileName, setFileName] = useState('')
  const [watchId, setWatchId] = useState<string | null>(null)
  const adoptedRef = useRef<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'parsing' | 'done' | 'saving' | 'saved' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [parsed, setParsed] = useState<ParsedInvoice | null>(null)
  // Supplier name, editable in the preview: handwritten slips often
  // have no supplier printed on them, so the owner types it. Empty =
  // fall back to whatever the parser read.
  const [vendorEdit, setVendorEdit] = useState('')
  const [savedId, setSavedId] = useState<string | null>(null)
  const [savedReview, setSavedReview] = useState(false)
  // Known supplier spellings for this restaurant: catalog display names
  // win, then spellings from past invoices. Used to reuse one canonical
  // spelling per supplier (no "RESTAURANT DEPOT" vs "Restaurant Depot"
  // fragmentation) and to detect genuinely new suppliers.
  const [vendorCanon, setVendorCanon] = useState<Map<string, string>>(new Map())
  // Per-supplier category memory: what this restaurant's past approved
  // invoices from the same supplier called each item. A supplier's own
  // naming is the ground truth — repeat items inherit their remembered
  // category in the preview, so nobody hand-writes per-supplier rules,
  // and every correction the owner saves teaches the next invoice.
  const [categoryMemory, setCategoryMemory] = useState<Map<string, string>>(new Map())
  const memoryAppliedRef = useRef<string>('')
  const inputRef = useRef<HTMLInputElement>(null)
  const [scannerOpen, setScannerOpen] = useState(false)

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

      // Category memory from the 60 most recent approved invoices.
      const { data: recent } = await supabase
        .from('invoice_headers')
        .select('id, vendor')
        .eq('restaurant_id', restaurantId)
        .neq('review_status', 'needs_review')
        .order('invoice_date', { ascending: false })
        .limit(60)
      if (recent && recent.length > 0) {
        const vendorById = new Map(recent.map((h) => [h.id, h.vendor || '']))
        const rank = new Map(recent.map((h, i) => [h.id, i]))
        const { data: lines } = await supabase
          .from('invoice_lines')
          .select('header_id, item_name, category')
          .in('header_id', recent.map((h) => h.id))
        const mem = new Map<string, string>()
        const ordered = [...(lines || [])].sort(
          (a, b) => (rank.get(a.header_id) ?? 0) - (rank.get(b.header_id) ?? 0)
        )
        for (const l of ordered) {
          if (!l.category || l.category === 'Other') continue
          const v = normKey(vendorById.get(l.header_id) || '')
          if (!v || v === 'unknown') continue
          const key = `${v}|${normKey(l.item_name || '')}`
          if (!mem.has(key)) mem.set(key, l.category)
        }
        if (!cancelled) setCategoryMemory(mem)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [restaurantId])

  function reset() {
    setFileName(''); setWatchId(null); setParsed(null); setVendorEdit(''); setStatus('idle'); setErrorMsg(''); setSavedId(null); setSavedReview(false); memoryAppliedRef.current = ''
  }

  // Parsing runs in the activity store (dashboard layout), NOT in
  // this page — so it keeps going if the user navigates away, and
  // the result is adopted here when it lands.
  function parseFile(f: File) {
    setParsed(null); setErrorMsg(''); setSavedId(null); setSavedReview(false)
    setFileName(f.name)
    setStatus('parsing')
    setWatchId(activity.startParse(f))
  }

  // Adopt a finished parse: the one this page started (watchId), or
  // one that completed while the user was on another page
  // (activity.pendingParse — picked up when this page is idle).
  useEffect(() => {
    const target =
      (watchId ? activity.entries.find((e) => e.id === watchId) : undefined) ??
      (status === 'idle' ? activity.pendingParse : null)
    if (!target || adoptedRef.current === target.id) return
    if (target.status === 'done' && target.parsed) {
      adoptedRef.current = target.id
      activity.consumeParse(target.id)
      setParsed(target.parsed as ParsedInvoice)
      const v = ((target.parsed as ParsedInvoice).vendor || '').trim()
      setVendorEdit(/^unknown/i.test(v) ? '' : v)
      setFileName(target.fileName || target.title)
      setStatus('done')
      setWatchId(null)
    } else if (target.status === 'error') {
      adoptedRef.current = target.id
      setStatus('error')
      setErrorMsg(target.detail || 'Parse failed')
      setWatchId(null)
    }
  }, [activity, watchId, status])

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
      // The preview's editable supplier field wins over the parsed
      // name; an "Unknown..." parser output counts as no name.
      const rawVendor = (vendorEdit.trim() || parsed.vendor || '').trim()
      let vendorName = /^unknown/i.test(rawVendor) || !rawVendor
        ? 'Unknown'
        : rawVendor.replace(/\s+/g, ' ')
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
          filename: fileName || 'manual-upload',
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
      const flags = reviewFlagsFor({ ...parsed, vendor: vendorName })
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

  // The preview is fully editable: the owner can fix a misread price,
  // quantity or name, delete a bogus line, or add a missed one before
  // saving. Edits write straight into `parsed`, so the totals, the
  // review flags and the save all use the corrected values.
  function updateItem(idx: number, patch: Partial<ParsedItem>) {
    setParsed(prev => {
      if (!prev) return prev
      const items = prev.items.map((it, i) => {
        if (i !== idx) return it
        const next = { ...it, ...patch }
        if ('quantity' in patch || 'unit_price' in patch) {
          next.total = Math.round((next.quantity || 0) * (next.unit_price || 0) * 100) / 100
        } else if ('total' in patch) {
          const q = next.quantity || 0
          if (q > 0) next.unit_price = Math.round(((next.total || 0) / q) * 10000) / 10000
        }
        return next
      })
      return { ...prev, items }
    })
  }

  function removeItem(idx: number) {
    setParsed(prev => (prev ? { ...prev, items: prev.items.filter((_, i) => i !== idx) } : prev))
  }

  function addItem() {
    setParsed(prev =>
      prev
        ? {
            ...prev,
            items: [
              ...prev.items,
              { item_name: '', display_name: '', category: 'Other', quantity: 1, purchase_unit: 'each', unit_price: 0, total: 0 },
            ],
          }
        : prev
    )
  }

  // Apply the per-supplier category memory to a fresh parse: any item
  // this supplier has sold this restaurant before inherits the
  // category it was saved with last time.
  function applyCategoryMemory(p: ParsedInvoice, mem: Map<string, string>): ParsedInvoice {
    if (mem.size === 0) return p
    const vKey = normKey(p.vendor || '')
    if (!vKey || vKey === 'unknown') return p
    let changed = false
    const items = p.items.map((it) => {
      const remembered =
        mem.get(`${vKey}|${normKey(it.item_name || '')}`) ||
        mem.get(`${vKey}|${normKey(it.display_name || '')}`)
      if (remembered && remembered !== 'Other' && remembered !== it.category) {
        changed = true
        return { ...it, category: remembered }
      }
      return it
    })
    return changed ? { ...p, items } : p
  }

  // Once per adopted parse, when the memory is available (it usually
  // loads at page open; if it lands after the parse, this still runs).
  useEffect(() => {
    if (categoryMemory.size === 0) return
    if (!parsed || status !== 'done') return
    const id = adoptedRef.current
    if (!id || memoryAppliedRef.current === id) return
    memoryAppliedRef.current = id
    setParsed((prev) => (prev ? applyCategoryMemory(prev, categoryMemory) : prev))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryMemory, parsed, status])

  const netTotal = parsed ? parsed.items.reduce((s, i) => s + (i.total || 0), 0) : 0
  const credits = parsed ? parsed.items.filter(i => (i.total || 0) < 0) : []
  const regular = parsed ? parsed.items.filter(i => (i.total || 0) >= 0) : []

  return (
    <div className="p-4 sm:p-8">
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
      ) : status === 'idle' || (!fileName && status !== 'error') ? (
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
          <button
            onClick={e => { e.stopPropagation(); setScannerOpen(true) }}
            className="mt-5 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 transition"
          >
            Scan with camera — it finds the perfect shot, you tap to snap
          </button>
        </div>
      ) : null}

      {scannerOpen && (
        <ReceiptScanner
          onClose={() => setScannerOpen(false)}
          onCapture={f => { setScannerOpen(false); parseFile(f) }}
        />
      )}

      {status === 'parsing' && (
        <div className="border rounded-xl p-12 text-center">
          <div className="flex items-center justify-center gap-3 text-gray-500">
            <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
            <span>Parsing <span className="font-medium text-gray-700">{fileName}</span> with AI...</span>
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
                  <FileText size={16} className="text-amber-500 shrink-0" />
                  <input
                    value={vendorEdit}
                    onChange={e => setVendorEdit(e.target.value)}
                    placeholder={parsed.vendor && !/^unknown/i.test(parsed.vendor.trim()) ? parsed.vendor : 'Type the supplier name…'}
                    className="font-semibold text-gray-800 border border-gray-200 rounded-md px-2 py-1 hover:border-gray-300 focus:border-amber-400 focus:outline-none bg-white min-w-[240px]"
                  />
                </div>
                <div className="text-sm text-gray-500 flex items-center gap-1.5 flex-wrap">
                  <input type="date" value={parsed.invoice_date || ''}
                    onChange={e => setParsed(prev => prev ? { ...prev, invoice_date: e.target.value || null } : prev)}
                    className="border border-gray-200 rounded-md px-1.5 py-0.5 text-sm text-gray-600 focus:border-amber-400 focus:outline-none bg-white" />
                  <span>· Invoice #</span>
                  <input value={parsed.invoice_number || ''}
                    onChange={e => setParsed(prev => prev ? { ...prev, invoice_number: e.target.value || null } : prev)}
                    placeholder="—"
                    className="border border-gray-200 rounded-md px-1.5 py-0.5 text-sm text-gray-600 focus:border-amber-400 focus:outline-none bg-white w-24" />
                  <span>· {regular.length} items{credits.length > 0 && `, ${credits.length} credit${credits.length > 1 ? 's' : ''}`}</span>
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
            const raw = (vendorEdit.trim() || parsed.vendor || '').trim().replace(/\s+/g, ' ')
            if (!raw || /^unknown/i.test(raw)) return null
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
            const flags = reviewFlagsFor({ ...parsed, vendor: vendorEdit.trim() || parsed.vendor })
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
            <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
            <table className="w-full min-w-[680px] text-sm">
              <thead className="bg-gray-50 border-b">
                <tr className="text-gray-400 text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-3">Item</th>
                  <th className="text-left px-4 py-3">Category</th>
                  <th className="text-right px-4 py-3">Qty</th>
                  <th className="text-right px-4 py-3">Unit</th>
                  <th className="text-right px-4 py-3">Unit Price</th>
                  <th className="text-right px-4 py-3">Total</th>
                  <th className="px-2 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {parsed.items.map((item, i) => {
                  const neg = (item.total || 0) < 0
                  const inputCls = `w-full bg-transparent border border-transparent rounded px-1.5 py-1 hover:border-gray-300 focus:border-amber-400 focus:outline-none ${neg ? 'text-red-700' : ''}`
                  return (
                    <tr key={i} className={`border-b last:border-0 ${neg ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                      <td className="px-3 py-2">
                        <input value={item.display_name}
                          onChange={e => {
                            const v = e.target.value
                            updateItem(i, item.item_name === '' || item.item_name === item.display_name
                              ? { display_name: v, item_name: v }
                              : { display_name: v })
                          }}
                          className={`${inputCls} font-medium text-gray-900 min-w-[180px]`} />
                        {neg && <span className="block text-xs text-red-500">(credit/return)</span>}
                      </td>
                      <td className="px-3 py-2">
                        <select value={item.category}
                          onChange={e => updateItem(i, { category: e.target.value })}
                          className="text-xs border border-transparent rounded px-1.5 py-1 bg-transparent hover:border-gray-300 focus:border-amber-400 focus:outline-none">
                          {Array.from(new Set([...CATEGORIES, item.category])).map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" step="any" value={item.quantity}
                          onChange={e => updateItem(i, { quantity: parseFloat(e.target.value) || 0 })}
                          className={`${inputCls} text-right text-gray-600 w-20`} />
                      </td>
                      <td className="px-3 py-2">
                        <select value={item.purchase_unit}
                          onChange={e => updateItem(i, { purchase_unit: e.target.value })}
                          className="text-xs border border-transparent rounded px-1.5 py-1 bg-transparent hover:border-gray-300 focus:border-amber-400 focus:outline-none">
                          {['lb', 'each', 'case'].map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" step="any" value={item.unit_price}
                          onChange={e => updateItem(i, { unit_price: parseFloat(e.target.value) || 0 })}
                          className={`${inputCls} text-right text-gray-600 w-24`} />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" step="any" value={item.total}
                          onChange={e => updateItem(i, { total: parseFloat(e.target.value) || 0 })}
                          className={`${inputCls} text-right font-semibold text-gray-900 w-24`} />
                      </td>
                      <td className="px-2 py-2 text-right">
                        <button onClick={() => removeItem(i)} title="Remove this line"
                          className="text-gray-300 hover:text-red-500 transition"><X size={15} /></button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </div>
            <button onClick={addItem}
              className="w-full px-4 py-2.5 text-sm text-amber-600 font-medium hover:bg-amber-50 transition border-t">
              + Add a line item
            </button>
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
