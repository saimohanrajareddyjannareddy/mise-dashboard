/**
 * bulk-canonicalize.ts
 *
 * One-shot bulk fix for invoice line-item names. You can't review hundreds of
 * lines by hand — so this does it for all of them at once:
 *
 *   1. You export every distinct raw item name from Supabase (query below)
 *      into scripts/raw-items.txt (one per line).
 *   2. Run:  npm run canon
 *   3. It expands RD abbreviations + parses units with a deterministic
 *      dictionary (no AI key needed, same result every run) and writes
 *      sql/009_bulk_aliases.sql — canonical_items + ingredient_aliases
 *      rows with confidence='ai_suggested'.
 *   4. Items with unknown tokens go to scripts/review-items.txt — that's the
 *      ONLY list you ever need to eyeball. Add the new tokens to TOKEN_MAP
 *      below and re-run; the mapping caches forever after first confirm.
 *   5. Run the generated SQL in the Supabase SQL editor (after 007/008).
 *      The 008 backfill links existing invoice_lines automatically.
 *
 * Export query (Supabase SQL editor -> copy results into raw-items.txt):
 *   select distinct item_name from public.invoice_lines
 *   where canonical_item_id is null order by 1;
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const IN = join(root, 'scripts', 'raw-items.txt')
const OUT_SQL = join(root, 'sql', '009_bulk_aliases.sql')
const OUT_REVIEW = join(root, 'scripts', 'review-items.txt')

// ── RD abbreviation dictionary ─────────────────────────────────────
// value=null → drop token (dept codes, pack codes, brand noise).
// Add new tokens here as review-items.txt surfaces them.
const TOKEN_MAP: Record<string, string | null> = {
  PROD: null, CQ: null, PFR: null, JF: null, ARGO: null, BK: null,
  SKY3858XX: null, SYS: null, GPA: null,
  // proteins
  CHIX: 'chicken', THGH: 'thigh', BRST: 'breast', BNLS: 'boneless',
  WHL: 'whole', HAL: 'halal', SHR: 'shrimp', 'R-PDTFF': 'raw peeled deveined',
  TNDR: 'tender', WING: 'wing', BEEF: 'beef', GND: 'ground',
  // dairy
  CHS: 'cheese', LF: 'low-fat', TRAD: 'traditional', MILK: 'milk',
  HOMO: 'whole', MLK: 'milk', CREAM: 'cream', SOUR: 'sour',
  AERO: 'aerated', WHIP: 'whipped', PANEER: 'paneer', YOGURT: 'yogurt',
  BUTTER: 'butter', CRTEDPST: 'crate deposit',
  // produce
  GARLC: 'garlic', ASN: 'asian', CILANTRO: 'cilantro', ONION: 'onion',
  YLW: 'yellow', JMB: 'jumbo', GRN: 'green', PEPP: 'pepper',
  PEPPER: 'pepper', SERRAN: 'serrano', MANGO: 'mango', FZ: 'frozen',
  BROCCOLI: 'broccoli', CROWN: 'crown', BEANS: 'beans', CUT: 'cut',
  MUSH: 'mushroom', LETTUCE: 'lettuce', TOM: 'tomato',
  // dry goods
  OIL: 'oil', SOY: 'soybean', SALAD: 'salad', CLEAR: 'clear',
  FRY: 'frying', STARCH: 'starch', CORN: 'corn', SUGAR: 'sugar',
  DOMINO: 'domino', PUREE: 'puree', TOMATO: 'tomato', BEAN: 'bean',
  GARBANZO: 'garbanzo', KETCHUP: 'ketchup', JUG: 'jug', SALT: 'salt',
  BULK: 'bulk', MORTON: 'morton', FLOUR: 'flour', ARDENT: 'ardent',
  BRD: 'bread', TX: 'texas', TOAST: 'toast', PESTO: 'pesto',
  BASIL: 'basil', BATTER: 'batter', TEMPURA: 'tempura', KIK: 'kikkoman',
  'H&R': 'h&r', RICE: 'rice', BASMATI: 'basmati', SPICE: 'spice',
  // beverages
  BIB: 'bag-in-box', COKE: 'coca-cola', DIET: 'diet', CLASSIC: 'classic',
  PURE: 'pure', LIFE: 'life water', PK: 'pack', PEPSI: 'pepsi', JUICE: 'juice',
  SODA: 'soda', WATER: 'water',
  // packaging / cleaning
  FOIL: 'foil', ROLL: 'roll', HD: 'heavy-duty', LINER: 'liner',
  CONT: 'container', HNG: 'hinged', FLAT: 'flat',
  GLOVE: 'gloves', GLOVES: 'gloves', NITRL: 'nitrile', BLK: 'black',
  L: 'large', SOAP: 'soap', SANITIZER: 'sanitizer',
  // credits
  RETURN: 'return', DEPOSIT: 'deposit', CREDIT: 'credit',
  MEAT: 'meat', RED: 'red', GREEN: 'green', GRAPE: 'grape',
  EGGS: 'eggs', EGG: 'egg', LARGE: 'large', MED: 'medium',
  BAG: null, // packaging noise once the weight unit is captured ("5 LB bag")
}

// Adjectives that read better at the front: "chicken halal thigh" -> "halal chicken thigh".
const FRONT_WORDS = ['halal', 'frozen', 'whole', 'low-fat', 'boneless', 'raw']
// Container words that read better at the end: "bag-in-box coca-cola" -> "coca-cola bag-in-box".
const BACK_WORDS = ['bag-in-box', 'pack']

const CATEGORY_HINTS: [RegExp, string][] = [
  [/return|deposit|credit/, 'Credits'],
  [/pesto/, 'Dry Goods'],
  [/paneer|milk|cheese|cream|yogurt|butter|whip/, 'Dairy'],
  [/chicken|beef|pork|shrimp|fish|thigh|breast|wing|tender|egg/, 'Proteins'],
  [/coca|pepsi|juice|soda|water|cola/, 'Beverages'],
  [/foil|container|liner|hinged|packaging/, 'Packaging'],
  [/glove|soap|sanitizer|detergent|clean/, 'Cleaning'],
  [/onion|pepper|garlic|cilantro|mango|broccoli|beans|mushroom|lettuce|frozen/, 'Produce'],
]

// When no unit token was found in the name, guess from category.
// (Proteins are weighed, produce/dairy arrive by the case, etc.)
const CATEGORY_UNIT: Record<string, string> = {
  Proteins: 'LB', Produce: 'CT', Dairy: 'CT', Beverages: 'CT',
  Packaging: 'CT', Cleaning: 'CT', Credits: 'EA', 'Dry Goods': 'EA',
}

function guessCategory(name: string, deptFallback: string): string {
  for (const [re, cat] of CATEGORY_HINTS) if (re.test(name)) return cat
  return deptFallback
}

function sql(s: string): string {
  return `'${s.replace(/'/g, "''")}'`
}

type Mapped = {
  raw: string
  name: string
  category: string
  unit: string
  unknown: string[]
}

function canonicalize(raw: string): Mapped {
  // Strip leading junk like '*' in '*GLOVE ...'
  let text = raw.replace(/^[^A-Z0-9#]+/i, '').trim()

  // Pull pack-size / unit tokens out of the name first.
  // If both a weight/volume unit and a count unit appear ("12Z 100CT"),
  // the COUNT is the purchase unit (100CT) and the other is the item size.
  const COUNT_UNITS = new Set(['CT', 'case', 'EA', 'DZ'])
  const foundUnits: string[] = []
  const dropSpans: [number, number][] = []
  const resolveUnit = (tok: string): string => {
    const t = tok.toUpperCase()
    if (/#10/.test(t)) return 'CT' // #10 can
    const suf = t.replace(/^[\d.\s]+/, '')
    if (/^LBS?$/.test(suf)) return 'LB'
    if (/^GAL$/.test(suf)) return 'GAL'
    if (/^O?Z$/.test(suf)) return 'OZ' // RD prints ounces as Z: 16Z, 114Z
    if (/^DZ$/.test(suf)) return 'DZ'
    if (/^CT$/.test(suf)) return 'CT'
    if (/^PK$/.test(suf)) return 'CT'
    if (/^EA$/.test(suf)) return 'EA'
    if (/^CASE$/.test(suf)) return 'case'
    if (/^L$/.test(suf)) return 'L'
    return ''
  }
  // Numbered units: 40LB, 2.5GAL, 12Z, 100CT, 0.5L, 15DZ, #10.
  const unitRe = /\b\d+(?:\.\d+)?\s*(?:LBS|LB|GAL|OZ|CT|PK|EA|DZ|CASE)\b|\b\d+(?:\.\d+)?\s*Z\b|\b\d+(?:\.\d+)?\s*L\b|#10/g
  let m: RegExpExecArray | null
  while ((m = unitRe.exec(text)) !== null) {
    const u = resolveUnit(m[0])
    if (u) foundUnits.push(u)
    dropSpans.push([m.index, m.index + m[0].length])
  }
  // Bare unit words with no number: GAL, LB, CASE, DZ ("MILK HOMO GAL").
  const bareRe = /\b(GAL|LBS|LB|OZ|CT|EA|DZ|CASE)\b/g
  while ((m = bareRe.exec(text)) !== null) {
    const u = resolveUnit(m[0])
    if (u) foundUnits.push(u)
    dropSpans.push([m.index, m.index + m[0].length])
  }
  // Drop pack-config tokens (4/5, 4/24CT, 18X500). Sizes like 16/20 stay.
  const packRe = /\b\d+\s*X\s*\d+[A-Z]*\b|\b\d+\/\d+(?:CT)?\b/g
  while ((m = packRe.exec(text)) !== null) {
    if (!m[0].includes('16/20')) dropSpans.push([m.index, m.index + m[0].length])
  }
  dropSpans.sort((a, b) => b[0] - a[0])
  for (const [s, e] of dropSpans) text = text.slice(0, s) + ' ' + text.slice(e)

  const unknown: string[] = []
  const words: string[] = []
  for (const tok of text.split(/\s+/).filter(Boolean)) {
    const key = tok.toUpperCase()
    if (key in TOKEN_MAP) {
      const v = TOKEN_MAP[key]
      if (v) words.push(v)
    } else if (/^\d/.test(tok) || tok.includes('/')) {
      words.push(tok.toLowerCase()) // sizes like 16/20 survive
    } else {
      unknown.push(tok)
      words.push(tok.toLowerCase())
    }
  }
  // Nicer word order + collapse duplicates ("foil roll roll" -> "foil roll").
  const front = FRONT_WORDS.filter(w => words.includes(w))
  const back = BACK_WORDS.filter(w => words.includes(w))
  const mid = words.filter(w => !front.includes(w) && !back.includes(w))
  const ordered = [...front, ...mid, ...back].filter((w, i, a) => w !== a[i - 1])
  // Head nouns read better last: "oil soybean salad" -> "soybean salad oil".
  for (const noun of ['oil']) {
    const i = ordered.indexOf(noun)
    if (i > -1 && i < ordered.length - 1) { ordered.splice(i, 1); ordered.push(noun) }
  }
  const name = ordered.join(' ').replace(/\s+/g, ' ').trim() || raw.toLowerCase()
  // PROD-prefixed lines come from the produce department — use that when
  // no keyword matched (e.g. "PROD TOMATO GRAPE 12CT" -> Produce).
  const category = guessCategory(name, /^\s*PROD\b/i.test(raw) ? 'Produce' : 'Dry Goods')
  const countUnits = foundUnits.filter(u => COUNT_UNITS.has(u))
  const unit = countUnits.length > 0
    ? countUnits[countUnits.length - 1]
    : foundUnits.length > 0 ? foundUnits[0] : (CATEGORY_UNIT[category] || 'EA')
  return { raw, name, category, unit, unknown }
}

function main() {
  if (!existsSync(IN)) {
    console.error(`Missing ${IN}\nExport distinct item names into it first:\n  select distinct item_name from public.invoice_lines where canonical_item_id is null order by 1;`)
    process.exit(1)
  }
  const raws = [...new Set(
    readFileSync(IN, 'utf8').split('\n').map(s => s.trim()).filter(Boolean)
  )]

  const mapped: Mapped[] = []
  const seenCanon = new Set<string>()
  for (const raw of raws) {
    const r = canonicalize(raw)
    if (seenCanon.has(r.name + '|' + raw.toUpperCase())) continue
    seenCanon.add(r.name + '|' + raw.toUpperCase())
    mapped.push(r)
  }

  const review = mapped.filter(x => x.unknown.length > 0)

  const itemVals = mapped.map(x =>
    `    (${sql(x.name)}, ${sql(x.category)}, ${sql(x.unit)}, ${sql(x.raw)})`).join(',\n')

  const out = `-- 009_bulk_aliases.sql
-- AUTO-GENERATED by scripts/bulk-canonicalize.ts — do not hand-edit.
-- ${mapped.length} raw names -> canonical items + aliases (confidence='ai_suggested').
-- ${review.length} have unknown tokens; check scripts/review-items.txt, extend
-- TOKEN_MAP in the script, and re-run to improve them.
--
-- Apply in the Supabase SQL editor AFTER 007/008. Idempotent (re-runnable).
-- The 008 backfill links invoice_lines via resolve_canonical_item().

with items(name, category, default_unit, raw) as (
  values
${itemVals}
)
insert into public.canonical_items (name, category, default_unit)
select name, category, default_unit from items
on conflict (name) do nothing;

with items(name, raw) as (
  values
${mapped.map(x => `    (${sql(x.name)}, ${sql(x.raw)})`).join(',\n')}
)
insert into public.ingredient_aliases (raw_text, canonical_item_id, confidence)
select i.raw, c.id, 'ai_suggested'
from items i
join public.canonical_items c on c.name = i.name
on conflict do nothing;
`
  writeFileSync(OUT_SQL, out)

  const reviewTxt = review.map(x => `${x.raw}\n  -> ${x.name} [${x.category}/${x.unit}]  unknown: ${x.unknown.join(', ')}`).join('\n')
  writeFileSync(OUT_REVIEW, reviewTxt || '(none — everything mapped cleanly)')

  console.log(`✓ ${raws.length} distinct raw names`)
  console.log(`✓ wrote ${OUT_SQL} (${mapped.length} aliases, confidence='ai_suggested')`)
  console.log(review.length
    ? `⚠ ${review.length} need a look in scripts/review-items.txt (unknown tokens) — add them to TOKEN_MAP and re-run`
    : `✓ no unknown tokens — nothing to review`)
}

main()
