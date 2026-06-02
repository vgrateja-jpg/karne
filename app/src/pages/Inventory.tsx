import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Product, ProductStock } from '../lib/types'
import { money, qty as fmtQty, today } from '../lib/format'
import { Banner, Button, Card, Field, Input, PageHeader, Select } from '../components/ui'
import { NumberInput } from '../components/NumberInput'

export function Inventory() {
  const [stock, setStock] = useState<ProductStock[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // quick "record stock in" form
  const [productId, setProductId] = useState('')
  const [quantity, setQuantity] = useState<number | ''>('')
  const [movedOn, setMovedOn] = useState(today())
  const [unitCost, setUnitCost] = useState<number | ''>('')
  const [busy, setBusy] = useState(false)
  const [ok, setOk] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const [s, p] = await Promise.all([
      supabase.from('v_product_stock').select('*').order('name'),
      supabase.from('products').select('*').eq('is_active', true).order('sort_order').order('name'),
    ])
    if (s.error) setError(s.error.message)
    else setStock((s.data ?? []) as ProductStock[])
    if (p.data) setProducts(p.data as Product[])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function recordIn() {
    setError(null)
    setOk(null)
    if (!productId || Number(quantity) <= 0) {
      setError('Pick a product and a quantity greater than 0.')
      return
    }
    setBusy(true)
    const { error } = await supabase.from('inventory_movements').insert({
      product_id: productId,
      moved_on: movedOn,
      type: 'purchase_in',
      quantity: Number(quantity),
      unit_cost: unitCost === '' ? null : Number(unitCost),
      reference: 'manual stock-in',
    })
    setBusy(false)
    if (error) setError(error.message)
    else {
      setOk('Stock added.')
      setQuantity('')
      setUnitCost('')
      load()
    }
  }

  const priceById: Record<string, number> = Object.fromEntries(products.map((p) => [p.id, p.price]))
  const totalValue = stock.reduce((s, r) => s + r.on_hand * (priceById[r.product_id] ?? 0), 0)

  return (
    <div>
      <PageHeader title="Stock" />
      {error && (
        <div className="mb-3">
          <Banner kind="error">{error}</Banner>
        </div>
      )}

      <Card className="mb-4">
        <div className="mb-2 text-sm font-medium text-slate-700">Record stock in (delivery / purchase)</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
          <Field label="Product">
            <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">— pick product —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Quantity in">
            <NumberInput value={quantity} onChange={setQuantity} />
          </Field>
          <Field label="Date">
            <Input type="date" value={movedOn} onChange={(e) => setMovedOn(e.target.value)} />
          </Field>
          <Field label="Unit cost (optional)">
            <NumberInput value={unitCost} onChange={setUnitCost} />
          </Field>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button onClick={recordIn} disabled={busy}>
            {busy ? 'Saving…' : 'Add stock'}
          </Button>
          {ok && <span className="text-sm text-emerald-600">{ok}</span>}
        </div>
      </Card>

      <Card>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">Stock on hand</span>
          <span className="text-sm text-slate-500">
            Inventory value:{' '}
            <span className="font-semibold tabular-nums text-slate-800">{money(totalValue)}</span>
          </span>
        </div>
        {loading ? (
          <div className="py-8 text-center text-slate-400">Loading…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="py-2 pr-3">Product</th>
                  <th className="py-2 pr-3 text-right">On hand</th>
                  <th className="py-2 pr-3">Unit</th>
                  <th className="py-2 pr-3 text-right">Value (at price)</th>
                </tr>
              </thead>
              <tbody>
                {stock.map((s) => (
                  <tr key={s.product_id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-3 font-medium text-slate-800">{s.name}</td>
                    <td className={`py-2 pr-3 text-right tabular-nums ${s.on_hand < 0 ? 'text-rose-600' : 'text-slate-700'}`}>
                      {fmtQty(s.on_hand)}
                    </td>
                    <td className="py-2 pr-3 text-slate-500">{s.unit}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-600">
                      {money(s.on_hand * (priceById[s.product_id] ?? 0))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
