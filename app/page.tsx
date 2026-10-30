import Link from 'next/link'

/*
 * mise — Landing page
 * Recreated from the Claude Design handoff (Mise Landing.dc.html), pixel-for-pixel,
 * as a Next.js App Router server component (no client-side interactivity required).
 *
 * Editor props carried over from the design. For the beta these are hardcoded;
 * lift to config/env when the marketing site becomes configurable and when Pro
 * pricing launches (see PRO_PRICE note below).
 */
const SHOW_SOCIAL_PROOF = true
const SHOW_DASHBOARD_CALLOUT = true
// NOTE: `proPrice` exists in the design's prop schema, but the shipped markup
// shows "Free during beta" rather than a price. Kept to preserve the design's
// semantics and for when Pro pricing goes live (Q4 2026).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const PRO_PRICE = '$79'

// Decorative motion from the design, scoped to this page (globals.css stays
// limited to token/font wiring). Honors prefers-reduced-motion.
const animations = `
  @keyframes miseFloat { 0%,100% { transform: translateY(0) rotate(-1.2deg); } 50% { transform: translateY(-14px) rotate(-1.2deg); } }
  @keyframes miseRise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes miseChip { 0% { opacity: 0; transform: translateX(-6px); } 100% { opacity: 1; transform: translateX(0); } }
  @keyframes misePulse { 0%,100% { opacity: 1; } 50% { opacity: .45; } }
  @keyframes miseShimmer { 0% { background-position: -180px 0; } 100% { background-position: 220px 0; } }
  @media (prefers-reduced-motion: reduce) { .mise-anim { animation: none !important; } }
`

const shimmer =
  'linear-gradient(90deg, rgba(30,58,47,.09) 0%, rgba(30,58,47,.16) 40%, rgba(30,58,47,.09) 80%)'
const shimmerAccent =
  'linear-gradient(90deg, rgba(236,72,153,.14) 0%, rgba(236,72,153,.26) 40%, rgba(236,72,153,.14) 80%)'

