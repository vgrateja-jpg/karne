import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { money } from '../lib/format'
import { Banner, Card, PageHeader } from '../components/ui'

interface AgingRow {
  customer_id: string
  name: string
  balance: number
  d0_30: number
  d31_60: number
  d61_90: number
  d90plus: number
  oldest_days: number
}

export function Receivables() {
  const [rows, setRows] = useState<AgingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data, error } = await supabase.rpc('report_receivables')
      if (error) setError(error.message)
      else setRows(((data ?? []) as AgingRow[]).sort((a, b) => b.balance - a.balance))
      setLoading(false)
    }
    load()
  }, [])

  const t = rows.reduce(
    (a, r) => ({
      balance: a.balance + Number(r.balance),
      d0_30: a.d0_30 + Number(r.d0_30),
      d31_60: a.d31_60 + Number(r.d31_60),
      d61_90: a.d61_90 + Number(r.d61_90),
      d90plus: a.d90plus + Number(r.d90plus),
    }),
    { balance: 0, d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 },
  )

  return (
    <div>
      <PageHeader
        title="Receivables"
        action={
          <div className="text-right">
            <div className="text-xs uppercase text-slate-500">Total owed to you</div>
            <div className="text-xl font-semibold tabular-nums text-rose-600">{money(t.balance)}</div>
          </div>
        }
      />
      <p className="mb-4 text-sm text-slate-500">
        Who owes you, and how overdue it is. Older columns (61–90, 90+) are the ones to chase.
      </p>
      {error && (
        <div className="mb-3">
          <Banner kind="error">{error}</Banner>
        </div>
      )}
      <Card>
        {loading ? (
          <div className="py-8 text-center text-slate-400">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-slate-400">No one owes you right now. 🎉</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="py-2 pr-3">Customer</th>
                  <th className="py-2 pr-3 text-right">0–30 days</th>
                  <th className="py-2 pr-3 text-right">31–60</th>
                  <th className="py-2 pr-3 text-right">61–90</th>
                  <th className="py-2 pr-3 text-right">90+</th>
                  <th className="py-2 pr-3 text-right">Total</th>
                  <th className="py-2 pr-3 text-right">Oldest</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.customer_id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-3 font-medium">
                      <Link to={`/customers/${r.customer_id}`} className="text-rose-700 hover:underline">
                        {r.name}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-600">{r.d0_30 ? money(r.d0_30) : '—'}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-600">{r.d31_60 ? money(r.d31_60) : '—'}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-amber-700">{r.d61_90 ? money(r.d61_90) : '—'}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-rose-600">{r.d90plus ? money(r.d90plus) : '—'}</td>
                    <td className="py-2 pr-3 text-right font-semibold tabular-nums">{money(r.balance)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-slate-400">
                      {r.oldest_days >= 9999 ? 'prior' : `${r.oldest_days}d`}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 font-semibold">
                  <td className="py-2 pr-3">Total</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{money(t.d0_30)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{money(t.d31_60)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{money(t.d61_90)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{money(t.d90plus)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{money(t.balance)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
