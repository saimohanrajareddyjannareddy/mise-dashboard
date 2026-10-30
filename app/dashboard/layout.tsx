'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  House,
  ChartLine,
  FileText,
  Building2,
  Bell,
  ChartColumn,
  Settings,
  LogOut,
  Search,
  Plus,
  ChevronsUpDown,
  Check,
  Menu,
  ClipboardCheck,
  Sparkles,
  ChefHat,
} from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useRestaurant } from '@/lib/restaurant'
import AddRestaurantButton from '@/components/AddRestaurantButton'
import ReviewBadge from '@/components/ReviewBadge'
import { ActivityProvider } from '@/lib/activity'
import ActivityPanel from '@/components/ActivityPanel'
import AssistantPanel from '@/components/AssistantPanel'
import GlobalSearch from '@/components/GlobalSearch'
import { supabase } from '@/lib/supabase'
import { fetchPriceAlerts } from '@/lib/alerts'

// Live nav items — real routes only.
const mainNav = [
  { href: '/dashboard', label: 'Home', icon: House, exact: true },
  { href: '/dashboard/price-tracker', label: 'Price Tracker', icon: ChartLine },
  { href: '/dashboard/invoices', label: 'Invoices', icon: FileText },
  { href: '/dashboard/review', label: 'Review', icon: ClipboardCheck, badge: 'review' },
  { href: '/dashboard/food-cost', label: 'Food cost %', icon: ChartColumn },
  { href: '/dashboard/recipes', label: 'Recipes', icon: ChefHat },
  { href: '/dashboard/vendors', label: 'Vendors', icon: Building2 },
  { href: '/dashboard/alerts', label: 'Alerts', icon: Bell },
]

const navBase =
  'flex items-center gap-3 rounded-[8px] border-l-[3px] px-3 py-2.5 transition'
