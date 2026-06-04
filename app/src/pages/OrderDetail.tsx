import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Branch, Customer, OrderStatus, Product } from '../lib/types'
import { money } from '../lib/format'
import { Banner, Button, Card, Field, Input, PageHeader, Select } from '../components/ui'

interface Line {
  key: number
  product_id: string
  quantity: number
  unit_price: number
}
let keySeq = 1

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  confirmed: 'Confirmed',
  delivered: 'Delivered',
  paid: 'Paid',
  partly_paid: 'Partly paid',
  void: 'Void',
}

export function OrderDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [products, setProducts] = useState<Product[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [customerId, setCustomerId] = useState('')
  const [branchId, setBranchId] = useState('')
  const [side, setSide] = useState<'store' | 'delivery'>('store')
  const [orderDate, setOrderDate] = useState('')
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState<OrderStatus>('confirmed')
  const [lines, setLines] = useState<Line[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  async function load() {
    if (!id) return
    setLoading(true)
    const [o, it, p, c, b] = await Promise.all([
      supabase.from('orders').select('*').eq('id', id).single(),
      supabase.from('order_items').select('product_id, quantity, unit_price').eq('order_id', id),
      supabase.from('products').select('*').eq('is_active', true).order('sort_order').order('name'),
      supabase.from('customers').select('*').eq('is_active', true).order('name'),
      supabase.from('branches').select('*').eq('is_active', true).order('name'),
    ])
    if (o.error) setError(o.error.message)
    else {
      setCustomerId(o.data.customer_id ?? '')
      setBranchId(o.data.branch_id ?? '')
      setSide((o.data.side as 'store' | 'delivery') ?? 'store')
      setOrderDate(o.data.order_date)
      setNotes(o.data.notes ?? '')
      setStatus(o.data.status)
    }
    if (b.data) setBranches(b.data as Branch[])
    if (it.data)
      setLines(
        (it.data as { product_id: string; quantity: number; unit_price: number }[]).map((r) => ({
          key: keySeq++,
          product_id: r.product_id,
          quantity: Number(r.quantity),
          unit_price: Number(r.unit_price),
        })),
      )
    if (p.data) setProducts(p.data as Product[])
    if (c.data) setCustomers(c.data as Customer[])
    setLoading(false)
  }
  useEffect(() => {
    load()
  }, [id])

  const productById = useMemo(() => {
    const m: Record<string, Product> = {}
    for (const p of products) m[p.id] = p
    return m
  }, [products])

  function setLine(key: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }
  function pickProduct(key: number, pid: string) {
    setLine(key, { product_id: pid, unit_price: productById[pid]?.price ?? 0 })
  }
  function addLine() {
    setLines((prev) => [...prev, { key: keySeq++, product_id: '', quantity: 0, unit_price: 0 }])
  }
  function removeLine(key: number) {
    setLines((prev) => prev.filter((l) => l.key !== key))
  }

  const valid = lines.filter((l) => l.product_id && Number(l.quantity) > 0)
  const total = valid.reduce((s, l) => s + l.quantity * l.unit_price, 0)
  const isVoid = status === 'void'

  async function save() {
    setError(null)
    setOk(null)
    setBusy(true)
    const { error } = await supabase.rpc('update_order', {
      p_order: id,
      p_customer: customerId || null,
      p_order_date: orderDate,
      p_notes: notes.trim() || null,
      p_items: valid.map((l) => ({ product_id: l.product_id, quantity: l.quantity, unit_price: l.unit_price })),
    })
    if (!error) await supabase.from('orders').update({ branch_id: branchId || null, side }).eq('id', id)
    setBusy(false)
    if (error) setError(error.message)
    else {
      setOk('Saved.')
      load()
    }
  }

  async function changeStatus(s: OrderStatus) {
    setError(null)
    setBusy(true)
    const { error } = await supabase.from('orders').update({ status: s }).eq('id', id)
    setBusy(false)
    if (error) setError(error.message)
    else setStatus(s)
  }

  async function voidOrder() {
    if (!window.confirm('Void this order? Its items go back into stock and it stops counting as a sale.')) return
    setError(null)
    setBusy(true)
    const { error } = await supabase.rpc('void_order', { p_order: id })
    setBusy(false)
    if (error) setError(error.message)
    else {
      setStatus('void')
      load()
    }
  }

  async function deleteOrder() {
    if (!window.confirm('Delete this order permanently? Its items return to stock. This cannot be undone.')) return
    setError(null)
    setBusy(true)
    const { error } = await supabase.rpc('delete_order', { p_order: id })
    setBusy(false)
    if (error) setError(error.message)
    else navigate('/orders')
  }

  if (loading) return <div className="py-10 text-center text-slate-400">Loading…</div>

  return (
    <div>
      <PageHeader
        title="Order"
        action={
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                isVoid ? 'bg-slate-200 text-slate-500' : status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-sky-100 text-sky-700'
              }`}
            >
              {STATUS_LABEL[status] ?? status}
            </span>
            <Link to="/orders">
              <Button variant="ghost">← Orders</Button>
            </Link>
          </div>
        }
      />
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
      {isVoid && (
        <div className="mb-3">
          <Banner kind="info">This order is void.</Banner>
        </div>
      )}

      <Card className="mb-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Customer">
            <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)} disabled={isVoid}>
              <option value="">— Cash / walk-in —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date">
            <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} disabled={isVoid} />
          </Field>
          <Field label="Sale type">
            <Select value={side} onChange={(e) => setSide(e.target.value as 'store' | 'delivery')} disabled={isVoid}>
              <option value="store">Store (walk-in)</option>
              <option value="delivery">Delivery</option>
            </Select>
          </Field>
          <Field label="Notes">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} disabled={isVoid} />
          </Field>
          {branches.length > 0 && (
            <Field label="Branch">
              <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} disabled={isVoid}>
                <option value="">— (none) —</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
      </Card>

      <Card>
        <div className="mb-2 text-sm font-medium text-slate-700">
          Items <span className="font-normal text-slate-400">— adjust quantities to actual delivered weight</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <th className="py-2 pr-3">Product</th>
                <th className="py-2 pr-3 w-28">Qty</th>
                <th className="py-2 pr-3 w-32">Unit price</th>
                <th className="py-2 pr-3 w-32 text-right">Line total</th>
                <th className="py-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const p = productById[l.product_id]
                return (
                  <tr key={l.key} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-3">
                      <Select value={l.product_id} onChange={(e) => pickProduct(l.key, e.target.value)} disabled={isVoid}>
                        <option value="">— pick product —</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          step="0.001"
                          min="0"
                          value={l.quantity || ''}
                          onChange={(e) => setLine(l.key, { quantity: Number(e.target.value) })}
                          disabled={isVoid}
                        />
                        <span className="text-xs text-slate-400">{p?.unit ?? ''}</span>
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={l.unit_price || ''}
                        onChange={(e) => setLine(l.key, { unit_price: Number(e.target.value) })}
                        disabled={isVoid}
                      />
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{money(l.quantity * l.unit_price)}</td>
                    <td className="py-2 text-right">
                      {!isVoid && (
                        <button onClick={() => removeLine(l.key)} className="text-slate-400 hover:text-red-600" title="Remove">
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          {!isVoid && (
            <Button variant="ghost" onClick={addLine}>
              + Add line
            </Button>
          )}
          <div className="text-right">
            <div className="text-xs uppercase text-slate-500">Order total</div>
            <div className="text-2xl font-semibold tabular-nums text-slate-900">{money(total)}</div>
          </div>
        </div>

        {!isVoid && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={save} disabled={busy}>
              {busy ? 'Saving…' : 'Save changes'}
            </Button>
            {status !== 'delivered' && (
              <Button variant="ghost" onClick={() => changeStatus('delivered')} disabled={busy}>
                Mark delivered
              </Button>
            )}
            {status !== 'paid' && (
              <Button variant="ghost" onClick={() => changeStatus('paid')} disabled={busy}>
                Mark paid
              </Button>
            )}
            <Link to={`/orders/${id}/receipt`}>
              <Button variant="ghost">🖨 Receipt</Button>
            </Link>
            <Button variant="danger" onClick={voidOrder} disabled={busy}>
              Void
            </Button>
          </div>
        )}
        <div className="mt-4 border-t border-slate-100 pt-3">
          <Button variant="danger" onClick={deleteOrder} disabled={busy}>
            Delete order permanently
          </Button>
        </div>
      </Card>
    </div>
  )
}
