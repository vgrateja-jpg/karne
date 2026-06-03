import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { money, qty as fmtQty } from '../lib/format'
import { IncomeStatement } from './IncomeStatement'

interface Period {
  sales: number
  cash_sales: number
  orders: number
  payments: number
  expenses: number
  purchases: number
}
interface ProductRow {
  product_id: string
  name: string
  unit: string
  total_qty: number
  total_amount: number
}
interface OrderRow {
  id: string
  status: string
  customer: { name: string } | null
  total: number
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-2 text-center">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="break-words text-sm font-semibold leading-tight tabular-nums text-slate-900 sm:text-base">{value}</div>
    </div>
  )
}

export function DayDetail({ date }: { date: string }) {
  const [period, setPeriod] = useState<Period | null>(null)
  const [byProduct, setByProduct] = useState<ProductRow[]>([])
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [p, prod, ord] = await Promise.all([
        supabase.rpc('report_period', { p_from: date, p_to: date }),
        supabase.rpc('report_sales_by_product', { p_from: date, p_to: date }),
        supabase.from('orders').select('id, status, customer:customers(name)').eq('order_date', date).neq('status', 'void'),
      ])
      setPeriod(((p.data ?? [])[0] as Period) ?? null)
      setByProduct((prod.data ?? []) as ProductRow[])
      const rows = (ord.data ?? []) as unknown as OrderRow[]
      if (rows.length) {
        const tot = await supabase.from('v_order_totals').select('order_id, total').in('order_id', rows.map((r) => r.id))
        const m: Record<string, number> = {}
        for (const t of (tot.data ?? []) as { order_id: string; total: number }[]) m[t.order_id] = Number(t.total)
        setOrders(rows.map((r) => ({ ...r, total: m[r.id] ?? 0 })))
      } else setOrders([])
      setLoading(false)
    }
    load()
  }, [date])

  if (loading) return <div className="py-6 text-center text-slate-400">Loading…</div>

  if (period && period.orders === 0 && period.payments === 0 && period.expenses === 0 && period.purchases === 0) {
    return <div className="py-6 text-center text-slate-400">No transactions on this day.</div>
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat label="Sales" value={money(period?.sales ?? 0)} />
        <Stat label="Orders" value={String(period?.orders ?? 0)} />
        <Stat label="Cash sales" value={money(period?.cash_sales ?? 0)} />
        <Stat label="Collected" value={money(period?.payments ?? 0)} />
        <Stat label="Expenses" value={money(period?.expenses ?? 0)} />
      </div>

      <IncomeStatement from={date} to={date} />

      {byProduct.length > 0 && (
        <div>
          <div className="mb-1 text-sm font-medium text-slate-700">Sold by product</div>
          <table className="w-full text-sm">
            <tbody>
              {byProduct.map((r) => (
                <tr key={r.product_id} className="border-b border-slate-100 last:border-0">
                  <td className="py-1.5 pr-2 text-slate-800">{r.name}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-slate-500">
                    {fmtQty(r.total_qty)} {r.unit}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{money(r.total_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {orders.length > 0 && (
        <div>
          <div className="mb-1 text-sm font-medium text-slate-700">Orders ({orders.length})</div>
          <table className="w-full text-sm">
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-1.5 pr-2 text-slate-800">{o.customer?.name ?? 'Cash / walk-in'}</td>
                  <td className="py-1.5 pr-2 text-slate-400">{o.status}</td>
                  <td className="py-1.5 text-right tabular-nums">{money(o.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
