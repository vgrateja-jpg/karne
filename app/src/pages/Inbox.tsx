import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Customer, Product } from '../lib/types'
import { money, phDate } from '../lib/format'
import { Banner, Button, Card, PageHeader, Select } from '../components/ui'

interface ParsedItem {
  product_id: string | null
  name: string
  matched?: boolean
  quantity: number
  unit_price: number
}
interface SmsRow {
  id: string
  received_at: string
  from_number: string | null
  raw_text: string
  parsed: ParsedItem[] | null
  matched_customer: string | null
  sender_known: boolean
}

export function Inbox() {
  const [rows, setRows] = useState<SmsRow[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const [s, p, c] = await Promise.all([
      supabase.from('sms_inbox').select('*').eq('status', 'pending').order('received_at', { ascending: false }),
      supabase.from('products').select('*').eq('is_active', true).order('sort_order').order('name'),
      supabase.from('customers').select('*').eq('is_active', true).order('name'),
    ])
    if (s.error) setError(s.error.message)
    else setRows((s.data ?? []) as SmsRow[])
    if (p.data) setProducts(p.data as Product[])
    if (c.data) setCustomers(c.data as Customer[])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id))
  }

  return (
    <div>
      <PageHeader title={`Text Orders${rows.length ? ` (${rows.length})` : ''}`} />
      {error && (
        <div className="mb-3">
          <Banner kind="error">{error}</Banner>
        </div>
      )}
      {loading ? (
        <div className="py-8 text-center text-slate-400">Loading…</div>
      ) : rows.length === 0 ? (
        <Card>
          <div className="py-8 text-center text-slate-400">
            No pending texts. Forwarded orders will appear here for you to confirm.
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => (
            <InboxItem
              key={row.id}
              row={row}
              products={products}
              customers={customers}
              onResolved={() => removeRow(row.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface Line {
  key: number
  product_id: string
  quantity: number
  unit_price: number
}
let seq = 1

function InboxItem({
  row,
  products,
  customers,
  onResolved,
}: {
  row: SmsRow
  products: Product[]
  customers: Customer[]
  onResolved: () => void
}) {
  const productById = useMemo(() => {
    const m: Record<string, Product> = {}
    for (const p of products) m[p.id] = p
    return m
  }, [products])

  const [customerId, setCustomerId] = useState(row.matched_customer ?? '')
  const [lines, setLines] = useState<Line[]>(
    () =>
      (row.parsed ?? [])
        .filter((i) => i.product_id)
        .map((i) => ({
          key: seq++,
          product_id: i.product_id as string,
          quantity: Number(i.quantity) || 0,
          unit_price: Number(i.unit_price) || productById[i.product_id as string]?.price || 0,
        })),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [registered, setRegistered] = useState(false)

  async function registerSender() {
    if (!row.from_number) return
    const { error } = await supabase
      .from('sms_senders')
      .insert({ phone: row.from_number, customer_id: customerId || null })
    if (error) setError(error.message)
    else setRegistered(true)
  }

  function setLine(key: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }
  function pickProduct(key: number, product_id: string) {
    setLine(key, { product_id, unit_price: productById[product_id]?.price ?? 0 })
  }
  function addLine() {
    setLines((prev) => [...prev, { key: seq++, product_id: '', quantity: 0, unit_price: 0 }])
  }
  function removeLine(key: number) {
    setLines((prev) => prev.filter((l) => l.key !== key))
  }

  const valid = lines.filter((l) => l.product_id && Number(l.quantity) > 0)
  const total = valid.reduce((s, l) => s + l.quantity * l.unit_price, 0)

  async function confirm() {
    setError(null)
    if (valid.length === 0) {
      setError('Add at least one product with a quantity, or Ignore this text.')
      return
    }
    setBusy(true)
    const { data, error } = await supabase.rpc('create_order', {
      p_customer: customerId || null,
      p_order_date: phDate(new Date(row.received_at)),
      p_channel: 'sms',
      p_notes: `From SMS: "${row.raw_text.slice(0, 140)}"`,
      p_items: valid.map((l) => ({ product_id: l.product_id, quantity: l.quantity, unit_price: l.unit_price })),
      p_sms_id: row.id,
    })
    if (error) {
      setBusy(false)
      setError(error.message)
      return
    }
    const upd = await supabase
      .from('sms_inbox')
      .update({ status: 'confirmed', created_order_id: data })
      .eq('id', row.id)
    setBusy(false)
    if (upd.error) setError(upd.error.message)
    else onResolved()
  }

  async function ignore() {
    setBusy(true)
    const { error } = await supabase.from('sms_inbox').update({ status: 'ignored' }).eq('id', row.id)
    setBusy(false)
    if (error) setError(error.message)
    else onResolved()
  }

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase text-slate-500">From {row.from_number ?? 'unknown'}</span>
            {!row.sender_known &&
              (registered ? (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  ✓ number registered
                </span>
              ) : (
                <>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                    ⚠ unknown sender
                  </span>
                  {row.from_number && (
                    <button onClick={registerSender} className="text-xs font-medium text-rose-700 hover:underline">
                      Register this number
                    </button>
                  )}
                </>
              ))}
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">“{row.raw_text}”</div>
        </div>
        <div className="text-xs text-slate-400">{new Date(row.received_at).toLocaleString()}</div>
      </div>

      {error && (
        <div className="mb-2">
          <Banner kind="error">{error}</Banner>
        </div>
      )}

      <div className="mb-3 max-w-xs">
        <span className="mb-1 block text-xs font-medium text-slate-600">Customer</span>
        <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
          <option value="">— Cash / walk-in —</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
            <th className="py-1.5 pr-2">Product</th>
            <th className="py-1.5 pr-2 w-24">Qty</th>
            <th className="py-1.5 pr-2 w-28">Price</th>
            <th className="py-1.5 pr-2 w-28 text-right">Total</th>
            <th className="w-8"></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.key} className="border-b border-slate-100 last:border-0">
              <td className="py-1.5 pr-2">
                <Select value={l.product_id} onChange={(e) => pickProduct(l.key, e.target.value)}>
                  <option value="">— pick product —</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </td>
              <td className="py-1.5 pr-2">
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  value={l.quantity || ''}
                  onChange={(e) => setLine(l.key, { quantity: Number(e.target.value) })}
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-rose-500"
                />
              </td>
              <td className="py-1.5 pr-2">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={l.unit_price || ''}
                  onChange={(e) => setLine(l.key, { unit_price: Number(e.target.value) })}
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-rose-500"
                />
              </td>
              <td className="py-1.5 pr-2 text-right tabular-nums">{money(l.quantity * l.unit_price)}</td>
              <td className="py-1.5 text-right">
                <button onClick={() => removeLine(l.key)} className="text-slate-400 hover:text-red-600" title="Remove">
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" onClick={addLine}>
          + Add line
        </Button>
        <div className="text-right text-sm">
          <span className="text-slate-500">Total </span>
          <span className="text-lg font-semibold tabular-nums">{money(total)}</span>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <Button onClick={confirm} disabled={busy || valid.length === 0}>
          {busy ? 'Saving…' : '✓ Confirm order'}
        </Button>
        <Button variant="danger" onClick={ignore} disabled={busy}>
          Ignore
        </Button>
      </div>
    </Card>
  )
}
