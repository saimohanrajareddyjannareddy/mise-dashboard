'use client'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useRestaurant } from '@/lib/restaurant'

/*
 * Activity store — the dashboard's memory for long-running work.
 *
 * Parsing an invoice (or scanning a mailbox, or syncing Clover) can
 * take tens of seconds. Before this store existed, the work lived in
 * whichever page started it: navigate away and you lost sight of it.
 * The provider sits in the dashboard layout, which never unmounts
 * during in-app navigation, so fetches it starts keep running and
 * their results land here — and the ActivityPanel (right side, every
 * page) shows what is running, what finished, and what failed.
 *
 * Finished entries persist per restaurant in localStorage (including
 * a parse's extracted JSON), so even a full reload keeps recent
 * history — and the Upload page can still adopt a finished parse.
 * Entries left "running" at reload are marked interrupted: the work
 * itself did not survive the reload, and the panel says so honestly.
 */

export type ActivityKind = 'parse' | 'email-scan' | 'clover-sync'
export type ActivityStatus = 'running' | 'done' | 'error'

export type ActivityEntry = {
  id: string
  kind: ActivityKind
  title: string
  status: ActivityStatus
  detail?: string
  href?: string
  startedAt: number
  finishedAt?: number
  /** Parse results only: the extracted invoice, for later adoption. */
  parsed?: unknown
  fileName?: string
  consumed?: boolean
}

type ScanResult = { imported: number; flagged: number; errors: string[] }

type ActivityContextValue = {
  entries: ActivityEntry[]
  runningCount: number
  /** Latest finished parse nobody has picked up yet (this restaurant). */
  pendingParse: ActivityEntry | null
  startParse: (file: File) => string
  consumeParse: (id: string) => void
  startEmailScan: () => Promise<ScanResult>
  startCloverSync: () => Promise<{ count: number; expand_used?: string; fields_missing?: string[]; auth_source?: string }>
  dismiss: (id: string) => void
  clearFinished: () => void
}

const ActivityContext = createContext<ActivityContextValue | null>(null)

