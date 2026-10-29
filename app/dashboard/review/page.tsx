'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useRestaurant } from '@/lib/restaurant'
import { ClipboardCheck, CheckCircle, AlertTriangle, ArrowRight } from 'lucide-react'

type ReviewInvoice = {
  id: string
  vendor: string
  invoice_number: string | null
  invoice_date: string | null
  total: number | null
  review_reason: string | null
}

/*
 * Review queue — invoices whose AI extraction failed a reconciliation
 * check at save time (line items don't add up to the stated total,
 * qty x price != line total, missing vendor/date). A human checks the
 * invoice against the original and approves it, so extraction errors
 * get caught here instead of silently landing in the books.
 *
 * Requires sql/010_review_queue.sql. Until that runs, this page shows
 * a setup notice instead of erroring.
 */
export default function ReviewPage() {
  const { current } = useRestaurant()
  const restaurantId = current?.id ?? null
  const [rows, setRows] = useState<ReviewInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [setupPending, setSetupPending] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [approvingId, setApprovingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!restaurantId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('invoice_headers')
      .select('id, vendor, invoice_number, invoice_date, total, review_reason')
      .eq('restaurant_id', restaurantId)
      .eq('review_status', 'needs_review')
      .order('invoice_date', { ascending: false })
    if (error) {
      if (error.message.includes('review_status')) setSetupPending(true)
      else setErrorMsg(error.message)
    } else {
      setRows((data as ReviewInvoice[]) || [])
    }
    setLoading(false)
  }, [restaurantId])

  useEffect(() => {
    load()
  }, [load])

  async function approve(id: string) {
    setApprovingId(id)
    setErrorMsg('')
    const { data: userData } = await supabase.auth.getUser()
    const { error } = await supabase
      .from('invoice_headers')
      .update({
        review_status: 'approved',
        reviewed_at: new Date().toISOString(),
        reviewed_by: userData.user?.id ?? null,
      })
      .eq('id', id)
    if (error) {
      setErrorMsg(error.message)
    } else {
      setRows((prev) => prev.filter((r) => r.id !== id))
    }
    setApprovingId(null)
  }

  return (
    <div className="p-4 sm:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1 flex items-center gap-2">
          <ClipboardCheck className="text-amber-500" /> Review Queue
        </h1>
        <p className="text-gray-500 text-sm">
          Invoices the AI wasn&apos;t sure about. Check them against the original, then approve.
        </p>
      </div>

      {setupPending ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 flex items-start gap-4">
          <AlertTriangle size={22} className="text-amber-500 mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold text-amber-800 mb-1">One database step left</div>
            <p className="text-sm text-amber-700">
              The review queue needs <span className="font-mono">sql/010_review_queue.sql</span> run once in the
              Supabase SQL editor. Until then, uploads keep working exactly as before — nothing is blocked.
            </p>
          </div>
        </div>
      ) : loading ? (
        <div className="border rounded-xl p-12 text-center text-gray-400 text-sm">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-8 flex items-start gap-4">
          <CheckCircle size={24} className="text-green-500 mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold text-green-800 mb-1">All caught up</div>
            <p className="text-sm text-green-600">
              No invoices are waiting for review. New uploads that don&apos;t reconcile will appear here automatically.
            </p>
          </div>
        </div>
      ) : (
        <>
          {errorMsg && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 text-sm text-red-700">{errorMsg}</div>
          )}
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-gray-50 border-b">
                <tr className="text-gray-400 text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-3">Vendor</th>
                  <th className="text-left px-4 py-3">Date</th>
                  <th className="text-right px-4 py-3">Total</th>
                  <th className="text-left px-4 py-3">Why it&apos;s here</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{r.vendor || 'Unknown vendor'}</div>
                      {r.invoice_number && <div className="text-xs text-gray-400">#{r.invoice_number}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{r.invoice_date || '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      {r.total != null ? `$${r.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-amber-700">{r.review_reason || 'Flagged for review'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/dashboard/invoices/${r.id}`}
                          className="flex items-center gap-1 px-3 py-1.5 bg-white border rounded-lg text-xs text-gray-600 hover:bg-gray-50 transition"
                        >
                          Inspect <ArrowRight size={12} />
                        </Link>
                        <button
                          onClick={() => approve(r.id)}
                          disabled={approvingId === r.id}
                          className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50 transition"
                        >
                          {approvingId === r.id ? 'Approving…' : 'Approve'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
