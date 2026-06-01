import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchSettings, type AppSettings } from '../lib/settings'
import { money, qty as fmtQty, today } from '../lib/format'
import { Banner, Button, Card, Input, PageHeader } from '../components/ui'

interface OrderRow {
  id: string
  status: string
  customer: { name: string } | null
}
interface ItemRow {
  order_id: string
  quantity: number
  line_total: number
  product: { name: string; unit: string } | null
}

export function Delivery() {
  const [date, setDate] = useState(today())
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [items, setItems] = useState<Record<string, ItemRow[]>>({})
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchSettings().then(setSettings)
  }, [])

  async function load() {
    setLoading(true)
    const ord = await supabase
      .from('orders')
      .select('id, status, customer:customers(name)')
      .eq('order_date', date)
      .neq('status', 'void')
      .order('created_at')
    if (ord.error) {
      setError(ord.error.message)
      setLoading(false)
      return
    }
    const rows = (ord.data ?? []) as unknown as OrderRow[]
    setOrders(rows)
    if (rows.length) {
      const it = await supabase
        .from('order_items')
        .select('order_id, quantity, line_total, product:products(name, unit)')
        .in('order_id', rows.map((r) => r.id))
      const m: Record<string, ItemRow[]> = {}
      for (const r of (it.data ?? []) as unknown as ItemRow[]) {
        ;(m[r.order_id] ??= []).push(r)
      }
      setItems(m)
    } else {
      setItems({})
    }
    setLoading(false)
  }
  useEffect(() => {
    load()
  }, [date])

  async function markDelivered(orderId: string) {
    const { error } = await supabase.from('orders').update({ status: 'delivered' }).eq('id', orderId)
    if (error) setError(error.message)
    else setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: 'delivered' } : o)))
  }

  const grandTotal = Object.values(items)
    .flat()
    .reduce((s, i) => s + Number(i.line_total), 0)

  return (
    <div>
      <PageHeader
        title="Deliveries"
        action={
          <div className="no-print flex items-center gap-2">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
            <Button onClick={() => window.print()}>🖨 Print list</Button>
          </div>
        }
      />
      {error && (
        <div className="mb-3">
          <Banner kind="error">{error}</Banner>
        </div>
      )}

      <div className="mb-4 hidden text-center print:block">
        <div className="text-xl font-bold text-slate-900">{settings?.business_name}</div>
        <div className="text-sm text-slate-600">Delivery list — {date}</div>
      </div>

      {loading ? (
        <div className="py-8 text-center text-slate-400">Loading…</div>
      ) : orders.length === 0 ? (
        <Card>
          <div className="py-8 text-center text-slate-400">No orders for this date.</div>
        </Card>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => {
            const its = items[o.id] ?? []
            const total = its.reduce((s, i) => s + Number(i.line_total), 0)
            return (
              <Card key={o.id} className="print-area">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold text-slate-800">{o.customer?.name ?? 'Cash / walk-in'}</div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        o.status === 'delivered' || o.status === 'paid'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {o.status}
                    </span>
                    {o.status !== 'delivered' && o.status !== 'paid' && (
                      <Button variant="ghost" onClick={() => markDelivered(o.id)} className="no-print">
                        Mark delivered
                      </Button>
                    )}
                    <Link to={`/orders/${o.id}`} className="no-print">
                      <Button variant="ghost">Open</Button>
                    </Link>
                  </div>
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {its.map((i, idx) => (
                      <tr key={idx} className="border-b border-slate-100 last:border-0">
                        <td className="py-1.5 text-slate-800">{i.product?.name ?? '—'}</td>
                        <td className="py-1.5 text-right tabular-nums text-slate-500">
                          {fmtQty(i.quantity)} {i.product?.unit}
                        </td>
                        <td className="py-1.5 w-28 text-right tabular-nums">{money(i.line_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-1 text-right text-sm font-semibold tabular-nums">{money(total)}</div>
              </Card>
            )
          })}
          <div className="px-1 text-right text-sm">
            <span className="text-slate-500">Day total: </span>
            <span className="text-lg font-semibold tabular-nums">{money(grandTotal)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
