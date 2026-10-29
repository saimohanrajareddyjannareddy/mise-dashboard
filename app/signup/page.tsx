'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

/*
 * mise — Signup page
 * Mirrors the Login page design (brand tokens, split layout). One form creates
 * the account AND names the first restaurant: the restaurant name rides in
 * Supabase user metadata, and lib/restaurant.tsx auto-creates the restaurant
 * from it on first sign-in — so this works whether or not the project requires
 * email confirmation before a session exists.
 */
export default function SignupPage() {
  const router = useRouter()
  const [restaurantName, setRestaurantName] = useState('')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [confirmSent, setConfirmSent] = useState(false)

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setLoading(true)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName.trim(),
          restaurant_name: restaurantName.trim(),
        },
      },
    })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    if (data.session) {
      // Email confirmation off: signed in immediately. The restaurant
      // provider auto-creates the restaurant from user metadata.
      router.push('/dashboard')
    } else {
      // Email confirmation on: no session until they click the email link.
      setConfirmSent(true)
      setLoading(false)
    }
  }

  return (
    <div className="grid min-h-screen grid-cols-1 font-sans text-ink md:grid-cols-2">
      {/* LEFT: form */}
      <div className="relative flex flex-col bg-cream px-6 py-10 md:px-14">
        <div className="flex items-baseline gap-px font-serif text-[28px] tracking-[-0.5px] text-forest">
          <span>mise</span>
          <span className="text-[32px] leading-[0] text-terracotta">.</span>
        </div>

        <div className="mx-auto my-auto w-full max-w-[380px] self-center py-10">
          {confirmSent ? (
            <>
              <h1 className="mb-2 font-serif text-[44px] font-normal leading-none tracking-[-1px] text-ink">
                Check your email.
              </h1>
              <p className="mb-[34px] text-[16px] text-ink-3">
                We sent a confirmation link to <span className="font-semibold text-ink-2">{email}</span>.
                Click it, then sign in — your restaurant <span className="font-semibold text-ink-2">{restaurantName}</span> will
                be set up automatically.
              </p>
              <Link
                href="/login"
                className="block w-full rounded-[9px] bg-terracotta py-[14px] text-center text-[15px] font-semibold text-[#FDF8F0] shadow-[0_2px_8px_rgba(196,100,45,.3)] transition hover:bg-terracotta-hover"
              >
                Go to sign in
              </Link>
            </>
          ) : (
            <>
              <h1 className="mb-2 font-serif text-[44px] font-normal leading-none tracking-[-1px] text-ink">
                Start your trial.
              </h1>
              <p className="mb-[34px] text-[16px] text-ink-3">
                14 days free. Upload one invoice and see your food cost.
              </p>

              <form onSubmit={handleSignup}>
                <label className="mb-[7px] block text-[13px] font-semibold text-ink-2">Restaurant name</label>
                <input
                  type="text"
                  value={restaurantName}
                  onChange={(e) => setRestaurantName(e.target.value)}
                  placeholder="Turmeric"
                  required
                  className="mb-[18px] w-full rounded-[9px] border border-ink/20 bg-cream-surface px-[15px] py-[13px] text-[15px] text-ink outline-none focus:border-terracotta"
                />

                <label className="mb-[7px] block text-[13px] font-semibold text-ink-2">Your name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Priya Sharma"
                  required
                  className="mb-[18px] w-full rounded-[9px] border border-ink/20 bg-cream-surface px-[15px] py-[13px] text-[15px] text-ink outline-none focus:border-terracotta"
                />

                <label className="mb-[7px] block text-[13px] font-semibold text-ink-2">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@restaurant.com"
                  required
                  className="mb-[18px] w-full rounded-[9px] border border-ink/20 bg-cream-surface px-[15px] py-[13px] text-[15px] text-ink outline-none focus:border-terracotta"
                />

                <label className="mb-[7px] block text-[13px] font-semibold text-ink-2">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••"
                  required
                  className="mb-6 w-full rounded-[9px] border border-ink/20 bg-cream-surface px-[15px] py-[13px] text-[15px] text-ink outline-none focus:border-terracotta"
                />

                {error && <p className="mb-4 text-[13px] text-[#C0392B]">{error}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-[9px] bg-terracotta py-[14px] text-[15px] font-semibold text-[#FDF8F0] shadow-[0_2px_8px_rgba(196,100,45,.3)] transition hover:bg-terracotta-hover disabled:opacity-50"
                >
                  {loading ? 'Creating your account…' : 'Create account'}
                </button>
              </form>

              <p className="mt-[30px] text-center text-[14px] text-ink-3">
                Already have an account?{' '}
                <Link href="/login" className="font-semibold text-forest hover:text-terracotta">
                  Sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>

      {/* RIGHT: visual (hidden on mobile) */}
      <div className="relative hidden flex-col justify-center bg-forest px-14 py-10 text-[#EDEFE8] md:flex">
        <div className="mx-auto w-full max-w-[440px]">
          <p className="mb-[26px] font-serif text-[34px] font-normal leading-[1.25] text-cream">
            Know your food cost before it eats your margin.
          </p>
          <ul className="space-y-[18px] text-[16px] text-forest-light">
            <li className="flex gap-[12px]">
              <span className="mt-[9px] h-[6px] w-[6px] shrink-0 rounded-full bg-terracotta" />
              Snap a photo of any invoice — Restaurant Depot, Sysco, your local wholesaler. We read every line.
            </li>
            <li className="flex gap-[12px]">
              <span className="mt-[9px] h-[6px] w-[6px] shrink-0 rounded-full bg-terracotta" />
              Food cost % on one screen, matched against your POS sales automatically.
            </li>
            <li className="flex gap-[12px]">
              <span className="mt-[9px] h-[6px] w-[6px] shrink-0 rounded-full bg-terracotta" />
              Price alerts when a supplier raises what you pay — before it shows up in your margins.
            </li>
          </ul>
        </div>

        <div className="absolute bottom-8 left-14 font-serif text-[20px] text-[rgba(247,243,237,.55)]">
          mise<span className="text-terracotta-hover">.</span>
        </div>
      </div>
    </div>
  )
}
