import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * AI recipe draft: given a dish the POS sold, Claude proposes a
 * single-serving recipe using ONLY the restaurant's canonical
 * ingredients (exact names — recipes_estimated joins canonical_items
 * by name), saved as confidence='ai_inferred' for the owner to
 * review, edit and confirm on the Recipes page.
 *
 * Refuses to overwrite a user-confirmed recipe.
 */

const UNITS = ['oz', 'lb', 'each', 'floz', 'g']

export async function POST(req: NextRequest) {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!serviceKey || !apiKey) {
    return NextResponse.json(
      { error: 'Recipe drafting is not configured on the server' },
      { status: 500 }
    )
  }

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  const body = (await req.json()) as { restaurant_id?: string; menu_item_name?: string }
  const restaurantId = body.restaurant_id
  const dish = (body.menu_item_name || '').trim()
  if (!restaurantId || !dish) {
    return NextResponse.json({ error: 'restaurant_id and menu_item_name required' }, { status: 400 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const { data: userData } = await anon.auth.getUser(token)
  const user = userData?.user
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  const sb = createClient(url, serviceKey)
  const { data: membership } = await sb
    .from('user_restaurants')
    .select('restaurant_id')
    .eq('user_id', user.id)
    .eq('restaurant_id', restaurantId)
    .maybeSingle()
  if (!membership) {
    return NextResponse.json({ error: 'Not a member of this restaurant' }, { status: 403 })
  }

  // A confirmed recipe is the owner's word — never overwrite it.
  const { data: existing } = await sb
    .from('recipes_estimated')
    .select('confidence')
    .eq('restaurant_id', restaurantId)
    .eq('menu_item_name', dish)
  if ((existing ?? []).some((r) => r.confidence === 'user_confirmed')) {
    return NextResponse.json(
      { error: 'This dish already has a confirmed recipe — edit it instead.' },
      { status: 409 }
    )
  }

  const { data: rest } = await sb
    .from('restaurants')
    .select('name')
    .eq('id', restaurantId)
    .maybeSingle()

  // Ingredient vocabulary: the canonical catalog. Items this
  // restaurant actually buys are listed first (most relevant).
  const { data: canonicalRows } = await sb
    .from('canonical_items')
    .select('id, name, default_unit')
  const canonical = (canonicalRows ?? []) as { id: string; name: string; default_unit: string | null }[]
  if (canonical.length === 0) {
    return NextResponse.json(
      { error: 'No ingredients catalog yet — upload a few invoices first so ingredients can be mapped.' },
      { status: 400 }
    )
  }
  const { data: purchasedLines } = await sb
    .from('invoice_lines')
    .select('canonical_item_id')
    .eq('restaurant_id', restaurantId)
    .not('canonical_item_id', 'is', null)
    .limit(500)
  const purchasedIds = new Set((purchasedLines ?? []).map((l) => l.canonical_item_id as string))
  const sorted = [...canonical].sort((a, b) => {
    const pa = purchasedIds.has(a.id) ? 0 : 1
    const pb = purchasedIds.has(b.id) ? 0 : 1
    return pa - pb || a.name.localeCompare(b.name)
  })
  const validNames = new Set(canonical.map((c) => c.name))
  const vocab = sorted.map((c) => `- ${c.name} (usually bought per ${c.default_unit ?? 'EA'})`).join('\n')

  const system = [
    'You are an experienced restaurant chef and cost consultant.',
    'You draft a standard single-serving recipe for a dish.',
    'RULES:',
    '- Use ONLY ingredients from the provided list, spelled exactly as given.',
    '- Quantities are per ONE serving, in realistic restaurant portions.',
    '- unit must be one of: oz, lb, each, floz, g.',
    '- Include 4 to 10 ingredients: proteins, produce, dairy, grains, spices, oils — whatever the dish genuinely needs from the list.',
    '- If the list lacks an essential ingredient, do your best with what exists rather than inventing names.',
    'Return ONLY a JSON object, no prose: {"lines":[{"ingredient_name":"...","quantity":number,"unit":"oz"}]}',
  ].join('\n')
  const userMsg = `Restaurant: ${rest?.name ?? 'a restaurant'}\nDish: ${dish}\n\nAvailable ingredients:\n${vocab}`

  let draft: { ingredient_name: string; quantity: number; unit: string }[] = []
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-7',
        max_tokens: 1200,
        system,
        messages: [{ role: 'user', content: userMsg }],
      }),
    })
    if (!resp.ok) throw new Error(`Claude API ${resp.status}`)
    const data = await resp.json()
    const text = (data.content ?? [])
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('')
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start < 0 || end <= start) throw new Error('No JSON in draft response')
    const parsed = JSON.parse(text.slice(start, end + 1)) as {
      lines?: { ingredient_name?: string; quantity?: number; unit?: string }[]
    }
    draft = (parsed.lines ?? [])
      .filter(
        (l) =>
          l.ingredient_name &&
          validNames.has(l.ingredient_name) &&
          typeof l.quantity === 'number' &&
          l.quantity > 0 &&
          l.quantity <= 10000 &&
          l.unit &&
          UNITS.includes(l.unit)
      )
      .map((l) => ({
        ingredient_name: l.ingredient_name as string,
        quantity: l.quantity as number,
        unit: l.unit as string,
      }))
  } catch (e) {
    return NextResponse.json(
      { error: `Could not draft a recipe: ${(e as Error).message}` },
      { status: 502 }
    )
  }
  if (draft.length === 0) {
    return NextResponse.json(
      { error: 'The draft came back empty — none of the suggested ingredients matched your catalog.' },
      { status: 502 }
    )
  }

  // Replace the previous AI draft (confirmed rows were refused above).
  await sb
    .from('recipes_estimated')
    .delete()
    .eq('restaurant_id', restaurantId)
    .eq('menu_item_name', dish)
    .eq('confidence', 'ai_inferred')
  const { error: insErr } = await sb.from('recipes_estimated').insert(
    draft.map((l) => ({
      restaurant_id: restaurantId,
      menu_item_name: dish,
      ingredient_name: l.ingredient_name,
      quantity: l.quantity,
      unit: l.unit,
      confidence: 'ai_inferred',
      source: 'claude:opus-4.7',
    }))
  )
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  return NextResponse.json({ lines: draft })
}