const MAX_ENTRIES = 25
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export function ActivityProvider({ children }: { children: React.ReactNode }) {
  const { current } = useRestaurant()
  const restaurantId = current?.id ?? null
  const [entries, setEntries] = useState<ActivityEntry[]>([])
  const loadedFor = useRef<string | null>(null)

  // Load this restaurant's persisted history when it becomes current.
  useEffect(() => {
    if (!restaurantId || loadedFor.current === restaurantId) return
    loadedFor.current = restaurantId
    let restored: ActivityEntry[] = []
    try {
      const raw = localStorage.getItem(`mise.activity.${restaurantId}`)
      if (raw) {
        const now = Date.now()
        restored = (JSON.parse(raw) as ActivityEntry[])
          .filter((e) => now - e.startedAt < MAX_AGE_MS)
          .map((e) =>
            e.status === 'running'
              ? {
                  ...e,
                  status: 'error' as const,
                  finishedAt: now,
                  detail: 'Interrupted — the page closed before it finished. Run it again.',
                }
              : e
          )
      }
    } catch {
      restored = []
    }
    setEntries(restored)
  }, [restaurantId])

  // Persist on every change (after the initial load for this restaurant).
  useEffect(() => {
    if (!restaurantId || loadedFor.current !== restaurantId) return
    try {
      localStorage.setItem(
        `mise.activity.${restaurantId}`,
        JSON.stringify(entries.slice(0, MAX_ENTRIES))
      )
    } catch {
      // Storage full/blocked — the live panel still works.
    }
  }, [entries, restaurantId])

  const update = useCallback((id: string, patch: Partial<ActivityEntry>) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)))
  }, [])

  const add = useCallback((entry: ActivityEntry) => {
    setEntries((prev) => [entry, ...prev].slice(0, MAX_ENTRIES))
    return entry.id
  }, [])

  const startParse = useCallback(
    (file: File) => {
      const id = add({
        id: crypto.randomUUID(),
        kind: 'parse',
        title: file.name,
        status: 'running',
        href: '/dashboard/upload',
        startedAt: Date.now(),
        fileName: file.name,
      })
      ;(async () => {
        try {
          const form = new FormData()
          form.append('file', file)
          const resp = await fetch('/api/parse-invoice', { method: 'POST', body: form })
          const json = await resp.json()
          if (!resp.ok) throw new Error(json.error || 'Parse failed')
          const items = json.items?.length ?? 0
          const total =
            json.total ??
            (json.items || []).reduce((s: number, i: any) => s + (i.total || 0), 0)
          update(id, {
            status: 'done',
            finishedAt: Date.now(),
            parsed: json,
            detail: `${items} items · $${Number(total).toLocaleString('en-US', {
              minimumFractionDigits: 2,
            })} — ready to save`,
          })
        } catch (e: any) {
          update(id, {
            status: 'error',
            finishedAt: Date.now(),
            detail: e.message || 'Parse failed',
          })
        }
      })()
      return id
    },
    [add, update]
  )

  const startEmailScan = useCallback(async (): Promise<ScanResult> => {
    if (!restaurantId) throw new Error('No restaurant selected')
    const id = add({
      id: crypto.randomUUID(),
      kind: 'email-scan',
      title: 'Email scan',
      status: 'running',
      href: '/dashboard/review',
      startedAt: Date.now(),
    })
    try {
      const resp = await fetch('/api/email/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurant_id: restaurantId }),
      })
      const json = await resp.json()
      if (!resp.ok) throw new Error(json.error || 'Scan failed')
      update(id, {
        status: 'done',
        finishedAt: Date.now(),
        detail:
          `${json.imported} imported · ${json.flagged} waiting in Review` +
          (json.errors?.length ? ` · ${json.errors.length} couldn't be read` : ''),
      })
      return json as ScanResult
    } catch (e: any) {
      update(id, {
        status: 'error',
        finishedAt: Date.now(),
        detail: e.message || 'Scan failed',
      })
      throw e
    }
  }, [add, update, restaurantId])

  const startCloverSync = useCallback(async (): Promise<{ count: number; expand_used?: string; fields_missing?: string[]; auth_source?: string }> => {
    if (!restaurantId) throw new Error('No restaurant selected')
    const id = add({
      id: crypto.randomUUID(),
      kind: 'clover-sync',
      title: 'Clover sync',
      status: 'running',
      href: '/dashboard/food-cost',
      startedAt: Date.now(),
    })
    try {
      const resp = await fetch('/api/clover-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurant_id: restaurantId }),
      })
      const json = await resp.json()
      if (!resp.ok) throw new Error(json.error || 'Sync failed')
      update(id, {
        status: 'done',
        finishedAt: Date.now(),
        detail: `${json.count} sales records synced${json.auth_source ? ` via ${json.auth_source} token` : ''}${
          json.expand_used && json.expand_used !== 'lineItems,discounts,refunds,orderType,payments'
            ? ` · limited fields: ${json.expand_used}`
            : ''
        }${
          json.fields_missing && json.fields_missing.length > 0
            ? ` · Clover returned no ${json.fields_missing.join(' or ')} data`
            : ''
        }`,
      })
      return json as { count: number; expand_used?: string; fields_missing?: string[]; auth_source?: string }
    } catch (e: any) {
      update(id, {
        status: 'error',
        finishedAt: Date.now(),
        detail: e.message || 'Sync failed',
      })
      throw e
    }
  }, [add, update, restaurantId])

  const consumeParse = useCallback(
    (id: string) => update(id, { consumed: true }),
    [update ]
  )

  const dismiss = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id))
  }, [])

  const clearFinished = useCallback(() => {
    setEntries((prev) => prev.filter((e) => e.status === 'running'))
  }, [])

  const pendingParse = useMemo(
    () =>
      entries.find((e) => e.kind === 'parse' && e.status === 'done' && !e.consumed) ??
      null,
    [entries]
  )
  const runningCount = useMemo(
    () => entries.filter((e) => e.status === 'running').length,
    [entries]
  )

  const value: ActivityContextValue = {
    entries,
    runningCount,
    pendingParse,
    startParse,
    consumeParse,
    startEmailScan,
    startCloverSync,
    dismiss,
    clearFinished,
  }

  return <ActivityContext.Provider value={value}>{children}</ActivityContext.Provider>
}

export function useActivity(): ActivityContextValue {
  const ctx = useContext(ActivityContext)
  if (!ctx) throw new Error('useActivity must be used inside ActivityProvider')
  return ctx
}
