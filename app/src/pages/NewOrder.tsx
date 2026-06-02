import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Branch, Customer, OrderChannel, Product } from '../lib/types'
import { money, qty as fmtQty, today } from '../lib/format'
import { Banner, Button, Card, Field, Input, PageHeader, Select } from '../components/ui'
import { NumberInput } from '../components/NumberInput'

interface Line {
  key: number
  product_id: string
  quantity: number
  unit_price: number
}

let keySeq = 1

export function NewOrder() {
  const navigate = useNavigate()
  const [products, setProducts] = useState<Product[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [balances, setBalances] = useState<Record<string, number>>({})
  const [customerId, setCustomerId] = useState('')
  const [branchId, setBranchId] = useState('')
  const [orderDate, setOrderDate] = useState(today())
  const [channel, setChannel] = useState<OrderChannel>('manual')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<Line[]>([{ key: keySeq++, product_id: '', quantity: 0, unit_price: 0 }])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('products').select('*').eq('is_active', true).order('sort_order').order('name'),
      supabase.from('customers').select('*').eq('is_active', true).order('name'),
      supabase.from('branches').select('*').eq('is_active', true).order('name'),
      supabase.from('v_customer_balance').select('customer_id,balance'),
    ]).then(([p, c, b, bal]) => {
      if (p.data) setProducts(p.data as Product[])
      if (c.data) setCustomers(c.data as Customer[])
      if (b.data) setBranches(b.data as Branch[])
      if (bal.data) {
        const m: Record<string, number> = {}
        for (const x of bal.data as { customer_id: string; balance: number }[]) m[x.customer_id] = Number(x.balance)
        setBalances(m)
      }
    })
  }, [])

  const productById = useMemo(() => {
    const m: Record<string, Product> = {}
    for (const p of products) m[p.id] = p
    return m
  }, [products])

  function setLine(key: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  function onPickProduct(key: number, product_id: string) {
    const p = productById[product_id]
    setLine(key, { product_id, unit_price: p ? p.price : 0 })
  }

  function addLine() {
    setLines((prev) => [...prev, { key: keySeq++, product_id: '', quantity: 0, unit_price: 0 }])
  }

  function removeLine(key: number) {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((l) => l.key !== key)))
  }

  const total = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0)
  const validLines = lines.filter((l) => l.product_id && Number(l.quantity) > 0)
  const selCust = customers.find((c) => c.id === customerId)
  const selBalance = customerId ? balances[customerId] ?? 0 : 0
  const overLimit = !!selCust && selCust.credit_limit > 0 && selBalance >= selCust.credit_limit

  async function save() {
    setError(null)
    if (validLines.length === 0) {
      setError('Add at least one product with a quantity.')
      return
    }
    setBusy(true)
    const { data, error } = await supabase.rpc('create_order', {
      p_customer: customerId || null,
      p_order_date: orderDate,
      p_channel: channel,
      p_notes: notes.trim() || null,
      p_items: validLines.map((l) => ({
        product_id: l.product_id,
        quantity: Number(l.quantity),
        unit_price: Number(l.unit_price),
      })),
    })
    if (error) {
      setBusy(false)
      setError(error.message)
      return
    }
    if (branchId) {
      await supabase.from('orders').update({ branch_id: branchId }).eq('id', data)
    }
    setBusy(false)
    navigate(`/orders?new=${data}`)
  }

  return (
    <div>
      <PageHeader title="New order" />
      {error && (
        <div className="mb-3">
          <Banner kind="error">{error}</Banner>
        </div>
      )}

      <Card className="mb-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
          <Field label="Customer">
            <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">— Cash / walk-in —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date">
            <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
          </Field>
          <Field label="Channel">
            <Select value={channel} onChange={(e) => setChannel(e.target.value as OrderChannel)}>
              <option value="manual">Manual</option>
              <option value="sms">SMS / text</option>
              <option value="messenger">Messenger</option>
              <option value="call">Phone call</option>
            </Select>
          </Field>
          <Field label="Notes">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="optional" />
          </Field>
          {branches.length > 0 && (
            <Field label="Branch">
              <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
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

      {selBalance > 0 && (
        <div className="mb-4">
          <Banner kind={overLimit ? 'error' : 'info'}>
            {selCust?.name} currently owes <strong>{money(selBalance)}</strong>
            {overLimit ? ` — over their ${money(selCust?.credit_limit ?? 0)} credit limit.` : '.'}
          </Banner>
        </div>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <th className="py-2 pr-3">Product</th>
                <th className="py-2 pr-3 w-28">Qty</th>
                <th className="py-2 pr-3 w-32">Unit price</th>
                <th className="py-2 pr-3 w-32 text-right">Line total</th>
                <th className="py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const p = productById[l.product_id]
                const lineTotal = (Number(l.quantity) || 0) * (Number(l.unit_price) || 0)
                return (
                  <tr key={l.key} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-3">
                      <Select value={l.product_id} onChange={(e) => onPickProduct(l.key, e.target.value)}>
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
                        <NumberInput
                          value={l.quantity || ''}
                          onChange={(v) => setLine(l.key, { quantity: v === '' ? 0 : v })}
                        />
                        <span className="text-xs text-slate-400">{p?.unit ?? ''}</span>
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      <NumberInput
                        value={l.unit_price || ''}
                        onChange={(v) => setLine(l.key, { unit_price: v === '' ? 0 : v })}
                      />
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{money(lineTotal)}</td>
                    <td className="py-2 text-right">
                      <button
                        onClick={() => removeLine(l.key)}
                        className="text-slate-400 hover:text-red-600"
                        title="Remove line"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" onClick={addLine}>
            + Add line
          </Button>
          <div className="text-right">
            <div className="text-xs uppercase text-slate-500">Order total</div>
            <div className="text-2xl font-semibold tabular-nums text-slate-900">{money(total)}</div>
            <div className="text-xs text-slate-400">{fmtQty(validLines.reduce((s, l) => s + Number(l.quantity), 0))} items total qty</div>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <Button onClick={save} disabled={busy || validLines.length === 0}>
            {busy ? 'Saving…' : 'Save order'}
          </Button>
          <Button variant="ghost" onClick={() => navigate('/orders')}>
            Cancel
          </Button>
        </div>
      </Card>
    </div>
  )
}
