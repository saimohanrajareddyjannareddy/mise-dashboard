'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRestaurant } from '@/lib/restaurant'

/*
 * Count pill for the Review nav item. Silently renders nothing when
 * the queue is empty or the review columns don't exist yet (i.e.
 * sql/010_review_queue.sql hasn't been run) — the nav must never
 * break because of this badge.
 */
export default function ReviewBadge() {
  const { current } = useRestaurant()
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!current?.id) return
    let cancelled = false
    supabase
      .from('invoice_headers')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', current.id)
      .eq('review_status', 'needs_review')
      .then(({ count: c, error }) => {
        if (!cancelled && !error && c) setCount(c)
      })
    return () => {
      cancelled = true
    }
  }, [current?.id])

  if (count === 0) return null
  return (
    <span className="ml-auto rounded-full bg-terracotta px-2 py-0.5 text-[11px] font-bold text-white">
      {count}
    </span>
  )
}
