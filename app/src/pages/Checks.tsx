import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Check, CheckStatus } from '../lib/types'
import { money, today } from '../lib/format'
import { Banner, Button, Card, Field, Input, PageHeader, Select } from '../components/ui'

const STATUSES: CheckStatus[] = ['pending', 'deposited', 'cleared', 'bounced', 'cancelled']

export function Checks() {
  const [rows, setRows] = useState<Check[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [direction, setDirection] = useState<'received' | 'issued'>('received')
  const [party, setParty] = useState('')
  const [bank, setBank] = useState('')
  const [checkNo, setCheckNo] = useState('')
  const [amount, setAmount] = useState<number | ''>('')
  const [dueDate, setDueDate] = useState('')

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('checks')
      .select('*')
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(300)
    if (error) setError(error.message)
    else setRows((data ?? []) as Check[])
    setLoading(false)
  }
  useEffect(() => {
    load()
  }, [])

  async function add() {
    setError(null)
    if (amount === '' || Number(amount) <= 0) {
      setError('Enter an amount.')
      return
    }
    setBusy(true)
    const { error } = await supabase.from('checks').insert({
      direction,
      party: party.trim() || null,
      bank: bank.trim() || null,
      check_no: checkNo.trim() || null,
      amount: Number(amount),
      due_date: dueDate || null,
      status: 'pending',
    })
    setBusy(false)
    if (error) setError(error.message)
    else {
      setParty('')
      setBank('')
      setCheckNo('')
      setAmount('')
      setDueDate('')
      load()
    }
  }

  async function setStatus(id: string, status: CheckStatus) {
    const { error } = await supabase.from('checks').update({ status }).eq('id', id)
    if (error) setError(error.message)
    else setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)))
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this cheque record?')) return
    const { error } = await supabase.from('checks').delete().eq('id', id)
    if (error) setError(error.message)
    else setRows((prev) => prev.filter((r) => r.id !== id))
  }

  const pendingIn = rows
    .filter((r) => r.direction === 'received' && (r.status === 'pending' || r.status === 'deposited'))
    .reduce((s, r) => s + Number(r.amount), 0)
  const pendingOut = rows
    .filter((r) => r.direction === 'issued' && (r.status === 'pending' || r.status === 'deposited'))
    .reduce((s, r) => s + Number(r.amount), 0)

  return (
    <div>
      <PageHeader title="Cheques" />
      {error && (
        <div className="mb-3">
          <Banner kind="error">{error}</Banner>
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3">
        <Card>
          <div className="text-xs uppercase text-slate-500">Incoming (not yet cleared)</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-emerald-600">{money(pendingIn)}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase text-slate-500">Outgoing (not yet cleared)</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-rose-600">{money(pendingOut)}</div>
        </Card>
      </div>

      <Card className="mb-4">
        <div className="mb-2 text-sm font-medium text-slate-700">Add a cheque</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 lg:items-end">
          <Field label="Direction">
            <Select value={direction} onChange={(e) => setDirection(e.target.value as 'received' | 'issued')}>
              <option value="received">Received</option>
              <option value="issued">Issued</option>
            </Select>
          </Field>
          <Field label="From / to">
            <Input value={party} onChange={(e) => setParty(e.target.value)} placeholder="name" />
          </Field>
          <Field label="Bank">
            <Input value={bank} onChange={(e) => setBank(e.target.value)} placeholder="optional" />
          </Field>
          <Field label="Cheque no.">
            <Input value={checkNo} onChange={(e) => setCheckNo(e.target.value)} placeholder="optional" />
          </Field>
          <Field label="Amount">
            <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))} />
          </Field>
          <Field label="Due date">
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </div>
        <div className="mt-3">
          <Button onClick={add} disabled={busy}>
            + Add cheque
          </Button>
        </div>
      </Card>

      <Card>
        {loading ? (
          <div className="py-8 text-center text-slate-400">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400">No cheques yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="py-2 pr-3">Due</th>
                  <th className="py-2 pr-3">Dir</th>
                  <th className="py-2 pr-3">From / to</th>
                  <th className="py-2 pr-3">Cheque</th>
                  <th className="py-2 pr-3 text-right">Amount</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const overdue = r.due_date && r.due_date < today() && (r.status === 'pending' || r.status === 'deposited')
                  return (
                    <tr key={r.id} className="border-b border-slate-100 last:border-0">
                      <td className={`py-2 pr-3 tabular-nums ${overdue ? 'font-medium text-rose-600' : 'text-slate-500'}`}>
                        {r.due_date ?? '—'}
                      </td>
                      <td className="py-2 pr-3 text-slate-500">{r.direction === 'received' ? '↓ in' : '↑ out'}</td>
                      <td className="py-2 pr-3 font-medium text-slate-800">{r.party ?? '—'}</td>
                      <td className="py-2 pr-3 text-slate-500">
                        {[r.bank, r.check_no].filter(Boolean).join(' ') || '—'}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{money(r.amount)}</td>
                      <td className="py-2 pr-3">
                        <Select value={r.status} onChange={(e) => setStatus(r.id, e.target.value as CheckStatus)}>
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="py-2 text-right">
                        <button onClick={() => remove(r.id)} className="text-slate-400 hover:text-red-600" title="Delete">
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
