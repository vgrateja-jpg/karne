import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { money, qty as fmtQty } from '../lib/format'
import { addMonth, dayOfMonth, monthLabel, monthRange } from '../lib/dates'
import { fetchSettings, type AppSettings } from '../lib/settings'
import { Banner, Button, Card, PageHeader } from '../components/ui'

interface DailyRow {
  day: string
  orders_count: number
  sales: number
  cash_sales: number
  payments: number
}
interface ProductRow {
  product_id: string
  name: string
  unit: string
  total_qty: number
  total_amount: number
}
interface CustomerRow {
  customer_id: string
  name: string
  orders_count: number
  total_amount: number
}

export function Month() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [daily, setDaily] = useState<DailyRow[]>([])
  const [byProduct, setByProduct] = useState<ProductRow[]>([])
  const [byCustomer, setByCustomer] = useState<CustomerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)

  useEffect(() => {
    fetchSettings().then(setSettings)
  }, [])

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      const { from, to } = monthRange(year, month)
      const [d, p, c] = await Promise.all([
        supabase.rpc('report_daily', { p_from: from, p_to: to }),
        supabase.rpc('report_sales_by_product', { p_from: from, p_to: to }),
        supabase.rpc('report_sales_by_customer', { p_from: from, p_to: to }),
      ])
      if (d.error) setError(d.error.message)
      setDaily((d.data ?? []) as DailyRow[])
      setByProduct((p.data ?? []) as ProductRow[])
      setByCustomer((c.data ?? []) as CustomerRow[])
      setLoading(false)
    }
    load()
  }, [year, month])

  function shift(delta: number) {
    const next = addMonth(year, month, delta)
    setYear(next.year)
    setMonth(next.month)
  }

  const totalSales = daily.reduce((s, r) => s + Number(r.sales), 0)
  const totalCash = daily.reduce((s, r) => s + Number(r.cash_sales), 0)
  const totalPayments = daily.reduce((s, r) => s + Number(r.payments), 0)
  const totalOrders = daily.reduce((s, r) => s + Number(r.orders_count), 0)
  const activeDays = daily.filter((r) => r.orders_count > 0 || r.payments > 0)

  return (
    <div>
      <PageHeader
        title="Monthly view"
        action={
          <div className="no-print flex items-center gap-2">
            <Button variant="ghost" onClick={() => shift(-1)}>
              ‹ Prev
            </Button>
            <span className="min-w-32 text-center text-sm font-semibold text-slate-700">
              {monthLabel(year, month)}
            </span>
            <Button variant="ghost" onClick={() => shift(1)}>
              Next ›
            </Button>
            <Button onClick={() => window.print()}>🖨 Print</Button>
          </div>
        }
      />

      {/* print-only report header */}
      <div className="mb-4 hidden text-center print:block">
        <div className="text-xl font-bold text-slate-900">{settings?.business_name}</div>
        <div className="text-sm text-slate-600">Monthly report — {monthLabel(year, month)}</div>
      </div>
      {error && (
        <div className="mb-3">
          <Banner kind="error">{error}</Banner>
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <div className="text-xs uppercase text-slate-500">Total sales</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">{money(totalSales)}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase text-slate-500">Cash / walk-in</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">{money(totalCash)}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase text-slate-500">Payments received</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">{money(totalPayments)}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase text-slate-500">Orders</div>
          <div className="mt-1 text-xl font-semibold tabular-nums">{totalOrders}</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Daily breakdown — the replacement for the 31 daily tabs */}
        <Card className="lg:col-span-1">
          <div className="mb-2 text-sm font-medium text-slate-700">Day by day</div>
          {loading ? (
            <div className="py-6 text-center text-slate-400">Loading…</div>
          ) : activeDays.length === 0 ? (
            <div className="py-6 text-center text-slate-400">No activity this month.</div>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                    <th className="py-2 pr-2">Day</th>
                    <th className="py-2 pr-2 text-right">Sales</th>
                    <th className="py-2 text-right">Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {activeDays.map((r) => (
                    <tr key={r.day} className="border-b border-slate-100 last:border-0">
                      <td className="py-1.5 pr-2 tabular-nums">{dayOfMonth(r.day)}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{money(r.sales)}</td>
                      <td className="py-1.5 text-right tabular-nums text-emerald-600">{money(r.payments)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* By product */}
        <Card>
          <div className="mb-2 text-sm font-medium text-slate-700">Sales by product</div>
          {byProduct.length === 0 ? (
            <div className="py-6 text-center text-slate-400">—</div>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                    <th className="py-2 pr-2">Product</th>
                    <th className="py-2 pr-2 text-right">Qty</th>
                    <th className="py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {byProduct.map((r) => (
                    <tr key={r.product_id} className="border-b border-slate-100 last:border-0">
                      <td className="py-1.5 pr-2 font-medium text-slate-800">{r.name}</td>
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
        </Card>

        {/* By customer */}
        <Card>
          <div className="mb-2 text-sm font-medium text-slate-700">Sales by customer</div>
          {byCustomer.length === 0 ? (
            <div className="py-6 text-center text-slate-400">—</div>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                    <th className="py-2 pr-2">Customer</th>
                    <th className="py-2 pr-2 text-right">Orders</th>
                    <th className="py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {byCustomer.map((r) => (
                    <tr key={r.customer_id} className="border-b border-slate-100 last:border-0">
                      <td className="py-1.5 pr-2 font-medium text-slate-800">{r.name}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums text-slate-500">{r.orders_count}</td>
                      <td className="py-1.5 text-right tabular-nums">{money(r.total_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