const navActive = 'border-pop bg-pop/15 font-semibold text-white'
const navIdle = 'border-transparent text-[#C9C2B4] hover:bg-white/5 hover:text-cream'

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  const two = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')
  return (two || name.slice(0, 2)).toUpperCase()
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { session, loading: authLoading, signOut } = useAuth()
  const { current, list, setCurrent, loading: restLoading } = useRestaurant()

  // Time-of-day greeting is set after mount to avoid an SSR/client hydration
  // mismatch on the rendered hour.
  const [daypart, setDaypart] = useState('')
  useEffect(() => {
    const h = new Date().getHours()
    setDaypart(h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening')
  }, [])

  // Mobile-only slide-in drawer for the sidebar (below md). No effect at md+,
  // where the sidebar is permanently visible. Auto-closes on route change so a
  // nav tap doesn't leave the drawer covering the page.
  const [drawerOpen, setDrawerOpen] = useState(false)
  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  // Top-bar utilities: global search overlay + the Ask-the-agent panel.
  const [searchOpen, setSearchOpen] = useState(false)
  const [askOpen, setAskOpen] = useState(false)

  // Live price-alert count for the bell badge (moves ≥5%).
  const [alertCount, setAlertCount] = useState(0)
  useEffect(() => {
    if (!current?.id) return
    let cancelled = false
    fetchPriceAlerts(supabase, current.id, 5)
      .then((a) => {
        if (!cancelled) setAlertCount(a.length)
      })
      .catch(() => {
        if (!cancelled) setAlertCount(0)
      })
    return () => {
      cancelled = true
    }
  }, [current?.id, pathname])

  // Custom restaurant-switcher dropdown (replaces an unstyleable native <select>).
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const switcherRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!switcherOpen) return
    function onDocClick(e: MouseEvent) {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) setSwitcherOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSwitcherOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [switcherOpen])

  // Display name from the existing auth session, in priority order:
  //   1. user_metadata.full_name
  //   2. user_metadata.name
  //   3. prettified email local-part (split on non-letters, capitalize each word)
  //   4. "there"
  const displayName = useMemo(() => {
    const meta = (session?.user?.user_metadata ?? {}) as { full_name?: string; name?: string }
    if (meta.full_name?.trim()) return meta.full_name.trim()
    if (meta.name?.trim()) return meta.name.trim()
    const prefix = session?.user?.email?.split('@')[0] ?? ''
    const words = prefix.split(/[^a-zA-Z]+/).filter(Boolean)
    if (words.length) return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
    return 'there'
  }, [session])

  // Greeting uses just the first token of the display name.
  const firstName = displayName === 'there' ? 'there' : displayName.split(' ')[0]

  if (authLoading)
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream font-sans text-sm text-ink-muted">
        Loading…
      </div>
    )

  // AuthProvider redirects unauthenticated users to /login; render nothing while that happens.
  if (!session) return null

  const greeting = daypart ? `Good ${daypart}, ${firstName}` : `Welcome, ${firstName}`
  const settingsActive = pathname.startsWith('/dashboard/settings')

  return (
    <ActivityProvider>
    <div className="flex min-h-screen overflow-x-hidden bg-cream font-sans text-ink md:overflow-x-visible">
      {/* Mobile drawer overlay — only below md, only when the drawer is open.
          Tapping it closes the drawer. */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-30 bg-forest/50 md:hidden"
          aria-hidden="true"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* SIDEBAR — permanent at md+; below md it's an off-canvas drawer that
          slides in from the left when drawerOpen. */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col bg-coal px-4 py-6 text-[#E8E2D6] transition-transform md:z-10 md:translate-x-0 ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Link href="/dashboard" className="mb-5 px-2 font-display text-[26px] font-extrabold tracking-tight text-cream">
          InvoiceIQ<span className="text-pop">.</span>
        </Link>

        {/* Restaurant switcher — same useRestaurant() wiring, custom dropdown for readability. */}
        <div className="relative mb-6" ref={switcherRef}>
          <button
            type="button"
            onClick={() => list.length > 1 && setSwitcherOpen((o) => !o)}
            aria-haspopup="listbox"
            aria-expanded={switcherOpen}
            title={list.length > 1 ? 'Switch restaurant' : undefined}
            className="flex w-full items-center gap-2.5 rounded-[10px] bg-[#FFFDF9] px-2.5 py-2.5 text-left"
          >
            <div className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-full bg-pop font-display text-[14px] font-bold text-white">
              {current ? initials(current.name) : '—'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-semibold text-[#142821]">
                {current?.name ?? (restLoading ? 'Loading…' : 'Select restaurant')}
              </div>
            </div>
            {list.length > 1 && <ChevronsUpDown size={14} className="flex-shrink-0 text-[#142821]/50" />}
          </button>

          {switcherOpen && list.length > 1 && (
            <ul
              role="listbox"
              aria-label="Restaurants"
              className="absolute inset-x-0 top-[calc(100%+6px)] z-20 max-h-64 overflow-auto rounded-[10px] border border-[#142821]/10 bg-[#FFFDF9] p-1 shadow-[0_10px_30px_rgba(20,40,33,.25)]"
            >
              {list.map((r) => {
                const selected = r.id === current?.id
                return (
                  <li key={r.id} role="option" aria-selected={selected}>
                    <button
                      type="button"
                      onClick={() => {
                        setCurrent(r)
                        setSwitcherOpen(false)
                      }}
                      className={`flex w-full items-center gap-2 rounded-[7px] px-2.5 py-2 text-left text-[13.5px] transition hover:bg-[rgba(236,72,153,.10)] ${
                        selected ? 'font-semibold text-pop' : 'text-[#142821]'
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate">{r.name}</span>
                      {selected && <Check size={15} className="flex-shrink-0 text-pop" />}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Main nav */}
        <nav className="flex flex-col gap-0.5 text-[14px]">
          {mainNav.map(({ href, label, icon: Icon, exact, badge }) => {
            const active = exact ? pathname === href : pathname.startsWith(href)
            return (
              <Link key={href} href={href} className={`${navBase} ${active ? navActive : navIdle}`}>
                <Icon size={18} />
                {label}
                {badge === 'review' && <ReviewBadge />}
              </Link>
            )
          })}
        </nav>

        {/* Bottom group */}
        <div className="mt-auto flex flex-col gap-0.5 border-t border-white/10 pt-4 text-[14px]">
          <div className="px-3 pb-1">
            <p className="truncate text-[13px] font-semibold text-cream">{displayName}</p>
            <p className="truncate text-[11px] text-[#C9C2B4]/70">{session.user.email}</p>
          </div>
          <Link
            href="/dashboard/settings"
            className={`${navBase} ${settingsActive ? navActive : navIdle}`}
          >
            <Settings size={18} />
            Settings
          </Link>
          <button
            onClick={signOut}
            className={`${navBase} ${navIdle} text-left`}
          >
            <LogOut size={18} />
            Sign out
          </button>
        </div>
      </aside>

      {/* CONTENT */}
      <div className="ml-0 flex min-w-0 flex-1 flex-col md:ml-60">
        {/* Top bar */}
        <header className="sticky top-0 z-[5] flex flex-col gap-2.5 border-b border-ink/[0.08] bg-cream/95 px-3 py-3 backdrop-blur md:flex-row md:items-center md:justify-between md:gap-4 md:px-8 md:py-4">
          {/* Actions row — first on mobile, so the greeting below gets
              a full-width row of its own and names never truncate. */}
          <div className="order-1 flex items-center justify-between gap-2 md:order-2 md:justify-end">
            {/* Hamburger — mobile only; toggles the sidebar drawer. */}
            <button
              type="button"
              aria-label="Open menu"
              aria-expanded={drawerOpen}
              onClick={() => setDrawerOpen((o) => !o)}
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[9px] border border-ink/[0.14] bg-cream-surface text-ink-2 transition hover:bg-cream-surface-alt md:hidden"
            >
              <Menu size={18} />
            </button>
            <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              aria-label="Search"
              onClick={() => setSearchOpen(true)}
              className="hidden h-10 w-10 items-center justify-center rounded-[9px] border border-ink/[0.14] bg-cream-surface text-ink-2 transition hover:bg-cream-surface-alt sm:flex"
            >
              <Search size={18} />
            </button>
            <Link
              href="/dashboard/alerts"
              aria-label="Price alerts"
              className="relative flex h-10 w-10 items-center justify-center rounded-[9px] border border-ink/[0.14] bg-cream-surface text-ink-2 transition hover:bg-cream-surface-alt"
            >
              <Bell size={18} />
              {alertCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-pop px-1 text-[10px] font-bold text-white">
                  {alertCount}
                </span>
              )}
            </Link>
            <button
              type="button"
              onClick={() => setAskOpen(true)}
              className="hidden items-center gap-2 rounded-[10px] border border-ink/[0.14] bg-cream-surface px-3.5 py-2.5 text-[14px] font-semibold text-ink-2 transition hover:bg-cream-surface-alt sm:flex"
            >
              <Sparkles size={16} className="text-pop" /><span className="hidden md:inline">Ask</span>
            </button>
            <Link
              href="/dashboard/upload"
              aria-label="Add invoice"
              className="flex items-center gap-2 rounded-[10px] bg-ink px-4 py-2.5 text-[14px] font-semibold text-[#FDF8F0] shadow-[0_2px_8px_rgba(23,19,16,.35)] transition hover:bg-black"
            >
              {/* Label collapses to an icon-only button below md so the header row fits the viewport. */}
              <Plus size={16} strokeWidth={2.5} /><span className="hidden md:inline">Add invoice</span>
            </Link>
            {/* Preserves the existing create-restaurant wiring (its own styling). */}
            <AddRestaurantButton />
            </div>
          </div>
          {/* Greeting row — full width on mobile. */}
          <div className="order-2 min-w-0 md:order-1">
            <h1 className="truncate font-display text-[21px] font-extrabold leading-none tracking-[-0.5px] text-ink md:text-[28px]">{greeting}</h1>
            {current && <p className="mt-1 truncate text-[13px] text-ink-muted">{current.name}</p>}
          </div>
        </header>

        {/* If there are no restaurants yet (RLS returns 0), prompt to create one. */}
        {!restLoading && list.length === 0 ? (
          <main className="flex flex-1 items-center justify-center p-8">
            <div className="max-w-md space-y-3 text-center">
              <h2 className="font-display text-[24px] font-bold text-ink">No restaurants yet</h2>
              <p className="text-sm text-ink-3">
                You&apos;re signed in but not a member of any restaurant. Create one to get started,
                or ask your admin for an invite.
              </p>
              <div className="pt-2">
                <AddRestaurantButton />
              </div>
            </div>
          </main>
        ) : !current ? (
          <main className="flex flex-1 items-center justify-center text-sm text-ink-muted">
            Loading restaurant…
          </main>
        ) : (
          <main className="flex-1 overflow-auto pb-24 md:pb-10">{children}</main>
        )}
      </div>
      <ActivityPanel />
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      <AssistantPanel open={askOpen} onClose={() => setAskOpen(false)} />
    </div>
    </ActivityProvider>
  )
}
