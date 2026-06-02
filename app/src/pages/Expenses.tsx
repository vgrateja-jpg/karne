import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { BankAccount, Expense } from '../lib/types'
import { money, today } from '../lib/format'
import { Banner, Button, Card, Field, Input, PageHeader, Select } from '../components/ui'

// common categories seen in her workbook — suggestions, not enforced
const CATEGORIES = [
  'Salaries', 'Diesel', 'LPG', 'Ice', 'Plastic/Taram', 'Karga (hauling)',
  'Electric', 'Water', 'Cellphone', 'Internet', 'Cable', 'Rent', 'Permit/BIR',
  'Insurance', 'Medicine', 'Vehicle/Repair', 'Grocery', 'Meal/Food', 'Travel', 'Other',
]

export function Expenses() {
  const [rows, setRows] = useState<Expense[]>([])
  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [spentOn, setSpentOn] = useState(today())
  const [category, setCategory] = useState('')
  const [payee, setPayee] = useState('')
  const [amount, setAmount] = useState<number | ''>('')
  const [accountId, setAccountId] = useState('')
  const [channel, setChannel] = useState<'store' | 'delivery' | 'shared'>('shared')
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    const [e, a] = await Promise.all([
      supabase.from('expenses').select('*').order('spent_on', { ascending: false }).limit(200),
      supabase.from('bank_accounts').select('*').eq('is_active', true).order('name'),
    ])
    if (e.error) setError(e.error.message)
    else setRows((e.data ?? []) as Expense[])
    if (a.data) {
      const accs = a.data as BankAccount[]
      setAccounts(accs)
      setAccountId((prev) => prev || accs.find((x) => x.type === 'cash')?.id || '')
    }
    setLoading(false)
  }
  useEffect(() => {
    load()
  }, [])

  async function add() {
    setError(null)
    if (amount === '' || Number(amount) <= 0) {
      setError('Enter an amount greater than 0.')
      return
    }
    setBusy(true)
    const { error } = await supabase.from('expenses').insert({
      spent_on: spentOn,
      category: category.trim() || null,
      payee: payee.trim() || null,
      amount: Number(amount),
      bank_account_id: accountId || null,
      channel,
    })
    setBusy(false)
    if (error) setError(error.message)
    else {
      setAmount('')
      setPayee('')
      load() // keep the chosen side, so several same-side expenses are quick to add
    }
  }

  async function setRowChannel(id: string, ch: string) {
    await supabase.from('expenses').update({ channel: ch }).eq('id', id)
    load()
  }

  const month = today().slice(0, 7)
  const monthTotal = rows
    .filter((r) => r.spent_on.slice(0, 7) === month)
    .reduce((s, r) => s + Number(r.amount), 0)
  const acctName = (id: string | null) => accounts.find((a) => a.id === id)?.name ?? '—'

  return (
    <div>
      <PageHeader
        title="Expenses"
        action={
          <div className="text-right">
            <div className="text-xs uppercase text-slate-500">This month</div>
            <div className="text-xl font-semibold tabular-nums text-slate-900">{money(monthTotal)}</div>
          </div>
        }
      />
      {error && (
        <div className="mb-3">
          <Banner kind="error">{error}</Banner>
        </div>
      )}

      <Card className="mb-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-6">
          <Field label="Date">
            <Input type="date" value={spentOn} onChange={(e) => setSpentOn(e.target.value)} />
          </Field>
          <Field label="Category">
            <Input list="exp-cats" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Diesel" />
            <datalist id="exp-cats">
              {CATEGORIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Side">
            <Select value={channel} onChange={(e) => setChannel(e.target.value as 'store' | 'delivery' | 'shared')}>
              <option value="shared">Shared</option>
              <option value="store">Store</option>
              <option value="delivery">Delivery</option>
            </Select>
          </Field>
          <Field label="Payee / note">
            <Input value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="optional" />
          </Field>
          <Field label="Amount">
            <Input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </Field>
          <Field label="Paid from">
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">— (unspecified) —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="mt-3">
          <Button onClick={add} disabled={busy}>
            {busy ? 'Saving…' : '+ Add expense'}
          </Button>
        </div>
      </Card>

      <Card>
        {loading ? (
          <div className="py-8 text-center text-slate-400">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-slate-400">No expenses yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Category</th>
                  <th className="py-2 pr-3">Side</th>
                  <th className="py-2 pr-3">Payee</th>
                  <th className="py-2 pr-3">Paid from</th>
                  <th className="py-2 pr-3 text-right">Amount</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-3 tabular-nums text-slate-500">{r.spent_on}</td>
                    <td className="py-2 pr-3 font-medium text-slate-800">{r.category ?? '—'}</td>
                    <td className="py-2 pr-3">
                      <select
                        value={r.channel ?? 'shared'}
                        onChange={(e) => setRowChannel(r.id, e.target.value)}
                        className="rounded border border-slate-200 bg-white px-1 py-0.5 text-xs text-slate-600"
                      >
                        <option value="shared">Shared</option>
                        <option value="store">Store</option>
                        <option value="delivery">Delivery</option>
                      </select>
                    </td>
                    <td className="py-2 pr-3 text-slate-500">{r.payee ?? '—'}</td>
                    <td className="py-2 pr-3 text-slate-500">{acctName(r.bank_account_id)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{money(r.amount)}</td>
                    <td className="py-2 text-right">
                      <button
                        onClick={async () => {
                          await supabase.from('expenses').delete().eq('id', r.id)
                          load()
                        }}
                        className="text-slate-400 hover:text-red-600"
                        title="Delete"
                      >
                        ✕
                      </button>
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