export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-cream font-sans text-ink">
      <style dangerouslySetInnerHTML={{ __html: animations }} />

      {/* BLACK BAND — nav + hero */}
      <div className="bg-coal">
      {/* NAV */}
      <nav className="mx-auto flex max-w-[1240px] items-center justify-between px-6 py-[26px] md:px-10">
        <div className="flex items-baseline gap-0.5 font-display text-[28px] font-extrabold tracking-[-0.5px] text-cream">
          <span>InvoiceIQ</span>
          <span className="text-[34px] leading-[0] text-pop">.</span>
        </div>
        <div className="flex items-center gap-5 md:gap-[34px]">
          <Link href="#how-it-works" className="hidden text-[15px] font-medium text-cream/70 hover:text-cream md:inline">
            How it works
          </Link>
          <Link href="#pricing" className="hidden text-[15px] font-medium text-cream/70 hover:text-cream md:inline">
            Pricing
          </Link>
          <Link href="/login" className="hidden text-[15px] font-medium text-cream/70 hover:text-cream md:inline">
            Log in
          </Link>
          <Link
            href="/login"
            className="rounded-[8px] bg-terracotta px-5 py-[11px] text-[15px] font-semibold text-[#FDF8F0] shadow-[0_1px_2px_rgba(196,100,45,.35)] hover:bg-terracotta-hover"
          >
            Get started
          </Link>
        </div>
      </nav>

      {/* HERO */}
      <header className="mx-auto grid max-w-[1240px] grid-cols-1 items-center gap-14 px-6 pb-10 pt-[60px] md:grid-cols-[1.05fr_0.95fr] md:px-10">
        <div>
          <p className="mb-5 font-mono text-[12px] font-semibold uppercase tracking-[0.22em] text-pop">
            Invoice intelligence for independent restaurants
          </p>
          <h1 className="mb-6 font-display text-[42px] font-black uppercase leading-[0.98] tracking-[-1px] text-cream md:text-[76px] md:leading-[0.95]">
            Know where every dollar goes.
            <br />
            <span className="font-serif normal-case italic tracking-normal text-pop">Before your accountant does.</span>
          </h1>
          <p className="mb-8 max-w-[500px] text-[19px] leading-[1.55] text-cream/70">
            Every vendor invoice, captured automatically. From Restaurant Depot to your local produce guy. See margin
            leaks before they cost you the month.
          </p>
          <div className="flex max-w-[480px] gap-[10px]">
            <input
              type="email"
              placeholder="you@restaurant.com"
              className="min-w-0 flex-1 rounded-[9px] border border-white/20 bg-white/[0.06] px-4 py-[15px] text-[15px] text-cream outline-none placeholder:text-cream/40"
            />
            <Link
              href="/login"
              className="flex items-center justify-center whitespace-nowrap rounded-[9px] bg-terracotta px-6 py-[15px] text-[15px] font-semibold text-[#FDF8F0] shadow-[0_2px_8px_rgba(196,100,45,.3)] hover:bg-terracotta-hover"
            >
              Get started
            </Link>
          </div>
          <p className="mt-[14px] flex items-center gap-[7px] text-[13.5px] text-cream/60">
            <span className="text-pop">✓</span> Free while you have &lt; 100 invoices/month
          </p>
          <Link
            href="/login"
            className="mt-[10px] inline-block text-[13.5px] font-medium text-[#F9A8D4] hover:text-pop"
          >
            Or book a 15-min demo →
          </Link>
        </div>

        {/* HERO DATA ELEMENT: decoding invoice card */}
        <div className="relative h-[460px]">
          <div
            className="absolute inset-0"
            style={{ background: 'radial-gradient(120% 90% at 70% 20%, rgba(236,72,153,.16), transparent 60%)' }}
          />
          <div className="mise-anim absolute right-0 top-[30px] w-[380px] max-w-full overflow-hidden rounded-[16px] border border-ink/10 bg-cream-surface shadow-[0_30px_60px_-22px_rgba(30,58,47,.35)] [animation:miseFloat_7s_ease-in-out_infinite]">
            <div className="flex items-center justify-between border-b border-white/10 bg-[#221E1A] px-5 py-4 text-cream">
              <div>
                <div className="text-[11px] uppercase tracking-[0.08em] text-cream/50">Vendor invoice</div>
                <div className="mt-0.5 font-serif text-[21px] leading-[1.1]">Restaurant Depot</div>
              </div>
              <div className="inline-flex items-center gap-[6px] rounded-full bg-pop/20 px-[10px] py-[5px] text-[11px] font-semibold text-[#F9A8D4]">
                <span className="mise-anim h-[6px] w-[6px] rounded-full bg-terracotta-hover [animation:misePulse_1.6s_ease-in-out_infinite]" />
                Decoding
              </div>
            </div>
            <div className="px-3 pb-[14px] pt-2">
              <div className="font-mono text-[13px]">
                <div className="grid grid-cols-[1fr_auto_auto] border-b border-ink/[0.08] px-2 pb-[10px] pt-2 text-[10.5px] uppercase tracking-[0.06em] text-ink-muted">
                  <span>Line item</span>
                  <span className="pr-[18px] text-right">Qty</span>
                  <span className="text-right">Unit $</span>
                </div>
                <div className="mise-anim grid grid-cols-[1fr_auto_auto] border-b border-ink/[0.05] px-2 py-[10px] [animation:miseRise_.5s_ease_both_.2s]">
                  <span className="text-ink">Yellow onions, 50lb</span>
                  <span className="pr-[18px] text-right text-ink-3">2</span>
                  <span className="text-right font-semibold text-terracotta">$18.40 ↑</span>
                </div>
                <div className="mise-anim grid grid-cols-[1fr_auto_auto] border-b border-ink/[0.05] px-2 py-[10px] [animation:miseRise_.5s_ease_both_.38s]">
                  <span className="text-ink">Roma tomatoes, case</span>
                  <span className="pr-[18px] text-right text-ink-3">4</span>
                  <span className="text-right text-ink">$22.10</span>
                </div>
                <div className="mise-anim grid grid-cols-[1fr_auto_auto] border-b border-ink/[0.05] px-2 py-[10px] [animation:miseRise_.5s_ease_both_.56s]">
                  <span className="text-ink">Chicken thighs, 40lb</span>
                  <span className="pr-[18px] text-right text-ink-3">3</span>
                  <span className="text-right font-semibold text-forest">$54.80 ↓</span>
                </div>
                <div className="mise-anim grid grid-cols-[1fr_auto_auto] items-center px-2 py-3 [animation:miseRise_.5s_ease_both_.74s]">
                  <span
                    className="mise-anim h-[11px] w-[130px] rounded-[4px] [animation:miseShimmer_1.3s_linear_infinite]"
                    style={{ background: shimmer, backgroundSize: '220px 100%' }}
                  />
                  <span
                    className="mise-anim mr-[18px] h-[11px] w-[14px] justify-self-end rounded-[4px] [animation:miseShimmer_1.3s_linear_infinite]"
                    style={{ background: shimmer, backgroundSize: '220px 100%' }}
                  />
                  <span
                    className="mise-anim h-[11px] w-[52px] justify-self-end rounded-[4px] [animation:miseShimmer_1.3s_linear_infinite]"
                    style={{ background: shimmerAccent, backgroundSize: '220px 100%' }}
                  />
                </div>
              </div>
            </div>
          </div>
          {/* floating alert chip */}
          <div className="mise-anim absolute bottom-[34px] left-0 max-w-[250px] rounded-[12px] bg-ink px-[18px] py-[14px] text-cream shadow-[0_20px_40px_-16px_rgba(0,0,0,.5)] ring-1 ring-white/15 [animation:miseChip_.6s_ease_both_1s]">
            <div className="mb-[5px] text-[11px] font-semibold uppercase tracking-[0.06em] text-[#F9A8D4]">Price alert</div>
            <div className="text-[14px] leading-[1.35]">
              Yellow onions <span className="font-mono font-semibold text-[#F9A8D4]">↑ 22%</span> this week
            </div>
          </div>
        </div>
      </header>
      </div>

      {/* SOCIAL PROOF STRIP */}
      {SHOW_SOCIAL_PROOF && (
        <div className="mx-auto max-w-[1240px] px-6 pb-2 pt-5 text-center md:px-10">
          <p className="text-[13.5px] tracking-[0.02em] text-[#9A9384]">
            Used by independent restaurants like <span className="font-semibold text-ink-2">Turmeric STL</span> and{' '}
            <span className="font-semibold text-ink-2">BASIL India</span>
          </p>
        </div>
      )}

      {/* THREE FEATURE CARDS */}
      <section className="mx-auto max-w-[1240px] px-6 py-16 md:px-10">
        <div className="grid grid-cols-1 gap-[22px] md:grid-cols-3">
          <div className="rounded-[16px] border border-ink/[0.08] bg-cream-surface px-7 py-[30px]">
            <div className="mb-[22px] flex h-[46px] w-[46px] items-center justify-center rounded-[11px] bg-forest/[0.07]">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1E3A2F" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h11l5 5v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
                <path d="M14 4v5h5" />
                <path d="M7 13h8M7 17h5" />
              </svg>
            </div>
            <h3 className="mb-2 font-serif text-[25px] font-normal text-ink">Every invoice, automatically</h3>
            <p className="text-[15px] leading-[1.55] text-ink-3">
              Auto-capture from vendor emails, portals, and uploads. No data entry, no shoebox of receipts.
            </p>
          </div>

          <div className="rounded-[16px] border border-ink/[0.08] bg-cream-surface px-7 py-[30px]">
            <div className="mb-[22px] flex h-[46px] w-[46px] items-center justify-center rounded-[11px] bg-terracotta/10">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#EC4899" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 17l5-5 4 3 6-8" />
                <path d="M18 4h3v3" />
              </svg>
            </div>
            <h3 className="mb-2 font-serif text-[25px] font-normal text-ink">Price alerts that catch overcharges</h3>
            <p className="text-[15px] leading-[1.55] text-ink-3">
              When it&apos;s Yellow onions ↑ 22% this week, you know — before you pay, not at tax time.
            </p>
          </div>

          <div className="rounded-[16px] border border-ink/[0.08] bg-cream-surface px-7 py-[30px]">
            <div className="mb-[22px] flex h-[46px] w-[46px] items-center justify-center rounded-[11px] bg-forest/[0.07]">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1E3A2F" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
              </svg>
            </div>
            <h3 className="mb-2 font-serif text-[25px] font-normal text-ink">Waste + margin analytics</h3>
            <p className="text-[15px] leading-[1.55] text-ink-3">
              Food cost % by category, with a flag the moment a category starts drifting up on you.
            </p>
          </div>
        </div>
      </section>

      {/* DASHBOARD PREVIEW */}
      <section className="mx-auto max-w-[1240px] px-6 pb-[72px] pt-6 md:px-10">
        <div className="mb-9 text-center">
          <div className="mb-3 text-[12.5px] font-semibold uppercase tracking-[0.1em] text-terracotta">The dashboard</div>
          <h2 className="font-serif text-[34px] font-normal leading-[1.05] tracking-[-0.5px] text-ink md:text-[46px]">
            Your P&amp;L, line by line, in real time
          </h2>
        </div>

        <div className="overflow-hidden rounded-[18px] border border-ink/10 bg-cream-surface shadow-[0_40px_80px_-30px_rgba(30,58,47,.4)]">
          {/* window bar */}
          <div className="flex items-center gap-2 border-b border-ink/[0.08] bg-[#EFEAE0] px-[18px] py-[13px]">
            <span className="h-[11px] w-[11px] rounded-full bg-[#D9877A]" />
            <span className="h-[11px] w-[11px] rounded-full bg-[#E4C07A]" />
            <span className="h-[11px] w-[11px] rounded-full bg-[#9DBF9E]" />
            <span className="ml-[14px] font-mono text-[12px] text-ink-muted">getinvoiceiq.com/dashboard</span>
          </div>

          <div className="grid md:grid-cols-[220px_1fr]">
            {/* sidebar (desktop only) */}
            <aside className="hidden min-h-[460px] bg-coal px-4 py-[22px] text-[#E8E2D6] md:block">
              <div className="px-2 pb-[22px] font-display text-[22px] font-extrabold tracking-tight text-cream">
                InvoiceIQ<span className="text-terracotta-hover">.</span>
              </div>
              <div className="flex flex-col gap-[3px] text-[14px]">
                <div className="rounded-[8px] bg-pop/20 px-3 py-[9px] font-semibold text-white">Price tracker</div>
                <div className="rounded-[8px] px-3 py-[9px] text-[#C9C2B4]">Invoices</div>
                <div className="rounded-[8px] px-3 py-[9px] text-[#C9C2B4]">Vendors</div>
                <div className="rounded-[8px] px-3 py-[9px] text-[#C9C2B4]">Food cost %</div>
                <div className="rounded-[8px] px-3 py-[9px] text-[#C9C2B4]">Alerts</div>
              </div>
              <div className="mt-[26px] px-3 text-[10.5px] uppercase tracking-[0.08em] text-[#8A8377]">Categories</div>
              <div className="mt-2 flex flex-col gap-[3px] text-[14px]">
                <div className="flex justify-between rounded-[8px] px-3 py-2 text-[#C9C2B4]"><span>Produce</span><span className="font-mono text-[#F9A8D4]">↑</span></div>
                <div className="flex justify-between rounded-[8px] px-3 py-2 text-[#C9C2B4]"><span>Protein</span><span className="font-mono text-[#9DBF9E]">↓</span></div>
                <div className="flex justify-between rounded-[8px] px-3 py-2 text-[#C9C2B4]"><span>Dry goods</span><span className="font-mono text-forest-light">→</span></div>
              </div>
            </aside>

            {/* main */}
            <main className="px-[30px] py-[26px]">
              <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
                {/* price tracker (compact) */}
                <div>
                  <div className="mb-3 flex items-baseline justify-between">
                    <div>
                      <h3 className="m-0 font-serif text-[22px] font-normal text-ink">Price tracker</h3>
                      <p className="mt-[3px] text-[12px] text-ink-muted">Trailing 6 weeks · 3 vendors</p>
                    </div>
                  </div>
                  <div className="relative rounded-[12px] border border-ink/[0.07] bg-cream-surface-alt px-[14px] pb-[6px] pt-3">
                    <svg viewBox="0 0 620 220" className="block h-[82px] w-full" preserveAspectRatio="none">
                      <line x1="0" y1="40" x2="620" y2="40" stroke="rgba(26,23,19,.06)" strokeWidth="1" />
                      <line x1="0" y1="90" x2="620" y2="90" stroke="rgba(26,23,19,.06)" strokeWidth="1" />
                      <line x1="0" y1="140" x2="620" y2="140" stroke="rgba(26,23,19,.06)" strokeWidth="1" />
                      <line x1="0" y1="190" x2="620" y2="190" stroke="rgba(26,23,19,.06)" strokeWidth="1" />
                      <polyline points="10,150 110,146 210,140 310,128 410,112 510,74 610,44" fill="none" stroke="#EC4899" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                      <circle cx="610" cy="44" r="5" fill="#EC4899" />
                      <polyline points="10,108 110,112 210,106 310,110 410,104 510,108 610,105" fill="none" stroke="#8A8377" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      <polyline points="10,96 110,104 210,118 310,128 410,146 510,158 610,170" fill="none" stroke="#1E3A2F" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                      <circle cx="610" cy="170" r="5" fill="#1E3A2F" />
                    </svg>
                    <div className="flex justify-between px-0.5 pb-0.5 pt-1 font-mono text-[10px] text-[#A69E90]">
                      <span>W1</span><span>W2</span><span>W3</span><span>W4</span><span>W5</span><span>W6</span>
                    </div>
                    {SHOW_DASHBOARD_CALLOUT && (
                      <div className="absolute bottom-[26px] left-3 flex items-center gap-[7px] rounded-[8px] bg-ink px-[10px] py-[6px] font-mono text-[11px] text-cream shadow-[0_10px_24px_-10px_rgba(0,0,0,.45)]">
                        <span className="font-semibold text-[#F9A8D4]">Yellow onions ↑ 22%</span>
                        <span className="text-[#C7C0B4]">this week</span>
                      </div>
                    )}
                  </div>
                  <div className="mt-[10px] flex gap-[6px] font-mono text-[11px]">
                    <span className="inline-flex items-center gap-[5px] rounded-[6px] bg-terracotta/10 px-2 py-[5px] text-terracotta"><span className="h-[3px] w-2 rounded-[2px] bg-terracotta" />Onions</span>
                    <span className="inline-flex items-center gap-[5px] rounded-[6px] bg-ink/[0.05] px-2 py-[5px] text-ink-3"><span className="h-[3px] w-2 rounded-[2px] bg-ink-muted" />Tomatoes</span>
                    <span className="inline-flex items-center gap-[5px] rounded-[6px] bg-forest/[0.08] px-2 py-[5px] text-forest"><span className="h-[3px] w-2 rounded-[2px] bg-forest" />Chicken</span>
                  </div>
                </div>

                {/* recent invoices */}
                <div>
                  <div className="mb-3 flex items-baseline justify-between">
                    <h3 className="m-0 font-serif text-[22px] font-normal text-ink">Recent invoices</h3>
                    <span className="font-mono text-[11px] text-ink-muted">Last 7 days</span>
                  </div>
                  <div className="overflow-hidden rounded-[12px] border border-ink/[0.07] bg-cream-surface-alt">
                    <div className="flex items-center justify-between border-b border-ink/[0.06] px-[14px] py-[11px]">
                      <div><div className="text-[13px] text-ink">Restaurant Depot</div><div className="text-[11px] text-ink-muted">Jul 9 · 24 items</div></div>
                      <div className="text-right"><div className="font-mono text-[13px] text-ink">$1,842</div><span className="font-mono text-[10px] text-terracotta">2 flagged</span></div>
                    </div>
                    <div className="flex items-center justify-between border-b border-ink/[0.06] px-[14px] py-[11px]">
                      <div><div className="text-[13px] text-ink">Sysco Foods</div><div className="text-[11px] text-ink-muted">Jul 8 · 41 items</div></div>
                      <div className="text-right"><div className="font-mono text-[13px] text-ink">$3,210</div><span className="font-mono text-[10px] text-forest">clean</span></div>
                    </div>
                    <div className="flex items-center justify-between border-b border-ink/[0.06] px-[14px] py-[11px]">
                      <div><div className="text-[13px] text-ink">Baldor Specialty</div><div className="text-[11px] text-ink-muted">Jul 7 · 18 items</div></div>
                      <div className="text-right"><div className="font-mono text-[13px] text-ink">$964</div><span className="font-mono text-[10px] text-terracotta">1 flagged</span></div>
                    </div>
                    <div className="flex items-center justify-between px-[14px] py-[11px]">
                      <div><div className="text-[13px] text-ink">Pacific Seafood</div><div className="text-[11px] text-ink-muted">Jul 6 · 9 items</div></div>
                      <div className="text-right"><div className="font-mono text-[13px] text-ink">$1,120</div><span className="font-mono text-[10px] text-forest">clean</span></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* stat row */}
              <div className="mt-[14px] grid grid-cols-1 gap-[14px] sm:grid-cols-3">
                <div className="rounded-[11px] border border-ink/[0.07] bg-cream-surface-alt px-4 py-[15px]">
                  <div className="text-[11.5px] tracking-[0.03em] text-ink-muted">Food cost this period</div>
                  <div className="mt-1 font-mono text-[26px] font-semibold text-ink">31.4<span className="text-[16px] text-ink-muted">%</span></div>
                  <div className="mt-0.5 font-mono text-[12px] text-terracotta">↑ 1.8 pts vs. last month</div>
                </div>
                <div className="rounded-[11px] border border-ink/[0.07] bg-cream-surface-alt px-4 py-[15px]">
                  <div className="text-[11.5px] tracking-[0.03em] text-ink-muted">Overcharges caught</div>
                  <div className="mt-1 font-mono text-[26px] font-semibold text-ink">$1,240</div>
                  <div className="mt-0.5 font-mono text-[12px] text-forest">↓ recovered this quarter</div>
                </div>
                <div className="rounded-[11px] border border-ink/[0.07] bg-cream-surface-alt px-4 py-[15px]">
                  <div className="text-[11.5px] tracking-[0.03em] text-ink-muted">Invoices parsed</div>
                  <div className="mt-1 font-mono text-[26px] font-semibold text-ink">318</div>
                  <div className="mt-0.5 font-mono text-[12px] text-ink-muted">across 7 vendors</div>
                </div>
              </div>
            </main>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="bg-coal text-[#EDEFE8]">
        <div className="mx-auto max-w-[1240px] px-6 py-[76px] md:px-10">
          <div className="mb-[52px] text-center">
            <div className="mb-3 text-[12.5px] font-semibold uppercase tracking-[0.1em] text-pop">How it works</div>
            <h2 className="font-serif text-[34px] font-normal leading-[1.05] text-cream md:text-[46px]">
              Set it up once. Never touch it again.
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-[30px] md:grid-cols-3">
            <div>
              <div className="mb-[14px] font-mono text-[14px] text-pop">01</div>
              <h3 className="mb-[10px] font-serif text-[27px] font-normal text-cream">Connect your vendors</h3>
              <p className="text-[15px] leading-[1.55] text-[#C9C2B4]">
                Restaurant Depot, Sysco, US Foods, or just forward the email. We handle the rest.
              </p>
            </div>
            <div>
              <div className="mb-[14px] font-mono text-[14px] text-pop">02</div>
              <h3 className="mb-[10px] font-serif text-[27px] font-normal text-cream">We parse every invoice</h3>
              <p className="text-[15px] leading-[1.55] text-[#C9C2B4]">
                Each invoice becomes clean line items — product, quantity, unit price — mapped to your categories.
              </p>
            </div>
            <div>
              <div className="mb-[14px] font-mono text-[14px] text-pop">03</div>
              <h3 className="mb-[10px] font-serif text-[27px] font-normal text-cream">Get alerts, save money</h3>
              <p className="text-[15px] leading-[1.55] text-[#C9C2B4]">
                Price jumps, margin drift, and vendor games surface the moment they happen.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* TESTIMONIAL */}
      <section className="mx-auto max-w-[900px] px-6 py-[88px] text-center md:px-10">
        <blockquote className="m-0">
          <p className="mb-7 font-serif text-[28px] font-normal italic leading-[1.25] tracking-[-0.5px] text-ink md:text-[40px]">
            “I was losing <span className="text-terracotta">$400 a month</span> to price drift on three vendors and had
            no idea. InvoiceIQ caught it in the first week.”
          </p>
        </blockquote>
        <div className="flex items-center justify-center gap-3">
          <div className="flex h-[44px] w-[44px] items-center justify-center rounded-full bg-coal font-display text-[17px] font-bold text-cream">DR</div>
          <div className="text-left">
            <div className="text-[15px] font-semibold text-ink">Danielle Rivas</div>
            <div className="text-[13.5px] text-ink-muted">Owner, Cardo &amp; Vine · St. Louis</div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="mx-auto max-w-[1000px] px-6 pb-20 pt-5 md:px-10">
        <div className="mb-11 text-center">
          <div className="mb-3 text-[12.5px] font-semibold uppercase tracking-[0.1em] text-terracotta">Pricing</div>
          <h2 className="font-serif text-[34px] font-normal leading-[1.05] text-ink md:text-[46px]">
            Start free. Upgrade when it pays for itself.
          </h2>
        </div>
        <div className="grid grid-cols-1 items-stretch gap-[22px] md:grid-cols-2">
          {/* Starter */}
          <div className="flex flex-col rounded-[18px] border border-ink/10 bg-cream-surface px-8 py-[34px]">
            <div className="text-[15px] font-semibold text-ink">Starter</div>
            <div className="mb-[6px] mt-4 flex items-baseline gap-[6px]">
              <span className="font-serif text-[52px] leading-none text-ink">Free</span>
            </div>
            <p className="mb-[22px] text-[14px] text-ink-muted">Up to 100 invoices / month</p>
            <div className="mb-7 flex flex-col gap-[11px] text-[14.5px] text-ink-2">
              <div className="flex gap-[10px]"><span className="text-forest">✓</span> Auto-capture &amp; parsing</div>
              <div className="flex gap-[10px]"><span className="text-forest">✓</span> Price alerts</div>
              <div className="flex gap-[10px]"><span className="text-forest">✓</span> Single location</div>
            </div>
            <Link
              href="/login"
              className="mt-auto rounded-[9px] border border-ink px-4 py-[13px] text-center text-[15px] font-semibold text-ink hover:bg-ink/[0.04]"
            >
              Get started free
            </Link>
          </div>
          {/* Pro */}
          <div className="relative flex flex-col rounded-[18px] bg-coal px-8 py-[34px] text-[#EDEFE8] shadow-[0_30px_60px_-28px_rgba(23,19,16,.55)]">
            <div className="absolute right-[26px] top-[22px] rounded-full bg-pop/20 px-[11px] py-[5px] text-[11px] font-semibold uppercase tracking-[0.06em] text-[#F9A8D4]">
              Most popular
            </div>
            <div className="text-[15px] font-semibold text-pop">Pro</div>
            <div className="mb-[6px] mt-4 flex items-baseline gap-1">
              <span className="font-serif text-[52px] leading-none text-cream">Free during beta</span>
            </div>
            <p className="mb-[22px] text-[14px] text-[#C9C2B4]">
              Pro pricing launches Q4 2026 · early users lock in a 50% discount
            </p>
            <div className="mb-7 flex flex-col gap-[11px] text-[14.5px] text-[#DDE7E0]">
              <div className="flex gap-[10px]"><span className="text-pop">✓</span> Unlimited invoices</div>
              <div className="flex gap-[10px]"><span className="text-pop">✓</span> Multi-location</div>
              <div className="flex gap-[10px]"><span className="text-pop">✓</span> Margin &amp; food-cost analytics</div>
              <div className="flex gap-[10px]"><span className="text-pop">✓</span> Priority support</div>
            </div>
            <Link
              href="/login"
              className="mt-auto rounded-[9px] bg-terracotta px-4 py-[14px] text-center text-[15px] font-semibold text-[#FDF8F0] shadow-[0_4px_14px_rgba(196,100,45,.4)] hover:bg-terracotta-hover"
            >
              Join the beta
            </Link>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section id="cta" className="mx-auto mb-5 max-w-[1240px] px-6 md:px-10">
        <div className="rounded-[22px] border border-white/10 bg-coal px-6 py-[72px] text-center md:px-10">
          <h2 className="mb-[26px] font-serif text-[40px] font-normal leading-[1.02] tracking-[-1px] text-cream md:text-[56px]">
            Find out what you&apos;re <span className="italic text-terracotta">overpaying</span> for.
          </h2>
          <div className="mx-auto flex max-w-[480px] gap-[10px]">
            <input
              type="email"
              placeholder="you@restaurant.com"
              className="min-w-0 flex-1 rounded-[9px] border border-white/20 bg-white/[0.06] px-4 py-[15px] text-[15px] text-cream outline-none placeholder:text-cream/40"
            />
            <Link
              href="/login"
              className="flex items-center justify-center whitespace-nowrap rounded-[9px] bg-terracotta px-6 py-[15px] text-[15px] font-semibold text-[#FDF8F0] shadow-[0_2px_8px_rgba(196,100,45,.3)] hover:bg-terracotta-hover"
            >
              Get started
            </Link>
          </div>
          <p className="mt-[14px] text-[13.5px] text-cream/50">
            Free while you have &lt; 100 invoices/month · No card required
          </p>
          <Link
            href="/login"
            className="mt-[10px] inline-block text-[13.5px] font-medium text-[#F9A8D4] hover:text-pop"
          >
            Or book a 15-min demo →
          </Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-4 px-6 py-10 md:px-10">
        <div className="flex items-center gap-2 text-[13.5px] text-ink-muted">
          <span className="font-display text-[19px] font-extrabold tracking-tight text-ink">
            InvoiceIQ<span className="text-terracotta">.</span>
          </span>
          <span className="mx-1">·</span> hello@getinvoiceiq.com
        </div>
        <div className="flex gap-[22px] text-[13.5px]">
          <Link href="#" className="text-ink-muted hover:text-ink-2">Terms</Link>
          <Link href="#" className="text-ink-muted hover:text-ink-2">Privacy</Link>
          <Link href="#" className="text-ink-muted hover:text-ink-2">Twitter</Link>
          <Link href="#" className="text-ink-muted hover:text-ink-2">LinkedIn</Link>
        </div>
      </footer>
    </div>
  )
}
