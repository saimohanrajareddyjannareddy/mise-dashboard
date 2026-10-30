import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Recipe costing data layer (stage 1 of the recipe engine).
 *
 * Dishes come from pos_sales (what the POS sold), recipes live in
 * recipes_estimated (AI drafts the owner confirms), and ingredient
 * costs come from the restaurant's latest approved invoice lines
 * resolved to canonical items.
 *
 * Unit math mirrors sql/008's to_base_unit(): everything normalizes
 * to grams / ml / each, and a purchased line's quantity is its
 * unit_qty expressed in the canonical item's default_unit — the
 * same formula usage_variance() uses, so plate costs and the
 * variance page can never disagree. (Case purchases store their
 * count in case_qty with unit_qty = 0, so they don't price yet —
 * that needs pack sizes on canonical_items.)
 */

export interface DishSales {
  menuItemName: string
  soldQty: number
  revenue: number
  avgPrice: number
}

export interface RecipeLine {
  ingredient_name: string
  quantity: number
  unit: string
  confidence: string
}

export interface CanonicalItem {
  id: string
  name: string
  category: string | null
  default_unit: string | null
}

export interface IngredientCost {
  /** Cost per base unit (g / ml / each); null when unpriced. */
  costPerBase: number | null
  baseKind: BaseKind | null
}

export type BaseKind = 'g' | 'ml' | 'each'

const MASS: Record<string, number> = { g: 1, kg: 1000, oz: 28.3495, lb: 453.592 }
const VOLUME: Record<string, number> = { ml: 1, floz: 29.5735, gal: 3785.41, l: 1000 }
const COUNT: Record<string, number> = { each: 1, ea: 1, ct: 1, count: 1 }

export function unitKind(unit: string | null | undefined): BaseKind | null {
  if (!unit) return null
  const u = unit.trim().toLowerCase()
  if (u in MASS) return 'g'
  if (u in VOLUME) return 'ml'
  if (u in COUNT) return 'each'
  return null
}

/** Quantity expressed in base units, or null when the unit is unknown. */
export function toBase(
  qty: number,
  unit: string | null | undefined
): { base: number; kind: BaseKind } | null {
  if (!unit) return null
  const u = unit.trim().toLowerCase()
  if (u in MASS) return { base: qty * MASS[u], kind: 'g' }
  if (u in VOLUME) return { base: qty * VOLUME[u], kind: 'ml' }
  if (u in COUNT) return { base: qty * COUNT[u], kind: 'each' }
  return null
}

export const RECIPE_UNITS = ['oz', 'lb', 'each', 'floz', 'g'] as const

export async function fetchDishSales(
  sb: SupabaseClient,
  restaurantId: string,
  days = 30
): Promise<DishSales[]> {
  const since = new Date(Date.now() - (days - 1) * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10)
  const { data } = await sb
    .from('pos_sales')
    .select('item_name, quantity, revenue')
    .eq('restaurant_id', restaurantId)
    .gte('sale_date', since)
  const map = new Map<string, DishSales>()
  for (const r of (data ?? []) as { item_name: string; quantity: number; revenue: number }[]) {
    const cur =
      map.get(r.item_name) ??
      { menuItemName: r.item_name, soldQty: 0, revenue: 0, avgPrice: 0 }
    cur.soldQty += r.quantity || 0
    cur.revenue += r.revenue || 0
    map.set(r.item_name, cur)
  }
  for (const d of map.values()) {
    d.avgPrice = d.soldQty > 0 ? d.revenue / d.soldQty : 0
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue)
}

export async function fetchRecipes(
  sb: SupabaseClient,
  restaurantId: string
): Promise<Map<string, RecipeLine[]>> {
  const { data } = await sb
    .from('recipes_estimated')
    .select('menu_item_name, ingredient_name, quantity, unit, confidence')
    .eq('restaurant_id', restaurantId)
  const map = new Map<string, RecipeLine[]>()
  for (const r of (data ?? []) as (RecipeLine & { menu_item_name: string })[]) {
    const arr = map.get(r.menu_item_name) ?? []
    arr.push({
      ingredient_name: r.ingredient_name,
      quantity: Number(r.quantity),
      unit: r.unit,
      confidence: r.confidence,
    })
    map.set(r.menu_item_name, arr)
  }
  return map
}

export async function fetchCanonicalItems(
  sb: SupabaseClient
): Promise<CanonicalItem[]> {
  const { data } = await sb
    .from('canonical_items')
    .select('id, name, category, default_unit')
    .order('name')
  return (data ?? []) as CanonicalItem[]
}

/**
 * Latest cost per canonical ingredient, from approved invoice lines.
 * "Latest" = the most recent invoice (by invoice_date) that priced
 * the item with a usable quantity.
 */
