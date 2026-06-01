import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { money, today } from '../lib/format'
import { Banner, Button, Card, Field, Input, PageHeader } from '../components/ui'

interface CountRow {
  id: string
  count_date: string
  expected: number | null
  counted: number
  notes: string | null
}

export function CashCount() {
  const [date, setDate] = useState(today())
  const [cashSales, setCashSales] = useState(0)
  const [cashPayments, setCashPayments] = useState(0)
  const [cashExpenses, setCashExpenses] = useState(0)
  const [counted, setCounted] = useState<number | ''>('')
  const [notes, setNotes] = useState('')
  const [recent, setRecent] = useState<CountRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  async function loadDay() {
    setLoading(true)
    setError(null)
    const [ord, pay, exp, counts] = await Promise.all([
      supabase.from('orders').select('id').eq('order_date', date).is('customer_id', null).neq('status', 'void'),
      supabase.from('payments').select('amount').eq('paid_at', date).eq('method', 'cash'),
      supabase.from('expenses').select('amount').eq('spent_on', date).is('bank_account_id', null),
      supabase.from('cash_counts').select('*').order('count_date', { ascending: false }).limit(30),
    ])
    let sales = 0
    const ids = (ord.data ?? []).map((o: { id: string }) => o.id)
    if (ids.length) {
      const tot = await supabase.from('v_order_totals').select('total').in('order_id', ids)
      sales = (tot.data ?? []).reduce((s, t: { total: number }) => s + Number(t.total), 0)
    }
    setCashSales(sales)
    setCashPayments((pay.data ?? []).reduce((s, p: { amount: number }) => s + Number(p.amount), 0))
    setCashExpenses((exp.data ?? []).reduce((s, e: { amount: number }) => s + Number(e.amount), 0))
    if (counts.data) setRecent(counts.data as CountRow[])
    setLoading(false)
  }
  useEffect(() => {
    loadDay()
  }, [date])

  const expected = cashSales + cashPayments - cashExpenses
  const variance = counted === '' ? 0 : Number(counted) - expected

  async function saveCount() {
    setError(null)
    setOk(null)
    if (counted === '') {
      setError('Enter the cash you counted.')
      return
    }
    setBusy(true)
    const { error } = await supabase.from('cash_counts').insert({
      count_date: date,
      expected,
      counted: Number(counted),
      notes: notes.trim() || null,
    })
    setBusy(false)
    if (error) setError(error.message)
    else {
      setOk('Cash count saved.')
      setCounted('')
      setNotes('')
      loadDay()
    }
  }

  const Row = ({ label, value, sub }: { label: string; value: number; sub?: string }) => (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-slate-600">
        {label} {sub && <span className="text-xs text-slate-400">{sub}</span>}
      </span>
      <span className="tabular-nums">{money(value)}</span>
    </div>
  )

  return (
    <div>
      <PageHeader
        title="Cash count (end of day)"
        action={<Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />}
      />
      {error && (
        <div className="mb-3">
          <Banner kind="error">{error}</Banner>
        </div>
      )}
      {ok && (
        <div className="mb-3">
          <Banner kind="success">{ok}</Banner>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <div className="mb-1 text-sm font-medium text-slate-700">What the day says you should have</div>
          {loading ? (
            <div className="py-6 text-center text-slate-400">Loading…</div>
          ) : (
            <>
              <Row label="Cash sales (walk-in)" value={cashSales} />
              <Row label="Cash collected from customers" value={cashPayments} />
              <Row label="Less: cash expenses" value={-cashExpenses} />
              <div className="mt-1 flex items-center justify-between border-t border-slate-200 pt-2 text-sm font-semibold">
                <span>Expected cash</span>
                <span className="tabular-nums">{money(expected)}</span>
              </div>
            </>
          )}
        </Card>

        <Card>
          <div className="mb-2 text-sm font-medium text-slate-700">What you actually counted</div>
          <Field label="Cash counted">
            <Input
              type="number"
              step="0.01"
              value={counted}
              onChange={(e) => setCounted(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </Field>
          <div className="mt-2">
            <Field label="Notes (optional)">
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
          <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
            <span className="text-sm text-slate-600">Difference</span>
            <span
              className={`text-lg font-semibold tabular-nums ${
                counted === '' ? 'text-slate-400' : Math.abs(variance) < 0.005 ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {counted === '' ? '—' : (variance > 0 ? '+' : '') + money(variance)}
            </span>
          </div>
          <div className="mt-3">
            <Button onClick={saveCount} disabled={busy}>
              {busy ? 'Saving…' : 'Save count'}
            </Button>
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <div className="mb-2 text-sm font-medium text-slate-700">Recent counts</div>
        {recent.length === 0 ? (
          <div className="py-4 text-center text-sm text-slate-400">No counts saved yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3 text-right">Expected</th>
                  <th className="py-2 pr-3 text-right">Counted</th>
                  <th className="py-2 pr-3 text-right">Difference</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => {
                  const diff = Number(r.counted) - Number(r.expected ?? 0)
                  return (
                    <tr key={r.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-2 pr-3 tabular-nums text-slate-500">{r.count_date}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-slate-500">{money(r.expected ?? 0)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{money(r.counted)}</td>
                      <td className={`py-2 pr-3 text-right tabular-nums ${Math.abs(diff) < 0.005 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {(diff > 0 ? '+' : '') + money(diff)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
