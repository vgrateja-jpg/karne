import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Product, ProductStock } from '../lib/types'
import { money, qty as fmtQty, today } from '../lib/format'
import { Banner, Button, Card, Field, Input, PageHeader, Select } from '../components/ui'
import { NumberInput } from '../components/NumberInput'

export function Inventory() {
  const [stock, setStock] = useState<ProductStock[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [moves, setMoves] = useState<
    {
      id: string
      moved_on: string
      type: string
      quantity: number
      reference: string | null
      order_id: string | null
      breakdown_id: string | null
      purchase_id: string | null
      product: { name: string } | null
    }[]
  >([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editMove, setEditMove] = useState<{ id: string; quantity: number | '' } | null>(null)
  const [adjust, setAdjust] = useState<{ product_id: string; quantity: number | '' } | null>(null)

  // quick "record stock in" form
  const [productId, setProductId] = useState('')
  const [quantity, setQuantity] = useState<number | ''>('')
  const [movedOn, setMovedOn] = useState(today())
  const [unitCost, setUnitCost] = useState<number | ''>('')
  const [busy, setBusy] = useState(false)
  const [ok, setOk] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const [s, p, mv] = await Promise.all([
      supabase.from('v_product_stock').select('*').order('name'),
      supabase.from('products').select('*').eq('is_active', true).order('sort_order').order('name'),
      supabase
        .from('inventory_movements')
        .select('id,moved_on,type,quantity,reference,order_id,breakdown_id,purchase_id,product:products(name)')
        .order('moved_on', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50),
    ])
    if (s.error) setError(s.error.message)
    else setStock((s.data ?? []) as ProductStock[])
    if (p.data) setProducts(p.data as Product[])
    if (mv.data) setMoves(mv.data as unknown as typeof moves)
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

  async function removeMove(id: string) {
    if (!window.confirm('Delete this stock movement?')) return
    const { error } = await supabase.from('inventory_movements').delete().eq('id', id)
    if (error) setError(error.message)
    else load()
  }
  async function saveMove() {
    if (!editMove) return
    const { error } = await supabase
      .from('inventory_movements')
      .update({ quantity: Number(editMove.quantity) || 0 })
      .eq('id', editMove.id)
    if (error) setError(error.message)
    else {
      setEditMove(null)
      load()
    }
  }

  // Correct a physical count: record an adjustment so on-hand becomes the typed number.
  async function saveAdjust() {
    if (!adjust) return
    const current = Number(stock.find((s) => s.product_id === adjust.product_id)?.on_hand ?? 0)
    const target = Number(adjust.quantity) || 0
    const diff = target - current
    if (Math.abs(diff) > 0.0001) {
      const { error } = await supabase.from('inventory_movements').insert({
        product_id: adjust.product_id,
        moved_on: today(),
        type: 'adjustment',
        quantity: diff,
        reference: 'count adjustment',
      })
      if (error) {
        setError(error.message)
        return
      }
    }
    setAdjust(null)
    load()
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
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {stock.map((s) => (
                  <tr key={s.product_id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-3 font-medium text-slate-800">{s.name}</td>
                    <td className="py-2 pr-3 text-right">
                      {adjust?.product_id === s.product_id ? (
                        <NumberInput
                          value={adjust.quantity}
                          onChange={(v) => setAdjust({ ...adjust, quantity: v })}
                          className="w-24 text-right"
                        />
                      ) : (
                        <span className={`tabular-nums ${s.on_hand < 0 ? 'text-rose-600' : 'text-slate-700'}`}>
                          {fmtQty(s.on_hand)}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-slate-500">{s.unit}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-600">
                      {money(s.on_hand * (priceById[s.product_id] ?? 0))}
                    </td>
                    <td className="py-2 text-right">
                      {adjust?.product_id === s.product_id ? (
                        <div className="flex justify-end gap-2">
                          <button onClick={saveAdjust} className="text-emerald-600 hover:text-emerald-700" title="Save count">
                            ✓
                          </button>
                          <button onClick={() => setAdjust(null)} className="text-slate-400 hover:text-red-600" title="Cancel">
                            ✕
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setAdjust({ product_id: s.product_id, quantity: s.on_hand })}
                          className="text-xs text-slate-400 hover:text-rose-600"
                          title="Set the counted quantity"
                        >
                          Set count
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="mt-4">
        <div className="mb-2 text-sm font-medium text-slate-700">Recent stock movements</div>
        {moves.length === 0 ? (
          <div className="py-3 text-center text-sm text-slate-400">No movements yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Product</th>
                  <th className="py-2 pr-3">From</th>
                  <th className="py-2 pr-3 text-right">Qty</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {moves.map((mv) => {
                  const linked = mv.order_id ? 'sale' : mv.breakdown_id ? 'butchering' : mv.purchase_id ? 'purchase' : null
                  return (
                    <tr key={mv.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-2 pr-3 tabular-nums text-slate-500">{mv.moved_on}</td>
                      <td className="py-2 pr-3 text-slate-800">{mv.product?.name ?? '—'}</td>
                      <td className="py-2 pr-3 text-slate-500">{linked ?? mv.reference ?? mv.type}</td>
                      <td className="py-2 pr-3 text-right">
                        {editMove?.id === mv.id ? (
                          <NumberInput
                            value={editMove.quantity}
                            onChange={(v) => setEditMove({ ...editMove, quantity: v })}
                            className="w-24 text-right"
                          />
                        ) : (
                          <span className={`tabular-nums ${mv.quantity < 0 ? 'text-rose-600' : 'text-slate-700'}`}>
                            {fmtQty(mv.quantity)}
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        {linked ? (
                          <span className="text-xs text-slate-300" title={`Fix from the ${linked} instead`}>—</span>
                        ) : editMove?.id === mv.id ? (
                          <div className="flex justify-end gap-2">
                            <button onClick={saveMove} className="text-emerald-600 hover:text-emerald-700" title="Save">
                              ✓
                            </button>
                            <button onClick={() => setEditMove(null)} className="text-slate-400 hover:text-red-600" title="Cancel">
                              ✕
                            </button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => setEditMove({ id: mv.id, quantity: mv.quantity })}
                              className="text-slate-400 hover:text-rose-600"
                              title="Edit quantity"
                            >
                              ✎
                            </button>
                            <button onClick={() => removeMove(mv.id)} className="text-slate-400 hover:text-red-600" title="Delete">
                              ✕
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-[11px] text-slate-400">
          Movements from a sale, butchering, or purchase are removed by deleting that order / butchering / purchase.
        </p>
      </Card>
    </div>
  )
}
