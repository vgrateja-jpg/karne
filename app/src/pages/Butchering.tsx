import { Fragment, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { CattlePurchase, Product } from '../lib/types'
import { qty as fmtQty, today } from '../lib/format'
import { Banner, Button, Card, Field, Input, PageHeader, Select } from '../components/ui'

interface CutLine {
  key: number
  name: string
  weight_kg: number
}
interface BreakdownRow {
  id: string
  source_label: string | null
  source_weight_kg: number | null
  broke_down_on: string
}
let seq = 1

export function Butchering() {
  const [products, setProducts] = useState<Product[]>([])
  const [cattle, setCattle] = useState<CattlePurchase[]>([])
  const [recent, setRecent] = useState<BreakdownRow[]>([])
  const [outputs, setOutputs] = useState<Record<string, number>>({}) // breakdown_id -> total kg
  const [details, setDetails] = useState<Record<string, { name: string; weight_kg: number }[]>>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [sourceLabel, setSourceLabel] = useState('Whole cow')
  const [sourceWeight, setSourceWeight] = useState<number | ''>('')
  const [cattleId, setCattleId] = useState('')
  const [date, setDate] = useState(today())
  const [lines, setLines] = useState<CutLine[]>([{ key: seq++, name: '', weight_kg: 0 }])

  async function load() {
    setLoading(true)
    const [p, c, b] = await Promise.all([
      supabase.from('products').select('*').eq('is_active', true).order('sort_order').order('name'),
      supabase.from('cattle_purchases').select('*').order('purchased_on', { ascending: false }).limit(50),
      supabase.from('breakdowns').select('id, source_label, source_weight_kg, broke_down_on').order('broke_down_on', { ascending: false }).limit(30),
    ])
    if (p.data) setProducts(p.data as Product[])
    if (c.data) setCattle(c.data as CattlePurchase[])
    if (b.error) setError(b.error.message)
    else {
      const rows = (b.data ?? []) as BreakdownRow[]
      setRecent(rows)
      if (rows.length) {
        const items = await supabase
          .from('breakdown_items')
          .select('breakdown_id, weight_kg, product:products(name)')
          .in('breakdown_id', rows.map((r) => r.id))
        const m: Record<string, number> = {}
        const d: Record<string, { name: string; weight_kg: number }[]> = {}
        for (const it of (items.data ?? []) as unknown as {
          breakdown_id: string
          weight_kg: number
          product: { name: string } | null
        }[]) {
          m[it.breakdown_id] = (m[it.breakdown_id] ?? 0) + Number(it.weight_kg)
          ;(d[it.breakdown_id] ??= []).push({ name: it.product?.name ?? '—', weight_kg: Number(it.weight_kg) })
        }
        setOutputs(m)
        setDetails(d)
      }
    }
    setLoading(false)
  }
  useEffect(() => {
    load()
  }, [])

  function setLine(key: number, patch: Partial<CutLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }
  function addLine() {
    setLines((prev) => [...prev, { key: seq++, name: '', weight_kg: 0 }])
  }
  function removeLine(key: number) {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((l) => l.key !== key)))
  }
  function onPickCattle(id: string) {
    setCattleId(id)
    const c = cattle.find((x) => x.id === id)
    if (c) {
      if (c.weight_kg) setSourceWeight(c.weight_kg)
      setSourceLabel(c.tag ? `Cattle ${c.tag}` : 'Whole cow')
    }
  }

  const valid = lines.filter((l) => l.name.trim() && Number(l.weight_kg) > 0)
  const outputTotal = valid.reduce((s, l) => s + Number(l.weight_kg), 0)
  const inWeight = sourceWeight === '' ? 0 : Number(sourceWeight)
  const diff = inWeight - outputTotal
  const yieldPct = inWeight > 0 ? (outputTotal / inWeight) * 100 : 0

  async function save() {
    setError(null)
    setOk(null)
    if (valid.length === 0) {
      setError('Add at least one cut with a weight.')
      return
    }
    setBusy(true)
    // Resolve each cut name to a product, creating it (price 0, kg) if it's new
    // — so new cuts automatically appear in the price list for her to price.
    const byName = new Map(products.map((p) => [p.name.trim().toLowerCase(), p.id]))
    const items: { product_id: string; weight_kg: number }[] = []
    for (const l of valid) {
      const key = l.name.trim().toLowerCase()
      let pid = byName.get(key)
      if (!pid) {
        const ins = await supabase
          .from('products')
          .insert({ name: l.name.trim(), unit: 'kg', price: 0 })
          .select('id')
          .single()
        if (ins.error) {
          setBusy(false)
          setError(ins.error.message)
          return
        }
        pid = (ins.data as { id: string }).id
        byName.set(key, pid)
      }
      items.push({ product_id: pid, weight_kg: Number(l.weight_kg) })
    }
    const { error } = await supabase.rpc('record_breakdown', {
      p_source_label: sourceLabel.trim() || null,
      p_source_weight: inWeight || null,
      p_date: date,
      p_notes: null,
      p_cattle: cattleId || null,
      p_items: items,
    })
    setBusy(false)
    if (error) setError(error.message)
    else {
      setOk(`Saved — ${items.length} cut(s) added to stock and the price list.`)
      setLines([{ key: seq++, name: '', weight_kg: 0 }])
      setSourceWeight('')
      setCattleId('')
      load()
    }
  }

  return (
    <div>
      <PageHeader title="Butchering" />
      <p className="mb-4 text-sm text-slate-500">
        Record a whole animal coming in, list the cuts you get from it with their weights, and each
        cut is added to your stock. A new cut name is also added to your <strong>price list</strong>
        {' '}— set its price per kg under <strong>Prices</strong>.
      </p>
      {error && (
        <div className="mb-3">
          <Banner kind="error">{error}</Banner>
        </div>
      )}
      {ok && (
        <div className="mb-3">
          <Banner kind="success">{ok}</Banner>
        </div>
      )}

      <Card className="mb-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
          <Field label="What came in">
            <Input value={sourceLabel} onChange={(e) => setSourceLabel(e.target.value)} placeholder="e.g. Whole cow" />
          </Field>
          <Field label="Weight in (kg)">
            <Input
              type="number"
              step="0.001"
              min="0"
              value={sourceWeight}
              onChange={(e) => setSourceWeight(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="e.g. 200"
            />
          </Field>
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="From a cattle purchase (optional)">
            <Select value={cattleId} onChange={(e) => onPickCattle(e.target.value)}>
              <option value="">— none —</option>
              {cattle.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.tag ? `${c.tag} · ` : ''}
                  {c.weight_kg ? `${fmtQty(c.weight_kg)}kg · ` : ''}
                  {c.purchased_on}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <Card>
        <div className="mb-2 text-sm font-medium text-slate-700">Cuts (parts) and their weight</div>
        <datalist id="cut-names">
          {products.map((p) => (
            <option key={p.id} value={p.name} />
          ))}
        </datalist>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <th className="py-2 pr-3">Cut / part</th>
                <th className="py-2 pr-3 w-32">Weight (kg)</th>
                <th className="py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.key} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-3">
                    <Input
                      list="cut-names"
                      value={l.name}
                      onChange={(e) => setLine(l.key, { name: e.target.value })}
                      placeholder="type or pick a cut"
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <Input
                      type="number"
                      step="0.001"
                      min="0"
                      value={l.weight_kg || ''}
                      onChange={(e) => setLine(l.key, { weight_kg: Number(e.target.value) })}
                    />
                  </td>
                  <td className="py-2 text-right">
                    <button onClick={() => removeLine(l.key)} className="text-slate-400 hover:text-red-600" title="Remove">
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" onClick={addLine}>
            + Add cut
          </Button>
          <div className="flex flex-wrap gap-4 text-right text-sm">
            <div>
              <div className="text-xs uppercase text-slate-500">Total cuts</div>
              <div className="font-semibold tabular-nums">{fmtQty(outputTotal)} kg</div>
            </div>
            {inWeight > 0 && (
              <>
                <div>
                  <div className="text-xs uppercase text-slate-500">Yield</div>
                  <div className="font-semibold tabular-nums">{yieldPct.toFixed(1)}%</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-slate-500">Bone / trim / loss</div>
                  <div className={`font-semibold tabular-nums ${diff < 0 ? 'text-rose-600' : 'text-slate-700'}`}>
                    {fmtQty(diff)} kg
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="mt-4">
          <Button onClick={save} disabled={busy || valid.length === 0}>
            {busy ? 'Saving…' : 'Save & add to stock'}
          </Button>
        </div>
      </Card>

      <Card className="mt-4">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-sm font-medium text-slate-700">Recent butchering</span>
          <span className="text-xs text-slate-400">tap a row to see the cuts</span>
        </div>
        {loading ? (
          <div className="py-6 text-center text-slate-400">Loading…</div>
        ) : recent.length === 0 ? (
          <div className="py-6 text-center text-sm text-slate-400">Nothing recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">What</th>
                  <th className="py-2 pr-3 text-right">Weight in</th>
                  <th className="py-2 pr-3 text-right">Cuts out</th>
                  <th className="py-2 pr-3 text-right">Yield</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => {
                  const out = outputs[r.id] ?? 0
                  const inW = Number(r.source_weight_kg ?? 0)
                  const isOpen = expanded === r.id
                  const cuts = details[r.id] ?? []
                  return (
                    <Fragment key={r.id}>
                      <tr
                        className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50"
                        onClick={() => setExpanded(isOpen ? null : r.id)}
                      >
                        <td className="py-2 pr-3 tabular-nums text-slate-500">
                          <span className="mr-1 inline-block text-slate-400">{isOpen ? '▾' : '▸'}</span>
                          {r.broke_down_on}
                        </td>
                        <td className="py-2 pr-3 font-medium text-slate-800">{r.source_label ?? '—'}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{inW ? `${fmtQty(inW)} kg` : '—'}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{fmtQty(out)} kg</td>
                        <td className="py-2 pr-3 text-right tabular-nums text-slate-500">
                          {inW > 0 ? `${((out / inW) * 100).toFixed(0)}%` : '—'}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="border-b border-slate-100">
                          <td colSpan={5} className="bg-slate-50 px-3 py-2">
                            <div className="mb-1 text-xs font-medium uppercase text-slate-400">Cuts from this animal</div>
                            {cuts.length === 0 ? (
                              <span className="text-xs text-slate-400">No cut details.</span>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {cuts.map((c, i) => (
                                  <span
                                    key={i}
                                    className="rounded-full bg-white px-2.5 py-1 text-xs text-slate-700 ring-1 ring-slate-200"
                                  >
                                    {c.name} · <span className="font-medium tabular-nums">{fmtQty(c.weight_kg)} kg</span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
