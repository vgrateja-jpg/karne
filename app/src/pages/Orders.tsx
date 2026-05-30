import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { money } from '../lib/format'
import { Banner, Button, Card, PageHeader } from '../components/ui'

interface OrderRow {
  id: string
  order_date: string
  status: string
  channel: string
  customer: { name: string } | null
}

export function Orders() {
  const [params] = useSearchParams()
  const justCreated = params.get('new')
  const [rows, setRows] = useState<OrderRow[]>([])
  const [totals, setTotals] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [ord, tot] = await Promise.all([
        supabase
          .from('orders')
          .select('id, order_date, status, channel, customer:customers(name)')
          .order('order_date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(200),
        supabase.from('v_order_totals').select('order_id, total'),
      ])
      if (ord.error) setError(ord.error.message)
      else setRows((ord.data ?? []) as unknown as OrderRow[])
      if (!tot.error && tot.data) {
        const m: Record<string, number> = {}
        for (const t of tot.data as { order_id: string; total: number }[]) m[t.order_id] = t.total
        setTotals(m)
      }
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div>
      <PageHeader
        title="Orders"
        action={
          <Link to="/orders/new">
            <Button>+ New order</Button>
          </Link>
        }
      />
      {justCreated && (
        <div className="mb-3">
          <Banner kind="success">
            Order saved — inventory and the customer balance were updated.{' '}
            <Link to={`/orders/${justCreated}/receipt`} className="font-medium underline">
              Print receipt →
            </Link>
          </Banner>
        </div>
      )}
      {error && (
        <div className="mb-3">
          <Banner kind="error">{error}</Banner>
        </div>
      )}
      <Card>
        {loading ? (
          <div className="py-8 text-center text-slate-400">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-slate-400">No orders yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Customer</th>
                  <th className="py-2 pr-3">Channel</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3 text-right">Total</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr
                    key={o.id}
                    className={`border-b border-slate-100 last:border-0 ${o.id === justCreated ? 'bg-emerald-50' : ''}`}
                  >
                    <td className="py-2 pr-3 tabular-nums">{o.order_date}</td>
                    <td className="py-2 pr-3 font-medium text-slate-800">{o.customer?.name ?? 'Cash / walk-in'}</td>
                    <td className="py-2 pr-3 text-slate-500">{o.channel}</td>
                    <td className="py-2 pr-3 text-slate-500">{o.status}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{money(totals[o.id] ?? 0)}</td>
                    <td className="py-2 text-right">
                      <Link to={`/orders/${o.id}/receipt`} className="text-sm text-rose-700 hover:underline">
                        Receipt
                      </Link>
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
