import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { money, today } from '../lib/format'
import { Banner, Button, Card, Field, Input, PageHeader, Select } from '../components/ui'

interface CountRow {
  id: string
  count_date: string
  expected: number | null
  counted: number
  notes: string | null
}
interface Acct {
  id: string
  name: string
  type: string
}

export function CashCount() {
  const [date, setDate] = useState(today())
  const [accounts, setAccounts] = useState<Acct[]>([])
  const [accountId, setAccountId] = useState('')
  const [expected, setExpected] = useState<number | null>(null)
  const [counted, setCounted] = useState<number | ''>('')
  const [notes, setNotes] = useState('')
  const [recent, setRecent] = useState<CountRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('bank_accounts')
      .select('id,name,type')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => {
        const accs = (data ?? []) as Acct[]
        setAccounts(accs)
        setAccountId((prev) => prev || accs.find((a) => a.type === 'cash')?.id || accs[0]?.id || '')
      })
  }, [])

  useEffect(() => {
    async function loadDay() {
      setLoading(true)
      setError(null)
      const counts = await supabase.from('cash_counts').select('*').order('count_date', { ascending: false }).limit(30)
      if (counts.data) setRecent(counts.data as CountRow[])
      if (accountId) {
        const { data, error } = await supabase.rpc('cash_expected', { p_account: accountId, p_as_of: date })
        if (error) setError(error.message)
        else setExpected(Number(data ?? 0))
      } else {
        setExpected(null)
      }
      setLoading(false)
    }
    loadDay()
  }, [date, accountId])

  const variance = counted === '' || expected === null ? 0 : Number(counted) - expected

  async function removeCount(id: string) {
    if (!window.confirm('Delete this saved count?')) return
    await supabase.from('cash_counts').delete().eq('id', id)
    setRecent((prev) => prev.filter((r) => r.id !== id))
  }

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
      expected: expected ?? 0,
      counted: Number(counted),
      notes: notes.trim() || null,
    })
    setBusy(false)
    if (error) setError(error.message)
    else {
      setOk('Cash count saved.')
      setCounted('')
      setNotes('')
      // refresh recent list
      const counts = await supabase.from('cash_counts').select('*').order('count_date', { ascending: false }).limit(30)
      if (counts.data) setRecent(counts.data as CountRow[])
    }
  }

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

      {accounts.length === 0 ? (
        <Banner kind="info">Add a “Cash on hand” account under Cash &amp; Banks first, then come back to count it.</Banner>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card>
            <div className="mb-2 text-sm font-medium text-slate-700">What the books say you should have</div>
            <Field label="Cash account">
              <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3">
              <span className="text-sm text-slate-600">Computed balance (as of {date})</span>
              <span className="text-xl font-semibold tabular-nums text-slate-900">
                {loading ? '…' : money(expected ?? 0)}
              </span>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              Opening balance + cash sales + cash collected + deposits − cash expenses − cash paid to suppliers/loans. Tag
              expenses and payments as paid from this account so they're counted here.
            </p>
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
      )}

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
                  <th className="py-2"></th>
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
                      <td className="py-2 text-right">
                        <button onClick={() => removeCount(r.id)} className="text-slate-400 hover:text-red-600" title="Delete">
                          ✕
                        </button>
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
