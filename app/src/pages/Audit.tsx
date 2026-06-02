import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { money, today } from '../lib/format'
import { addMonth, monthLabel, monthRange, yearRange } from '../lib/dates'
import { Banner, Button, Card, Input, PageHeader } from '../components/ui'

interface Audit {
  id: number
  occurred_at: string
  actor: string | null
  actor_email: string | null
  action: string
  category: string
  entity: string
  row_data: Record<string, unknown> | null
}

const CATEGORIES = ['All', 'Daily', 'Stock', 'People', 'Money', 'Setup']
const ENTITY_LABEL: Record<string, string> = {
  orders: 'Order', sms_inbox: 'Text order', products: 'Product / price', breakdowns: 'Butchering',
  customers: 'Customer', customer_charges: 'Charge', suppliers: 'Supplier', purchases: 'Purchase',
  cattle_purchases: 'Cattle purchase', supplier_payments: 'Supplier payment', payments: 'Payment',
  bank_accounts: 'Account', bank_transactions: 'Cash movement', cash_counts: 'Cash count',
  expenses: 'Expense', checks: 'Cheque', loans: 'Loan', loan_transactions: 'Loan entry',
  branches: 'Branch', app_settings: 'Settings', sms_senders: 'SMS sender',
  staff: 'Staff', store_checks: 'Store check', inventory_snapshots: 'Stock value',
}
const VERB: Record<string, string> = { insert: 'Created', update: 'Updated', delete: 'Deleted' }
const CAT_STYLE: Record<string, string> = {
  Daily: 'bg-sky-100 text-sky-700', Stock: 'bg-amber-100 text-amber-700',
  People: 'bg-violet-100 text-violet-700', Money: 'bg-emerald-100 text-emerald-700',
  Setup: 'bg-slate-200 text-slate-600', Other: 'bg-slate-100 text-slate-500',
}

const NAME_KEYS = ['name', 'party_name', 'payee', 'source_label', 'description', 'label', 'business_name', 'from_number', 'check_no']
const MONEY_KEYS = ['amount', 'total_cost', 'counted', 'price', 'opening_balance']

function detail(row: Record<string, unknown> | null): string {
  if (!row) return ''
  const parts: string[] = []
  for (const k of NAME_KEYS) if (row[k]) { parts.push(String(row[k])); break }
  for (const k of MONEY_KEYS) if (row[k] != null && Number(row[k]) !== 0) { parts.push(money(Number(row[k]))); break }
  if (row.status) parts.push(String(row.status))
  return parts.join(' · ')
}

export function Audit() {
  const now = new Date()
  const [period, setPeriod] = useState<'daily' | 'monthly' | 'historical'>('daily')
  const [day, setDay] = useState(today())
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [histYear, setHistYear] = useState(now.getFullYear())
  const [category, setCategory] = useState('All')
  const [rows, setRows] = useState<Audit[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // map of user id → display name (full_name), so the trail shows names not emails
  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, full_name')
      .then(({ data }) => {
        const m: Record<string, string> = {}
        for (const p of (data ?? []) as { id: string; full_name: string | null }[]) {
          if (p.full_name) m[p.id] = p.full_name
        }
        setNames(m)
      })
  }, [])

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      let from: string, to: string
      if (period === 'daily') {
        from = day
        to = day
      } else if (period === 'monthly') {
        const r = monthRange(year, month)
        from = r.from
        to = r.to
      } else {
        const r = yearRange(histYear)
        from = r.from
        to = r.to
      }
      let q = supabase
        .from('audit_log')
        .select('id, occurred_at, actor, actor_email, action, category, entity, row_data')
        .gte('occurred_at', `${from}T00:00:00`)
        .lte('occurred_at', `${to}T23:59:59.999`)
        .order('occurred_at', { ascending: false })
        .limit(1000)
      if (category !== 'All') q = q.eq('category', category)
      const { data, error } = await q
      if (error) setError(error.message)
      else setRows((data ?? []) as Audit[])
      setLoading(false)
    }
    load()
  }, [period, day, year, month, histYear, category])

  return (
    <div>
      <PageHeader
        title="Audit Trail"
        action={
          <div className="flex rounded-lg border border-slate-300 p-0.5 text-sm">
            {(['daily', 'monthly', 'historical'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`rounded-md px-3 py-1 font-medium capitalize ${period === p ? 'bg-rose-600 text-white' : 'text-slate-600'}`}
              >
                {p}
              </button>
            ))}
          </div>
        }
      />
      <p className="mb-3 text-sm text-slate-500">Every change made in the system, by area and over time.</p>

      {/* period picker */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {period === 'daily' && <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="w-44" />}
        {period === 'monthly' && (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                const n = addMonth(year, month, -1)
                setYear(n.year)
                setMonth(n.month)
              }}
            >
              ‹
            </Button>
            <span className="min-w-32 text-center text-sm font-semibold text-slate-700">{monthLabel(year, month)}</span>
            <Button
              variant="ghost"
              onClick={() => {
                const n = addMonth(year, month, 1)
                setYear(n.year)
                setMonth(n.month)
              }}
            >
              ›
            </Button>
          </div>
        )}
        {period === 'historical' && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => setHistYear((y) => y - 1)}>
              ‹
            </Button>
            <span className="min-w-20 text-center text-sm font-semibold text-slate-700">{histYear}</span>
            <Button variant="ghost" onClick={() => setHistYear((y) => y + 1)}>
              ›
            </Button>
          </div>
        )}
      </div>

      {/* category tabs */}
      <div className="mb-3 flex flex-wrap gap-1">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${category === c ? 'bg-rose-50 text-rose-700' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            {c}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-3">
          <Banner kind="error">{error}</Banner>
        </div>
      )}

      <Card>
        {loading ? (
          <div className="py-8 text-center text-slate-400">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-slate-400">No changes logged for this period.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="py-2 pr-3">When</th>
                  <th className="py-2 pr-3">Area</th>
                  <th className="py-2 pr-3">Change</th>
                  <th className="py-2 pr-3">Detail</th>
                  <th className="py-2 pr-3">By</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-3 whitespace-nowrap tabular-nums text-slate-500">
                      {new Date(r.occurred_at).toLocaleString()}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${CAT_STYLE[r.category] ?? CAT_STYLE.Other}`}>
                        {r.category}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-slate-800">
                      {VERB[r.action] ?? r.action} {ENTITY_LABEL[r.entity] ?? r.entity}
                    </td>
                    <td className="py-2 pr-3 text-slate-500">{detail(r.row_data)}</td>
                    <td className="py-2 pr-3">
                      {(() => {
                        const name = r.actor ? names[r.actor] : undefined
                        if (!name && !r.actor_email) return <span className="text-slate-400">System</span>
                        return (
                          <div className="leading-tight">
                            <div className="text-slate-600">{name || r.actor_email}</div>
                            {name && r.actor_email && <div className="text-[11px] text-slate-400">{r.actor_email}</div>}
                          </div>
                        )
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows.length >= 1000 && (
          <div className="mt-2 text-center text-xs text-slate-400">Showing the latest 1000 changes for this period.</div>
        )}
      </Card>
    </div>
  )
}
