'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRestaurant } from '@/lib/restaurant'
import { CheckCircle, AlertCircle, Link2, Key, AlertTriangle, Trash2, Store, CreditCard, X, Mail } from 'lucide-react'
import { useActivity } from '@/lib/activity'

type DeletionCounts = {
  invoice_files: number
  invoice_headers: number
  invoice_lines: number
  pos_sales: number
  members: number
}

export default function SettingsPage() {
  const { current, deleteRestaurant } = useRestaurant()
  const activity = useActivity()
  const restaurantId = current?.id ?? null
  const restaurantName = current?.name ?? ''
  const [merchantId, setMerchantId] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [connected, setConnected] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  // Clover OAuth state
  const [oauthConfigured, setOauthConfigured] = useState(false)
  const [oauthEnv, setOauthEnv] = useState('')
  const [oauthConnected, setOauthConnected] = useState(false)
  const [cloverBanner, setCloverBanner] = useState<string | null>(null)

  // Billing state
  const [billingConfigured, setBillingConfigured] = useState(false)
  const [hasSubscription, setHasSubscription] = useState(false)
  const [billingBusy, setBillingBusy] = useState(false)
  const [billingMsg, setBillingMsg] = useState<string | null>(null)

  // Email scan state
  const [mailConfigured, setMailConfigured] = useState(false)
  const [mailConnected, setMailConnected] = useState(false)
  const [mailEmail, setMailEmail] = useState('')
  const [mailLastScan, setMailLastScan] = useState<string | null>(null)
  const [mailBanner, setMailBanner] = useState<string | null>(null)
  const [mailScanning, setMailScanning] = useState(false)
  const [mailMsg, setMailMsg] = useState<string | null>(null)

  // Business cards state
  const [cards, setCards] = useState<string[]>([])
  const [newCard, setNewCard] = useState('')
  const [cardStatus, setCardStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [cardErr, setCardErr] = useState<string | null>(null)

  // Danger Zone state
  const [counts, setCounts] = useState<DeletionCounts | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteErr, setDeleteErr] = useState<string | null>(null)

  useEffect(() => {
    if (!restaurantId) return
    ;(async () => {
      const full = await supabase
        .from('restaurant_settings')
        .select('clover_merchant_id, clover_api_key, clover_auth_method')
        .eq('restaurant_id', restaurantId)
        .single()
      let settings: {
        clover_merchant_id: string | null
        clover_api_key: string | null
        clover_auth_method?: string | null
      } | null = full.data
      if (full.error) {
        // Pre-012 database: the OAuth columns don't exist yet.
        const legacy = await supabase
          .from('restaurant_settings')
          .select('clover_merchant_id, clover_api_key')
          .eq('restaurant_id', restaurantId)
          .single()
        settings = legacy.data
      }
      if (settings) {
        setMerchantId(settings.clover_merchant_id || '')
        setApiKey(settings.clover_api_key ? '••••••••' : '')
        const isOauth = settings.clover_auth_method === 'oauth'
        setOauthConnected(isOauth)
        setConnected(!!(settings.clover_merchant_id && settings.clover_api_key) || isOauth)
      } else {
        setMerchantId('')
        setApiKey('')
        setConnected(false)
        setOauthConnected(false)
      }
    })()
  }, [restaurantId])

  // OAuth availability on the server + the result banner after the
  // callback redirects back here with ?clover=<result>.
  useEffect(() => {
    fetch('/api/clover/status')
      .then((r) => r.json())
      .then((j) => {
        setOauthConfigured(!!j.oauth_configured)
        setOauthEnv(j.env || '')
      })
      .catch(() => {})
    const result = new URLSearchParams(window.location.search).get('clover')
    if (result) {
      const messages: Record<string, string> = {
        connected: 'Clover connected. Sales will sync with your OAuth token, stored encrypted.',
        not_configured: "Clover OAuth isn't configured on the server yet — the app credentials are missing.",
        migration_needed: 'Almost there: run sql/012_clover_oauth.sql in the Supabase SQL editor, then connect again.',
        no_encryption_key: 'The server is missing its token encryption key (TOKEN_ENCRYPTION_KEY). Set it, then connect again.',
        failed: "The Clover connection didn't complete. Try again.",
        missing_restaurant: "The Clover connection didn't complete. Try again.",
      }
      setCloverBanner(messages[result] ?? null)
    }
  }, [])

  async function saveClover() {
    if (!restaurantId) return
    setStatus('saving')
    const payload = {
      restaurant_id: restaurantId,
      clover_merchant_id: merchantId.trim() || null,
      clover_api_key: apiKey.startsWith('••') ? undefined : (apiKey.trim() || null),
    }
    const { error } = await supabase
      .from('restaurant_settings')
      .upsert(payload, { onConflict: 'restaurant_id' })
    if (error) { setStatus('error'); return }
    setConnected(!!(merchantId.trim() && apiKey.trim()))
    setStatus('saved')
    setTimeout(() => setStatus('idle'), 3000)
  }

  // Billing: server configuration + whether this restaurant already
  // has a subscription, plus the banner after a checkout round-trip.
  useEffect(() => {
    if (!restaurantId) return
    fetch(`/api/billing/status?restaurant_id=${restaurantId}`)
      .then((r) => r.json())
      .then((j) => {
        setBillingConfigured(!!j.configured)
        setHasSubscription(!!j.has_subscription)
      })
      .catch(() => {})
    const b = new URLSearchParams(window.location.search).get('billing')
    if (b === 'success') setBillingMsg('Subscription started — welcome aboard.')
    if (b === 'cancelled') setBillingMsg('Checkout was cancelled. Nothing was charged.')
  }, [restaurantId])

  async function startCheckout() {
    if (!restaurantId) return
    setBillingBusy(true)
    setBillingMsg(null)
    try {
      const resp = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurant_id: restaurantId }),
      })
      const json = await resp.json()
      if (!resp.ok || !json.url) throw new Error(json.error || 'Checkout failed')
      window.location.href = json.url
    } catch (e: any) {
      setBillingMsg(e.message || 'Checkout failed')
      setBillingBusy(false)
    }
  }

  async function openPortal() {
    if (!restaurantId) return
    setBillingBusy(true)
    setBillingMsg(null)
    try {
      const resp = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurant_id: restaurantId }),
      })
      const json = await resp.json()
      if (!resp.ok || !json.url) throw new Error(json.error || 'Portal failed')
      window.location.href = json.url
    } catch (e: any) {
      setBillingMsg(e.message || 'Portal failed')
      setBillingBusy(false)
    }
  }

  // Email scan: server configuration + this restaurant's connection.
  useEffect(() => {
    if (!restaurantId) return
    fetch(`/api/email/status?restaurant_id=${restaurantId}`)
      .then((r) => r.json())
      .then((j) => {
        setMailConfigured(!!j.configured)
        setMailConnected(!!j.connected)
        setMailEmail(j.email || '')
        setMailLastScan(j.last_scan_at ?? null)
      })
      .catch(() => {})
    const b = new URLSearchParams(window.location.search).get('email')
    const messages: Record<string, string> = {
      connected: 'Email connected. Hit "Scan now" to pull in supplier invoices right away.',
      migration_needed: 'Almost there — the email tables need a quick database update first (migration 013).',
      no_encryption_key: "Email connect needs the server's encryption key set up first.",
      not_configured: 'Email connect is not switched on yet.',
      failed: "The email connection didn't complete. Try again.",
    }
    if (b && messages[b]) setMailBanner(messages[b])
  }, [restaurantId])

  async function scanNow() {
    if (!restaurantId) return
    setMailScanning(true)
    setMailMsg(null)
    try {
      // Runs through the activity store so the scan shows in the
      // right-side Activity panel and survives navigation.
      const json = await activity.startEmailScan()
      setMailLastScan(new Date().toISOString())
      setMailMsg(
        `Scan complete: ${json.imported} invoice${json.imported === 1 ? '' : 's'} imported` +
          (json.flagged ? `, ${json.flagged} sent to review` : '') +
          (json.errors?.length ? ` (${json.errors.length} couldn't be read)` : '') +
          '.'
      )
    } catch (e: any) {
      setMailMsg(e.message || 'Scan failed')
    }
    setMailScanning(false)
  }

  async function disconnectMail() {
    if (!restaurantId) return
    await fetch('/api/email/disconnect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurant_id: restaurantId }),
    }).catch(() => {})
    setMailConnected(false)
    setMailEmail('')
    setMailLastScan(null)
    setMailMsg('Email disconnected.')
  }

  async function triggerSync() {
    setSyncing(true); setSyncMsg('')
    try {
      // Via the activity store: visible in the Activity panel too.
      const json = await activity.startCloverSync()
      setSyncMsg(`Synced ${json.count} sales records.`)
    } catch (e: any) {
      setSyncMsg(e.message || 'Sync failed')
    }
    setSyncing(false)
  }

  // Business cards — load on restaurant switch
  useEffect(() => {
    if (!restaurantId) { setCards([]); return }
    setCardErr(null)
    supabase
      .from('restaurants')
      .select('known_owner_cards')
      .eq('id', restaurantId)
      .single()
      .then(({ data }) => {
        setCards((data?.known_owner_cards as string[]) ?? [])
      })
  }, [restaurantId])

  function addCard() {
    const c = newCard.trim()
    if (!/^\d{4}$/.test(c)) { setCardErr('Enter exactly 4 digits.'); return }
    if (cards.includes(c)) { setCardErr('That card is already listed.'); setNewCard(''); return }
    setCards([...cards, c])
    setNewCard('')
    setCardErr(null)
  }

  function removeCard(c: string) {
    setCards(cards.filter(x => x !== c))
  }

  async function saveCards() {
    if (!restaurantId) return
    setCardStatus('saving'); setCardErr(null)
    const { error } = await supabase.rpc('update_my_restaurant_cards', {
      p_restaurant_id: restaurantId,
      p_cards: cards,
    })
    if (error) {
      setCardStatus('error')
      setCardErr(error.message || 'Save failed')
      return
    }
    setCardStatus('saved')
    setTimeout(() => setCardStatus('idle'), 3000)
  }

  // Pre-flight counts for the Danger Zone — refreshes on restaurant switch.
  useEffect(() => {
    if (!restaurantId) { setCounts(null); return }
    setConfirmText(''); setDeleteErr(null)
    let cancelled = false
    ;(async () => {
      const [files, headers, lines, sales, members] = await Promise.all([
        supabase.from('invoice_files').select('id', { count: 'exact', head: true }).eq('restaurant_id', restaurantId),
        supabase.from('invoice_headers').select('id', { count: 'exact', head: true }).eq('restaurant_id', restaurantId),
        supabase.from('invoice_lines').select('id', { count: 'exact', head: true }).eq('restaurant_id', restaurantId),
        supabase.from('pos_sales').select('id', { count: 'exact', head: true }).eq('restaurant_id', restaurantId),
        supabase.from('user_restaurants').select('user_id', { count: 'exact', head: true }).eq('restaurant_id', restaurantId),
      ])
      if (cancelled) return
      setCounts({
        invoice_files: files.count ?? 0,
        invoice_headers: headers.count ?? 0,
        invoice_lines: lines.count ?? 0,
        pos_sales: sales.count ?? 0,
        members: members.count ?? 0,
      })
    })()
    return () => { cancelled = true }
  }, [restaurantId])

  async function handleDelete() {
    if (!restaurantId) return
    if (confirmText !== restaurantName) {
      setDeleteErr('Type the restaurant name exactly to confirm.')
      return
    }
    setDeleting(true); setDeleteErr(null)
    try {
      await deleteRestaurant(restaurantId)
    } catch (e) {
      setDeleteErr(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Settings</h1>
      <p className="text-gray-500 text-sm mb-8">Manage integrations and connections.</p>

      <div className="bg-white rounded-xl border p-6 mb-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
            <Link2 size={18} className="text-green-600" />
          </div>
          <div>
            <div className="font-semibold text-gray-900 flex items-center gap-2">
              Clover POS
              {connected && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full flex items-center gap-1"><CheckCircle size={10} /> Connected</span>}
            </div>
            <div className="text-sm text-gray-500">Pull sales data to enable wastage tracking</div>
          </div>
        </div>

        {cloverBanner && (
          <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {cloverBanner}
          </div>
        )}

        {oauthConnected ? (
          <div className="mb-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            Connected with Clover — nothing to copy or manage. Your access token is stored
            encrypted, and sales sync uses it automatically.
          </div>
        ) : oauthConfigured ? (
          <div className="mb-5">
            <a
              href={`/api/clover/connect?restaurant_id=${restaurantId}`}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition"
            >
              <Link2 size={15} /> Connect with Clover{oauthEnv === 'sandbox' ? ' (sandbox)' : ''}
            </a>
            <p className="text-xs text-gray-400 mt-2">
              Recommended — you approve access on Clover&apos;s own site, no token copying.
              Or paste a token manually below.
            </p>
          </div>
        ) : null}

        <div className="space-y-4 mb-5">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5 uppercase tracking-wide">Merchant ID</label>
            <input
              value={merchantId}
              onChange={e => setMerchantId(e.target.value)}
              placeholder="e.g. ABC12DEFGHIJK"
              className="w-full border rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-amber-500"
            />
            <p className="text-xs text-gray-400 mt-1">Found in Clover Dashboard → Account → About</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5 uppercase tracking-wide flex items-center gap-1"><Key size={11} /> API Key</label>
            <input
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              type="password"
              placeholder="Clover API token"
              className="w-full border rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-amber-500"
            />
            <p className="text-xs text-gray-400 mt-1">Clover Dashboard → Setup → API Tokens → Create Token</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={saveClover} disabled={status === 'saving'}
            className="px-5 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50 transition">
            {status === 'saving' ? 'Saving...' : 'Save'}
          </button>
          {status === 'saved' && <span className="text-sm text-green-600 flex items-center gap-1"><CheckCircle size={14} /> Saved</span>}
          {status === 'error' && <span className="text-sm text-red-500 flex items-center gap-1"><AlertCircle size={14} /> Error saving</span>}
        </div>

        {connected && (
          <div className="mt-5 pt-5 border-t">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-gray-800">Sync Sales Data</div>
                <div className="text-xs text-gray-400 mt-0.5">Pull last 30 days of sales from Clover</div>
              </div>
              <button onClick={triggerSync} disabled={syncing}
                className="px-4 py-2 bg-white border rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition">
                {syncing ? 'Syncing...' : 'Sync Now'}
              </button>
            </div>
            {syncMsg && <p className="text-sm text-gray-600 mt-2">{syncMsg}</p>}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border p-6 mb-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
            <CreditCard size={18} className="text-purple-600" />
          </div>
          <div>
            <div className="font-semibold text-gray-900 flex items-center gap-2">
              Billing
              {(() => {
                const s = current?.subscription_status ?? 'trialing'
                const label = s.replace('_', ' ')
                const cls =
                  s === 'active'
                    ? 'bg-green-100 text-green-700'
                    : s === 'past_due'
                      ? 'bg-red-100 text-red-700'
                      : s === 'canceled'
                        ? 'bg-gray-100 text-gray-600'
                        : 'bg-amber-100 text-amber-700'
                return (
                  <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${cls}`}>
                    {label}
                  </span>
                )
              })()}
            </div>
            <div className="text-sm text-gray-500">
              {current?.trial_ends_at
                ? `Free trial ${new Date(current.trial_ends_at) > new Date() ? 'ends' : 'ended'} ${new Date(current.trial_ends_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · per-location monthly plan`
                : 'Per-location monthly plan'}
            </div>
          </div>
        </div>

        {billingMsg && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {billingMsg}
          </div>
        )}

        {!billingConfigured ? (
          <p className="text-sm text-gray-400">Payments aren&apos;t switched on yet.</p>
        ) : hasSubscription ? (
          <button
            onClick={openPortal}
            disabled={billingBusy}
            className="px-5 py-2 bg-white border rounded-lg text-sm text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-50 transition"
          >
            {billingBusy ? 'Opening…' : 'Manage billing'}
          </button>
        ) : (
          <button
            onClick={startCheckout}
            disabled={billingBusy}
            className="px-5 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50 transition"
          >
            {billingBusy ? 'Opening checkout…' : 'Subscribe'}
          </button>
        )}
        {billingConfigured && (
          <p className="text-xs text-gray-400 mt-3">
            Secure checkout and card management run on Stripe. Cancel anytime from the billing portal.
          </p>
        )}
      </div>

      <div className="bg-white rounded-xl border p-6 mb-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-rose-100 rounded-xl flex items-center justify-center">
            <Mail size={18} className="text-rose-600" />
          </div>
          <div>
            <div className="font-semibold text-gray-900 flex items-center gap-2">
              Email invoices
              {mailConnected && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full flex items-center gap-1"><CheckCircle size={10} /> Connected</span>}
            </div>
            <div className="text-sm text-gray-500">We scan your inbox for supplier invoices and import them for you</div>
          </div>
        </div>

        {mailBanner && (
          <div className="flex items-start gap-2 bg-blue-50 text-blue-800 text-sm rounded-lg px-3 py-2 mb-4">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>{mailBanner}</span>
          </div>
        )}

        <p className="text-sm text-gray-600 mb-4">
          Lost a paper receipt? If your supplier emailed a copy — or sends invoices by
          email from their app — connecting your inbox lets InvoiceIQ find and import them
          automatically. We only import emails that look like supplier invoices
          (known supplier senders, or attachments named like an invoice). Access is
          read-only: we never send, move, or delete your mail.
        </p>

        {mailConnected ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-700">
              Scanning <span className="font-medium">{mailEmail}</span>
              {mailLastScan
                ? ` · last scan ${new Date(mailLastScan).toLocaleString()}`
                : ' · not scanned yet'}
              . New invoices are also picked up automatically once a day.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={scanNow}
                disabled={mailScanning}
                className="bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-800 disabled:opacity-50"
              >
                {mailScanning ? 'Scanning…' : 'Scan now'}
              </button>
              <button
                onClick={disconnectMail}
                className="text-sm font-medium px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                Disconnect
              </button>
            </div>
          </div>
        ) : mailConfigured ? (
          <a
            href={`/api/email/connect?restaurant_id=${restaurantId ?? ''}`}
            className="inline-block bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-800"
          >
            Connect Gmail
          </a>
        ) : (
          <p className="text-sm text-gray-400">
            Email scanning isn't switched on yet — it will appear here once it's ready.
          </p>
        )}
        {mailMsg && <p className="text-sm text-gray-600 mt-3">{mailMsg}</p>}
      </div>

      <div className="bg-white rounded-xl border p-6 mb-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
            <CreditCard size={18} className="text-purple-600" />
          </div>
          <div>
            <div className="font-semibold text-gray-900">Business Cards</div>
            <div className="text-sm text-gray-500">Last 4 digits of the cards this restaurant pays with. Invoices paid on other cards are skipped as personal.</div>
          </div>
        </div>

        {cards.length > 0 ? (
          <div className="flex flex-wrap gap-2 mb-4">
            {cards.map(c => (
              <span key={c} className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-700 text-sm rounded-full pl-3 pr-1.5 py-1 font-medium">
                •••• {c}
                <button onClick={() => removeCard(c)} className="w-5 h-5 rounded-full hover:bg-gray-300 flex items-center justify-center text-gray-500 hover:text-gray-800 transition">
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-400 mb-4">No cards yet. Add the last 4 digits of each business card below.</div>
        )}

        <div className="flex items-center gap-2 mb-4">
          <input
            value={newCard}
            onChange={e => { setNewCard(e.target.value.replace(/\D/g, '').slice(0, 4)); setCardErr(null) }}
            onKeyDown={e => { if (e.key === 'Enter') addCard() }}
            placeholder="1234"
            inputMode="numeric"
            maxLength={4}
            className="w-24 border rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-amber-500 tracking-widest"
          />
          <button onClick={addCard}
            className="px-4 py-2 bg-white border rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition">
            Add card
          </button>
        </div>

        {cardErr && (
          <div className="bg-red-50 text-red-700 text-sm p-2.5 rounded mb-3 flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            {cardErr}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button onClick={saveCards} disabled={cardStatus === 'saving'}
            className="px-5 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50 transition">
            {cardStatus === 'saving' ? 'Saving...' : 'Save cards'}
          </button>
          {cardStatus === 'saved' && <span className="text-sm text-green-600 flex items-center gap-1"><CheckCircle size={14} /> Saved</span>}
          {cardStatus === 'error' && <span className="text-sm text-red-500 flex items-center gap-1"><AlertCircle size={14} /> Error saving</span>}
        </div>
      </div>

      <div className="bg-gray-50 rounded-xl border border-dashed p-6 text-center text-gray-400 mb-6">
        <div className="text-sm font-medium mb-1">More integrations coming soon</div>
        <div className="text-xs">Gordon Food Service · Costco · Sysco</div>
      </div>

      <div className="bg-white rounded-xl border border-red-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
            <AlertTriangle size={18} className="text-red-600" />
          </div>
          <div>
            <div className="font-semibold text-red-700">Danger Zone</div>
            <div className="text-sm text-gray-500">Permanent actions. Read carefully.</div>
          </div>
        </div>

        <div className="border border-red-100 rounded-lg p-4 bg-red-50/50">
          <div className="font-medium text-gray-900 mb-1">Delete this restaurant</div>
          <div className="text-sm text-gray-600 mb-3">
            Permanently delete <span className="font-semibold text-gray-900">{restaurantName || '—'}</span> and everything attached to it. This cannot be undone.
          </div>

          {counts && (
            <div className="text-xs text-gray-600 bg-white border border-red-100 rounded p-3 mb-3 space-y-0.5">
              <div className="font-medium text-gray-800 mb-1">Will permanently delete:</div>
              <div>· {counts.invoice_files.toLocaleString()} invoice file(s)</div>
              <div>· {counts.invoice_headers.toLocaleString()} invoice(s)</div>
              <div>· {counts.invoice_lines.toLocaleString()} line item(s)</div>
              <div>· {counts.pos_sales.toLocaleString()} POS sales record(s)</div>
              <div>· {counts.members.toLocaleString()} team member link(s)</div>
              <div className="text-gray-500 mt-1">Plus: vendors config, invites, recipes, calibrations, Clover settings.</div>
            </div>
          )}

          <label className="block text-xs font-medium text-gray-600 mb-1.5 uppercase tracking-wide">
            Type <span className="font-semibold text-gray-900">{restaurantName}</span> to confirm
          </label>
          <input
            value={confirmText}
            onChange={(e) => { setConfirmText(e.target.value); setDeleteErr(null) }}
            placeholder={restaurantName}
            className="w-full border border-red-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-red-400 mb-3"
          />

          {deleteErr && (
            <div className="bg-red-100 text-red-700 text-sm p-2.5 rounded mb-3 flex items-start gap-2">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              {deleteErr}
            </div>
          )}

          <button
            onClick={handleDelete}
            disabled={deleting || confirmText !== restaurantName}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            <Trash2 size={14} />
            {deleting ? 'Deleting…' : 'Delete restaurant permanently'}
          </button>
          <p className="text-xs text-gray-400 mt-2">
            Owner role required. Soft alternative: ask Supabase admin to set <code className="font-mono">is_active=false</code>.
          </p>
        </div>
      </div>
    </div>
  )
}