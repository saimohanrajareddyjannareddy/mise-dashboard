'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

/**
 * InvoiceIQ — OAuth return point.
 * Google sign-in lands here after Supabase. Depending on the project's flow
 * the session arrives as hash tokens (picked up by the Supabase client on
 * load) or as a one-time code to exchange. Either way, once a session
 * exists the user continues to the dashboard; if nothing materializes,
 * they go back to the sign-in page.
 */
export default function AuthCallbackPage() {
  const router = useRouter()
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    let active = true
    let redirected = false

    const go = (path: string) => {
      if (active && !redirected) {
        redirected = true
        router.replace(path)
      }
    }

    ;(async () => {
      const code = new URL(window.location.href).searchParams.get('code')
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error) {
          go('/dashboard')
          return
        }
      }
      const { data } = await supabase.auth.getSession()
      if (data.session) {
        go('/dashboard')
        return
      }
      // Implicit-flow tokens can take a moment for the client to absorb.
      const began = Date.now()
      const timer = setInterval(async () => {
        const { data: polled } = await supabase.auth.getSession()
        if (polled.session) {
          clearInterval(timer)
          go('/dashboard')
        } else if (Date.now() - began > 4000) {
          clearInterval(timer)
          go('/login')
        }
      }, 400)
    })()

    return () => {
      active = false
    }
  }, [router])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-cream px-6 font-sans text-ink">
      <div className="flex items-baseline gap-px font-display text-[30px] font-extrabold tracking-[-0.5px]">
        <span>InvoiceIQ</span>
        <span className="text-[34px] leading-[0] text-terracotta">.</span>
      </div>
      <p className="mt-4 text-[15px] text-ink-3">Signing you in…</p>
    </div>
  )
}
