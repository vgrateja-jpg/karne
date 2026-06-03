import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { money, qty as fmtQty, today } from '../lib/format'
import { addMonth, fmtDayLabel, monthLabel, monthRange, weekday } from '../lib/dates'
import { fetchSettings, type AppSettings } from '../lib/settings'
import type { Branch } from '../lib/types'
import { Banner, Button, Card, PageHeader, Select } from '../components/ui'
import { DayDetail } from '../components/DayDetail'
import { IncomeStatement } from '../components/IncomeStatement'

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
  const [params] = useSearchParams()
  const t = today()
  const ym = params.get('ym') // 'YYYY-MM'
  const [year, setYear] = useState(ym ? Number(ym.slice(0, 4)) : Number(t.slice(0, 4)))
  const [month, setMonth] = useState(ym ? Number(ym.slice(5, 7)) - 1 : Number(t.slice(5, 7)) - 1)
  const [daily, setDaily] = useState<DailyRow[]>([])
  const [byProduct, setByProduct] = useState<ProductRow[]>([])
  const [byCustomer, setByCustomer] = useState<CustomerRow[]>([])
  const [byCat, setByCat] = useState<{ category: string; amount: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [branches, setBranches] = useState<Branch[]>([])
  const [branchId, setBranchId] = useState('')

  useEffect(() => {
    fetchSettings().then(setSettings)
    supabase
      .from('branches')
      .select('*')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => {
        if (data) setBranches(data as Branch[])
      })
  }, [])

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      const { from, to } = monthRange(year, month)
      const branch = branchId || null
      const [d, p, c, e] = await Promise.all([
        supabase.rpc('report_daily', { p_from: from, p_to: to, p_branch: branch }),
        supabase.rpc('report_sales_by_product', { p_from: from, p_to: to, p_branch: branch }),
        supabase.rpc('report_sales_by_customer', { p_from: from, p_to: to, p_branch: branch }),
        supabase.rpc('report_expenses_by_category', { p_from: from, p_to: to }),
      ])
      if (d.error) setError(d.error.message)
      setDaily((d.data ?? []) as DailyRow[])
      setByProduct((p.data ?? []) as ProductRow[])
      setByCustomer((c.data ?? []) as CustomerRow[])
      setByCat((e.data ?? []) as { category: string; amount: number }[])
      setLoading(false)
    }
    load()
  }, [year, month, branchId])

  function shift(delta: number) {
    const next = addMonth(year, month, delta)
    setYear(next.year)
    setMonth(next.month)
  }

  const totalSales = daily.reduce((s, r) => s + Number(r.sales), 0)
  const totalCash = daily.reduce((s, r) => s + Number(r.cash_sales), 0)
  const totalPayments = daily.reduce((s, r) => s + Number(r.payments), 0)
  const totalOrders = daily.reduce((s, r) => s + Number(r.orders_count), 0)

  return (
    <div>
      <div className={selectedDay ? 'no-print-when-modal' : undefined}>
        <PageHeader
          title="Monthly Report"
          action={
            <div className="no-print flex items-center gap-2">
              <Button variant="ghost" onClick={() => shift(-1)}>
                ‹ Prev
              </Button>
              <span className="min-w-32 text-center text-sm font-semibold text-slate-700">{monthLabel(year, month)}</span>
              <Button variant="ghost" onClick={() => shift(1)}>
                Next ›
              </Button>
              {branches.length > 0 && (
                <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="w-40">
                  <option value="">All branches</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              )}
              <Button onClick={() => window.print()}>🖨 Download PDF</Button>
            </div>
          }
        />

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
          {!branchId && (
            <Card>
              <div className="text-xs uppercase text-slate-500">Payments received</div>
              <div className="mt-1 text-xl font-semibold tabular-nums">{money(totalPayments)}</div>
            </Card>
          )}
          <Card>
            <div className="text-xs uppercase text-slate-500">Orders</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{totalOrders}</div>
          </Card>
        </div>

        {!branchId && (
          <div className="mb-4">
            <IncomeStatement from={monthRange(year, month).from} to={monthRange(year, month).to} />
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Day by day — every day, actual dates, tap to expand */}
          <Card className="lg:col-span-1">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-sm font-medium text-slate-700">Day by day</span>
              <span className="no-print text-xs text-slate-400">tap a day</span>
            </div>
            {loading ? (
              <div className="py-6 text-center text-slate-400">Loading…</div>
            ) : (
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                      <th className="py-2 pr-2">Date</th>
                      <th className="py-2 pr-2 text-right">Sales</th>
                      {!branchId && <th className="py-2 text-right">Paid</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {daily.map((r) => {
                      const quiet = r.orders_count === 0 && r.payments === 0
                      return (
                        <tr
                          key={r.day}
                          onClick={() => setSelectedDay(r.day)}
                          className={`cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50 ${quiet ? 'text-slate-300' : ''}`}
                        >
                          <td className="py-1.5 pr-2 tabular-nums">
                            <span className={quiet ? 'text-slate-400' : 'text-slate-600'}>{weekday(r.day)}</span> {fmtDayLabel(r.day)}
                          </td>
                          <td className="py-1.5 pr-2 text-right tabular-nums">{r.sales ? money(r.sales) : '—'}</td>
                          {!branchId && (
                            <td className="py-1.5 text-right tabular-nums text-emerald-600">{r.payments ? money(r.payments) : ''}</td>
                          )}
                        </tr>
                      )
                    })}
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

          {/* Expenses by category */}
          <Card>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-sm font-medium text-slate-700">Expenses by category</span>
              <span className="text-xs text-slate-500 tabular-nums">
                {money(byCat.reduce((s, r) => s + Number(r.amount), 0))}
              </span>
            </div>
            {byCat.length === 0 ? (
              <div className="py-6 text-center text-slate-400">—</div>
            ) : (
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                      <th className="py-2 pr-2">Category</th>
                      <th className="py-2 text-right">Spent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byCat.map((r) => (
                      <tr key={r.category} className="border-b border-slate-100 last:border-0">
                        <td className="py-1.5 pr-2 font-medium text-slate-800">{r.category}</td>
                        <td className="py-1.5 text-right tabular-nums">{money(r.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* day modal */}
      {selectedDay && (
        <div
          className="day-modal-overlay fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
          onClick={() => setSelectedDay(null)}
        >
          <div className="print-area mt-6 w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 hidden text-center print:block">
              <div className="text-lg font-bold">{settings?.business_name}</div>
            </div>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-800">
                {weekday(selectedDay)} · {fmtDayLabel(selectedDay)}, {selectedDay.slice(0, 4)}
              </div>
              <div className="no-print flex gap-2">
                <Button onClick={() => window.print()}>🖨 PDF</Button>
                <Button variant="ghost" onClick={() => setSelectedDay(null)}>
                  Close
                </Button>
              </div>
            </div>
            <DayDetail date={selectedDay} />
          </div>
        </div>
      )}
    </div>
  )
}
