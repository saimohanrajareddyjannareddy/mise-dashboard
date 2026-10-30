'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRestaurant } from '@/lib/restaurant'
import {
  fetchCanonicalItems,
  fetchDishSales,
  fetchIngredientCosts,
  fetchRecipes,
  fetchUsageVariance,
  formatBaseQty,
  plateCost,
  recipeStatus,
  toBase,
  unitKind,
  RECIPE_UNITS,
  type CanonicalItem,
  type DishSales,
  type IngredientCost,
  type RecipeLine,
  type VarianceRow,
} from '@/lib/recipes'

// Recipes & dish costing (stage 1): dishes come from POS sales,
// the AI drafts a per-serving recipe from the restaurant's own
// ingredient catalog, the owner edits + confirms it, and the plate
// cost prices every ingredient at its latest invoice cost.

const money = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const card = 'rounded-[14px] border border-ink/[0.08] bg-cream-surface p-[22px]'

type EditLine = { ingredient_name: string; quantity: string; unit: string }

export default function RecipesPage() {
  const { current } = useRestaurant()
  const restaurantId = current?.id ?? null

  const [dishes, setDishes] = useState<DishSales[]>([])
  const [recipes, setRecipes] = useState<Map<string, RecipeLine[]>>(new Map())
  const [costs, setCosts] = useState<Map<string, IngredientCost>>(new Map())
  const [canonical, setCanonical] = useState<CanonicalItem[]>([])
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)

  const [editing, setEditing] = useState<string | null>(null)
  const [editLines, setEditLines] = useState<EditLine[]>([])
  const [saving, setSaving] = useState(false)
  const [drafting, setDrafting] = useState<string | null>(null)

  const [period, setPeriod] = useState<'30d' | 'month' | 'lastMonth'>('30d')
  const [variance, setVariance] = useState<VarianceRow[]>([])
  const [varianceError, setVarianceError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!restaurantId) return
    setLoading(true)
    const canon = await fetchCanonicalItems(supabase)
    const [dishList, recipeMap, costMap] = await Promise.all([
      fetchDishSales(supabase, restaurantId, 30),
      fetchRecipes(supabase, restaurantId),
      fetchIngredientCosts(supabase, restaurantId, canon),
    ])
    setCanonical(canon)
    setDishes(dishList)
    setRecipes(recipeMap)
    setCosts(costMap)

    // Theoretical-vs-actual for the selected period.
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const now = new Date()
    let start: string
    let end: string
    if (period === 'month') {
      start = fmt(new Date(now.getFullYear(), now.getMonth(), 1))
      end = fmt(now)
    } else if (period === 'lastMonth') {
      start = fmt(new Date(now.getFullYear(), now.getMonth() - 1, 1))
      end = fmt(new Date(now.getFullYear(), now.getMonth(), 0))
    } else {
      start = fmt(new Date(now.getTime() - 29 * 24 * 3600 * 1000))
      end = fmt(now)
    }
    const v = await fetchUsageVariance(supabase, restaurantId, start, end)
    setVariance(v.rows)
    setVarianceError(v.error)
    setLoading(false)
  }, [restaurantId, period])

  useEffect(() => {
    load()
  }, [load])

  function openEditor(dish: string) {
    const lines = recipes.get(dish) ?? []
    setEditLines(
      lines.length > 0
        ? lines.map((l) => ({
            ingredient_name: l.ingredient_name,
            quantity: String(l.quantity),
            unit: l.unit,
          }))
        : [{ ingredient_name: canonical[0]?.name ?? '', quantity: '1', unit: 'oz' }]
    )
    setEditing(dish)
    setNotice(null)
  }

  async function draftWithAi(dish: string) {
    if (!restaurantId) return
    setDrafting(dish)
    setNotice(null)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error('Sign in required')
      const resp = await fetch('/api/recipes/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ restaurant_id: restaurantId, menu_item_name: dish }),
      })
      const json = await resp.json()
      if (!resp.ok) throw new Error(json.error || 'Draft failed')
      await load()
      setNotice(`AI drafted a recipe for ${dish} — review it below and Save to confirm.`)
      // Open the editor on the fresh draft.
      const fresh = await fetchRecipes(supabase, restaurantId)
      const lines = fresh.get(dish) ?? []
      setEditLines(
        lines.map((l) => ({
          ingredient_name: l.ingredient_name,
          quantity: String(l.quantity),
          unit: l.unit,
        }))
      )
      setEditing(dish)
    } catch (e) {
      setNotice((e as Error).message)
    } finally {
      setDrafting(null)
    }
  }

  async function saveRecipe(dish: string) {
    if (!restaurantId) return
    setSaving(true)
    setNotice(null)
    try {
      // Normalize rows; merge the same ingredient+unit, drop empties.
      const merged = new Map<string, RecipeLine>()
      for (const row of editLines) {
        const qty = Number(row.quantity)
        if (!row.ingredient_name || !qty || qty <= 0) continue
        const key = `${row.ingredient_name}|${row.unit}`
        const cur = merged.get(key)
        if (cur) cur.quantity += qty
        else
          merged.set(key, {
            ingredient_name: row.ingredient_name,
            quantity: qty,
            unit: row.unit,
            confidence: 'user_confirmed',
          })
      }
      const lines = [...merged.values()]
      if (lines.length === 0) throw new Error('Add at least one ingredient with a quantity.')

      const { error: delErr } = await supabase
        .from('recipes_estimated')
        .delete()
        .eq('restaurant_id', restaurantId)
        .eq('menu_item_name', dish)
      if (delErr) throw new Error(delErr.message)
      const { error: insErr } = await supabase.from('recipes_estimated').insert(
        lines.map((l) => ({
          restaurant_id: restaurantId,
          menu_item_name: dish,
          ingredient_name: l.ingredient_name,
          quantity: l.quantity,
          unit: l.unit,
          confidence: 'user_confirmed',
          source: 'user',
        }))
      )
      if (insErr) throw new Error(insErr.message)
      setEditing(null)
      setNotice(`Recipe for ${dish} confirmed.`)
      await load()
    } catch (e) {
      setNotice((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  // Live cost of the recipe being edited.
  const editCost =
    editing != null
      ? plateCost(
          editLines
            .map((l) => ({
              ingredient_name: l.ingredient_name,
              quantity: Number(l.quantity) || 0,
              unit: l.unit,
              confidence: 'user_confirmed',
            }))
            .filter((l) => l.quantity > 0 && l.ingredient_name),
          costs
        )
      : null

  // Variance section data.
  const canonByName = new Map(canonical.map((c) => [c.name, c]))
  const varianceMain = variance.filter((v) => v.variancePct != null)
  const varianceNoRecipe = variance.filter((v) => v.variancePct == null && v.actualBase > 0)
  const impactOf = (v: VarianceRow): number | null => {
    const cost = costs.get(v.ingredient)
    const item = canonByName.get(v.ingredient)
    if (!cost || cost.costPerBase == null || !item) return null
    if (unitKind(item.default_unit) !== cost.baseKind) return null
    return (v.actualBase - v.theoreticalBase) * cost.costPerBase
  }
  const hasConfirmedRecipe = [...recipes.values()].some((lines) =>
    lines.some((l) => l.confidence === 'user_confirmed' || l.confidence === 'ai_inferred')
  )

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
      <div className="mt-6">
        <h1 className="font-serif text-[28px] text-ink">Recipes & dish costing</h1>
        <p className="mt-1 max-w-2xl text-[13.5px] text-ink-muted">
          What each dish costs you to make. The AI drafts a recipe from the ingredients you
          actually buy — you adjust and confirm it. Plate costs use your latest invoice price
          per ingredient, so they move when supplier prices move.
        </p>
      </div>

      {notice && (
        <div className="mt-4 rounded-[10px] border border-ink/10 bg-cream-surface px-4 py-3 text-[13px] text-ink">
          {notice}
        </div>
      )}

      {loading ? (
        <p className="mt-10 text-[13.5px] text-ink-muted">Loading dishes…</p>
      ) : dishes.length === 0 ? (
        <div className={`${card} mt-6`}>
          <h2 className="font-serif text-[20px] text-ink">No dish sales yet</h2>
          <p className="mt-1 text-[13px] text-ink-muted">
            Dishes appear here from your POS sales. Connect Clover in Settings and run a sync —
            your menu items will show up ranked by revenue.
          </p>
        </div>
      ) : (
        <div className={`${card} mt-6 overflow-x-auto p-0`}>
          <table className="w-full min-w-[760px] text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-ink/[0.08] text-[12px] uppercase tracking-wide text-ink-muted">
                <th className="px-5 py-3 font-medium">Dish</th>
                <th className="px-3 py-3 text-right font-medium">Sold · 30d</th>
                <th className="px-3 py-3 text-right font-medium">Menu price</th>
                <th className="px-3 py-3 text-right font-medium">Plate cost</th>
                <th className="px-3 py-3 text-right font-medium">Food cost</th>
                <th className="px-3 py-3 text-right font-medium">Margin</th>
                <th className="px-5 py-3 text-right font-medium">Recipe</th>
              </tr>
            </thead>
            <tbody>
              {dishes.map((d) => {
                const lines = recipes.get(d.menuItemName)
                const status = recipeStatus(lines)
                const cost = lines ? plateCost(lines, costs) : null
                const foodPct =
                  cost && d.avgPrice > 0 ? (cost.total / d.avgPrice) * 100 : null
                const margin = cost ? d.avgPrice - cost.total : null
                const isEditing = editing === d.menuItemName
                return [
                  <tr key={d.menuItemName} className="border-b border-ink/[0.05]">
                    <td className="px-5 py-3">
                      <span className="font-medium text-ink">{d.menuItemName}</span>
                      {status !== 'none' && (
                        <span
                          className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            status === 'confirmed'
                              ? 'bg-forest/10 text-forest'
                              : 'bg-terracotta/10 text-terracotta'
                          }`}
                        >
                          {status === 'confirmed' ? 'Confirmed' : 'AI draft'}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-ink">
                      {Math.round(d.soldQty)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-ink">
                      {money(d.avgPrice)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-ink">
                      {cost
                        ? cost.missing.length > 0
                          ? `${money(cost.total)}+`
                          : money(cost.total)
                        : '—'}
                    </td>
                    <td
                      className={`px-3 py-3 text-right font-mono ${
                        foodPct != null && foodPct > 35 ? 'text-terracotta' : 'text-ink'
                      }`}
                    >
                      {foodPct != null ? `${foodPct.toFixed(1)}%` : '—'}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-ink">
                      {margin != null ? money(margin) : '—'}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {status === 'none' ? (
                        <button
                          onClick={() => draftWithAi(d.menuItemName)}
                          disabled={drafting != null}
                          className="rounded-[8px] bg-terracotta px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-terracotta-hover disabled:opacity-50"
                        >
                          {drafting === d.menuItemName ? 'Drafting…' : 'Draft with AI'}
                        </button>
                      ) : (
                        <button
                          onClick={() => (isEditing ? setEditing(null) : openEditor(d.menuItemName))}
                          className="rounded-[8px] border border-ink/15 px-3 py-1.5 text-[12.5px] font-semibold text-ink hover:bg-ink/[0.04]"
                        >
                          {isEditing ? 'Close' : status === 'confirmed' ? 'Edit' : 'Review draft'}
                        </button>
                      )}
                    </td>
                  </tr>,
                  isEditing ? (
                    <tr key={`${d.menuItemName}-editor`} className="border-b border-ink/[0.08] bg-ink/[0.02]">
                      <td colSpan={7} className="px-5 py-4">
                        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                          <span className="text-[13px] font-semibold text-ink">
                            Recipe for {d.menuItemName} — per serving
                          </span>
                          {editCost && (
                            <span className="font-mono text-[13px] text-ink">
                              Plate cost: {money(editCost.total)}
                              {editCost.missing.length > 0 &&
                                ` (no price yet for: ${editCost.missing.join(', ')})`}
                            </span>
                          )}
                        </div>
                        <div className="space-y-2">
                          {editLines.map((row, i) => {
                            const base = toBase(Number(row.quantity) || 0, row.unit)
                            const c = costs.get(row.ingredient_name)
                            const lineCost =
                              base && c?.costPerBase != null && c.baseKind === base.kind
                                ? base.base * c.costPerBase
                                : null
                            return (
                              <div key={i} className="flex flex-wrap items-center gap-2">
                                <select
                                  value={row.ingredient_name}
                                  onChange={(e) => {
                                    const next = [...editLines]
                                    next[i] = { ...next[i], ingredient_name: e.target.value }
                                    setEditLines(next)
                                  }}
                                  className="min-w-[220px] flex-1 rounded-[8px] border border-ink/15 bg-white px-2 py-1.5 text-[13px] text-ink"
                                >
                                  {canonical.map((c) => (
                                    <option key={c.id} value={c.name}>
                                      {c.name}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  value={row.quantity}
                                  onChange={(e) => {
                                    const next = [...editLines]
                                    next[i] = { ...next[i], quantity: e.target.value }
                                    setEditLines(next)
                                  }}
                                  inputMode="decimal"
                                  className="w-20 rounded-[8px] border border-ink/15 bg-white px-2 py-1.5 font-mono text-[13px] text-ink"
                                />
                                <select
                                  value={row.unit}
                                  onChange={(e) => {
                                    const next = [...editLines]
                                    next[i] = { ...next[i], unit: e.target.value }
                                    setEditLines(next)
                                  }}
                                  className="w-20 rounded-[8px] border border-ink/15 bg-white px-2 py-1.5 text-[13px] text-ink"
                                >
                                  {RECIPE_UNITS.map((u) => (
                                    <option key={u} value={u}>
                                      {u}
                                    </option>
                                  ))}
                                </select>
                                <span className="w-20 text-right font-mono text-[12.5px] text-ink-muted">
                                  {lineCost != null ? money(lineCost) : '—'}
                                </span>
                                <button
                                  onClick={() => setEditLines(editLines.filter((_, j) => j !== i))}
                                  className="px-1 text-[15px] text-ink-muted hover:text-terracotta"
                                  aria-label="Remove ingredient"
                                >
                                  ×
                                </button>
                              </div>
                            )
                          })}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            onClick={() =>
                              setEditLines([
                                ...editLines,
                                { ingredient_name: canonical[0]?.name ?? '', quantity: '1', unit: 'oz' },
                              ])
                            }
                            className="rounded-[8px] border border-ink/15 px-3 py-1.5 text-[12.5px] font-semibold text-ink hover:bg-ink/[0.04]"
                          >
                            + Add ingredient
                          </button>
                          <button
                            onClick={() => saveRecipe(d.menuItemName)}
                            disabled={saving}
                            className="rounded-[8px] bg-forest px-3 py-1.5 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
                          >
                            {saving ? 'Saving…' : 'Save & confirm recipe'}
                          </button>
                          {status === 'none' && (
                            <button
                              onClick={() => draftWithAi(d.menuItemName)}
                              disabled={drafting != null}
                              className="rounded-[8px] border border-terracotta/40 px-3 py-1.5 text-[12.5px] font-semibold text-terracotta hover:bg-terracotta/[0.06] disabled:opacity-50"
                            >
                              {drafting === d.menuItemName ? 'Drafting…' : 'Draft with AI instead'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : null,
                ]
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && dishes.length > 0 && (
        <p className="mt-4 text-[12.5px] text-ink-muted">
          Plate costs marked “+” are missing a price for at least one ingredient (it hasn't
          appeared on a recent invoice, or the invoice line couldn't be matched to the
          ingredient catalog). Costs refresh from your newest invoices automatically.
        </p>
      )}

      {/* THEORETICAL VS ACTUAL */}
      {!loading && dishes.length > 0 && (
        <div className={`${card} mt-6`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-serif text-[22px] text-ink">Theoretical vs actual usage</h2>
              <p className="mt-1 max-w-2xl text-[13px] text-ink-muted">
                What your recipes say you <em>should</em> have used, against what you actually
                bought. A big positive variance is where money leaks — over-portioning, waste,
                or a recipe that needs recalibrating. (Purchases, not stock counts — a bulk buy
                inflates its own period.)
              </p>
            </div>
            <div className="flex gap-1">
              {(
                [
                  ['30d', 'Last 30 days'],
                  ['month', 'This month'],
                  ['lastMonth', 'Last month'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setPeriod(key)}
                  className={`rounded-[8px] px-3 py-1.5 text-[12.5px] font-semibold ${
                    period === key
                      ? 'bg-forest text-white'
                      : 'border border-ink/15 text-ink hover:bg-ink/[0.04]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {varianceError ? (
            <div className="mt-4 rounded-[10px] border border-terracotta/30 bg-terracotta/[0.08] px-4 py-3 text-[13px] text-ink">
              <span className="font-semibold text-terracotta">One setup step left:</span> run{' '}
              <span className="font-mono">sql/008_recipe_usage_variance.sql</span> in the Supabase
              SQL editor — it creates the usage_variance() function this section reads. Then
              refresh.
            </div>
          ) : varianceMain.length === 0 ? (
            <p className="mt-4 text-[13.5px] text-ink-muted">
              {hasConfirmedRecipe
                ? 'No ingredient overlaps yet between your recipes and purchases in this period.'
                : 'Nothing to compare yet — draft or confirm a few recipes above (start with your top sellers) and this fills in from your invoices.'}
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-[13.5px]">
                <thead>
                  <tr className="border-b border-ink/[0.08] text-[12px] uppercase tracking-wide text-ink-muted">
                    <th className="py-2 pr-3 font-medium">Ingredient</th>
                    <th className="px-3 py-2 text-right font-medium">Should have used</th>
                    <th className="px-3 py-2 text-right font-medium">Bought</th>
                    <th className="px-3 py-2 text-right font-medium">Variance</th>
                    <th className="py-2 pl-3 text-right font-medium">≈ $ impact</th>
                  </tr>
                </thead>
                <tbody>
                  {varianceMain.map((v) => {
                    const item = canonByName.get(v.ingredient)
                    const impact = impactOf(v)
                    return (
                      <tr key={v.ingredient} className="border-b border-ink/[0.05]">
                        <td className="py-2.5 pr-3 font-medium text-ink">{v.ingredient}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-ink">
                          {formatBaseQty(v.theoreticalBase, item?.default_unit)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-ink">
                          {formatBaseQty(v.actualBase, item?.default_unit)}
                        </td>
                        <td
                          className={`px-3 py-2.5 text-right font-mono font-semibold ${
                            (v.variancePct ?? 0) > 20 ? 'text-terracotta' : 'text-ink'
                          }`}
                        >
                          {(v.variancePct ?? 0) > 0 ? '+' : ''}
                          {(v.variancePct ?? 0).toFixed(1)}%
                        </td>
                        <td
                          className={`py-2.5 pl-3 text-right font-mono ${
                            impact != null && impact > 0 ? 'text-terracotta' : 'text-ink'
                          }`}
                        >
                          {impact != null
                            ? `${impact > 0 ? '+' : '-'}${money(Math.abs(impact))}`
                            : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!varianceError && varianceNoRecipe.length > 0 && (
            <p className="mt-4 text-[12.5px] text-ink-muted">
              <span className="font-semibold text-ink">Bought but not in any recipe yet:</span>{' '}
              {varianceNoRecipe
                .map(
                  (v) =>
                    `${v.ingredient} (${formatBaseQty(v.actualBase, canonByName.get(v.ingredient)?.default_unit)})`
                )
                .join(' · ')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
