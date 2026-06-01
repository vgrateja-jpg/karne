import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { money } from '../lib/format'
import { Banner, Button, Card, PageHeader } from '../components/ui'

interface OrderRow {
  id: string
  order_date: string
  status: string
  channel: string
  customer: { name: string } | null
  branch: { name: string } | null
}

export function Orders() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
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
          .select('id, order_date, status, channel, customer:customers(name), branch:branches(name)')
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

  async function deleteOrder(orderId: string) {
    if (!window.confirm('Delete this order permanently? Its items return to stock.')) return
    const { error } = await supabase.rpc('delete_order', { p_order: orderId })
    if (error) setError(error.message)
    else setRows((prev) => prev.filter((o) => o.id !== orderId))
  }

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
                    onClick={() => navigate(`/orders/${o.id}`)}
                    className={`cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50 ${o.id === justCreated ? 'bg-emerald-50' : ''}`}
                  >
                    <td className="py-2 pr-3 tabular-nums">{o.order_date}</td>
                    <td className="py-2 pr-3 font-medium text-slate-800">
                      {o.customer?.name ?? 'Cash / walk-in'}
                      {o.branch && <span className="ml-1 text-xs font-normal text-slate-400">· {o.branch.name}</span>}
                    </td>
                    <td className="py-2 pr-3 text-slate-500">{o.channel}</td>
                    <td className="py-2 pr-3 text-slate-500">{o.status}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{money(totals[o.id] ?? 0)}</td>
                    <td className="py-2 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <Link
                          to={`/orders/${o.id}/receipt`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-sm text-rose-700 hover:underline"
                        >
                          Receipt
                        </Link>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteOrder(o.id)
                          }}
                          className="text-slate-400 hover:text-red-600"
                          title="Delete order"
                        >
                          ✕
                        </button>
                      </div>
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
