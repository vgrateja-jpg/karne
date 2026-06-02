import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { money, today } from '../lib/format'
import { MONTHS_SHORT, monthRange, quarterMonths, quarterRange, yearRange } from '../lib/dates'
import { Card, PageHeader } from '../components/ui'

interface Period {
  sales: number
  cash_sales: number
  orders: number
  payments: number
  expenses: number
  purchases: number
}
const ZERO: Period = { sales: 0, cash_sales: 0, orders: 0, payments: 0, expenses: 0, purchases: 0 }
const profitOf = (p?: Period) => (p ? Number(p.sales) - Number(p.expenses) - Number(p.purchases) : 0)

function Summary({ p }: { p?: Period }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
      <span>Sales <span className="font-semibold tabular-nums text-slate-800">{money(p?.sales ?? 0)}</span></span>
      <span>Profit <span className="font-semibold tabular-nums text-slate-800">{money(profitOf(p))}</span></span>
      <span>Orders <span className="font-semibold tabular-nums text-slate-800">{p?.orders ?? 0}</span></span>
    </div>
  )
}

export function History() {
  const navigate = useNavigate()
  const nowY = Number(today().slice(0, 4))
  const [years, setYears] = useState<number[]>([])
  const [openYear, setOpenYear] = useState<number | null>(nowY)
  const [openQ, setOpenQ] = useState<string | null>(null)
  const [yearSum, setYearSum] = useState<Record<number, Period>>({})
  const [qSum, setQSum] = useState<Record<string, Period>>({})
  const [mSum, setMSum] = useState<Record<string, Period>>({})

  async function period(from: string, to: string): Promise<Period> {
    const { data } = await supabase.rpc('report_period', { p_from: from, p_to: to })
    return ((data ?? [])[0] as Period) ?? ZERO
  }

  async function loadYear(y: number) {
    if (yearSum[y]) return
    const yr = yearRange(y)
    const ys = await period(yr.from, yr.to)
    setYearSum((s) => ({ ...s, [y]: ys }))
    const entries = await Promise.all(
      [1, 2, 3, 4].map(async (q) => {
        const r = quarterRange(y, q)
        return [`${y}-${q}`, await period(r.from, r.to)] as const
      }),
    )
    setQSum((s) => {
      const n = { ...s }
      for (const [k, v] of entries) n[k] = v
      return n
    })
  }

  async function loadQuarter(y: number, q: number) {
    const entries = await Promise.all(
      quarterMonths(q).map(async (m) => {
        const r = monthRange(y, m)
        return [`${y}-${m}`, await period(r.from, r.to)] as const
      }),
    )
    setMSum((s) => {
      const n = { ...s }
      for (const [k, v] of entries) n[k] = v
      return n
    })
  }

  useEffect(() => {
    async function init() {
      const e = await supabase.from('orders').select('order_date').order('order_date', { ascending: true }).limit(1)
      const firstY = e.data && e.data.length ? Number((e.data[0] as { order_date: string }).order_date.slice(0, 4)) : nowY
      const list: number[] = []
      for (let y = nowY; y >= Math.min(firstY, nowY); y--) list.push(y)
      setYears(list)
      loadYear(nowY)
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggleYear(y: number) {
    if (openYear === y) {
      setOpenYear(null)
      return
    }
    setOpenYear(y)
    setOpenQ(null)
    loadYear(y)
  }
  function toggleQuarter(y: number, q: number) {
    const key = `${y}-${q}`
    if (openQ === key) {
      setOpenQ(null)
      return
    }
    setOpenQ(key)
    loadQuarter(y, q)
  }

  return (
    <div>
      <PageHeader title="Historical Report" />
      <p className="mb-4 text-sm text-slate-500">
        Your full history. Tap a year → its quarters → the months. Tap a month to open its full report.
      </p>

      <div className="space-y-3">
        {years.map((y) => (
          <Card key={y}>
            <button onClick={() => toggleYear(y)} className="flex w-full items-center justify-between gap-3 text-left">
              <span className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                <span className="text-slate-400">{openYear === y ? '▾' : '▸'}</span> {y}
              </span>
              <Summary p={yearSum[y]} />
            </button>

            {openYear === y && (
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {[1, 2, 3, 4].map((q) => {
                  const key = `${y}-${q}`
                  const open = openQ === key
                  return (
                    <div key={q} className="rounded-lg border border-slate-200">
                      <button
                        onClick={() => toggleQuarter(y, q)}
                        className="flex w-full items-center justify-between gap-2 p-3 text-left"
                      >
                        <span className="text-sm font-semibold text-slate-800">
                          <span className="mr-1 text-slate-400">{open ? '▾' : '▸'}</span>Q{q}
                        </span>
                        <Summary p={qSum[key]} />
                      </button>
                      {open && (
                        <div className="border-t border-slate-100">
                          {quarterMonths(q).map((m) => {
                            const mk = `${y}-${m}`
                            return (
                              <button
                                key={m}
                                onClick={() => navigate(`/month?ym=${y}-${String(m + 1).padStart(2, '0')}`)}
                                className="flex w-full items-center justify-between gap-2 border-b border-slate-50 px-3 py-2 text-left last:border-0 hover:bg-slate-50"
                              >
                                <span className="text-sm font-medium text-rose-700">{MONTHS_SHORT[m]} {y}</span>
                                <Summary p={mSum[mk]} />
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}