export async function fetchIngredientCosts(
  sb: SupabaseClient,
  restaurantId: string,
  canonical: CanonicalItem[]
): Promise<Map<string, IngredientCost>> {
  const costs = new Map<string, IngredientCost>()
  const byId = new Map(canonical.map((c) => [c.id, c]))

  const { data: headers } = await sb
    .from('invoice_headers')
    .select('id, invoice_date, review_status')
    .eq('restaurant_id', restaurantId)
    .order('invoice_date', { ascending: false })
    .limit(80)
  const approved = ((headers ?? []) as { id: string; invoice_date: string; review_status?: string | null }[])
    .filter((h) => h.review_status !== 'needs_review')
  if (approved.length === 0) return costs
  const dateByHeader = new Map(approved.map((h) => [h.id, h.invoice_date]))

  const { data: lines } = await sb
    .from('invoice_lines')
    .select('canonical_item_id, unit_qty, case_qty, total, header_id')
    .in('header_id', approved.map((h) => h.id))
    .not('canonical_item_id', 'is', null)

  type Line = {
    canonical_item_id: string
    unit_qty: number | null
    case_qty: number | null
    total: number | null
    header_id: string
  }
  const sorted = ((lines ?? []) as Line[]).sort((a, b) =>
    (dateByHeader.get(b.header_id) ?? '').localeCompare(dateByHeader.get(a.header_id) ?? '')
  )
  for (const l of sorted) {
    const item = byId.get(l.canonical_item_id)
    if (!item || costs.has(item.name)) continue
    if (!l.total || l.total <= 0) continue
    const qty = l.unit_qty ?? 0
    if (qty <= 0) continue
    const base = toBase(qty, item.default_unit)
    if (!base || base.base <= 0) continue
    costs.set(item.name, { costPerBase: l.total / base.base, baseKind: base.kind })
  }
  return costs
}

/** Plate cost for one recipe; lists ingredients that couldn't be priced. */
export function plateCost(
  lines: RecipeLine[],
  costs: Map<string, IngredientCost>
): { total: number; missing: string[] } {
  let total = 0
  const missing: string[] = []
  for (const line of lines) {
    const base = toBase(line.quantity, line.unit)
    const cost = costs.get(line.ingredient_name)
    if (!base || !cost || cost.costPerBase == null || cost.baseKind !== base.kind) {
      missing.push(line.ingredient_name)
      continue
    }
    total += base.base * cost.costPerBase
  }
  return { total, missing }
}

export function recipeStatus(lines: RecipeLine[] | undefined): 'none' | 'ai' | 'confirmed' {
  if (!lines || lines.length === 0) return 'none'
  return lines.some((l) => l.confidence === 'user_confirmed') ? 'confirmed' : 'ai'
}

export interface VarianceRow {
  ingredient: string
  theoreticalBase: number
  actualBase: number
  variancePct: number | null
  notes: string | null
}

/**
 * Theoretical-vs-actual usage from the usage_variance() SQL
 * function (sql/008 — must be run in the Supabase editor; until
 * then this returns an error the page turns into a setup notice).
 * Quantities are base units (g / ml / each) — display converts
 * back to each ingredient's usual purchase unit.
 */
export async function fetchUsageVariance(
  sb: SupabaseClient,
  restaurantId: string,
  start: string,
  end: string
): Promise<{ rows: VarianceRow[]; error: string | null }> {
  const { data, error } = await sb.rpc('usage_variance', {
    p_restaurant_id: restaurantId,
    p_start: start,
    p_end: end,
  })
  if (error) return { rows: [], error: error.message }
  const rows = ((data ?? []) as {
    ingredient: string
    theoretical_base: number
    actual_base: number
    variance_pct: number | null
    notes: string | null
  }[]).map((r) => ({
    ingredient: r.ingredient,
    theoreticalBase: Number(r.theoretical_base),
    actualBase: Number(r.actual_base),
    variancePct: r.variance_pct == null ? null : Number(r.variance_pct),
    notes: r.notes,
  }))
  return { rows, error: null }
}

/** Base qty → a friendly value in the ingredient's purchase unit. */
export function formatBaseQty(
  baseQty: number,
  defaultUnit: string | null | undefined
): string {
  const conv = defaultUnit ? toBase(1, defaultUnit) : null
  if (conv && conv.base > 0) {
    const v = baseQty / conv.base
    const rounded = v >= 100 ? Math.round(v) : v >= 10 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100
    return `${rounded.toLocaleString('en-US')} ${defaultUnit!.toLowerCase()}`
  }
  if (baseQty >= 1000) return `${(baseQty / 1000).toFixed(1)}k units`
  return `${Math.round(baseQty * 10) / 10} units`
}
