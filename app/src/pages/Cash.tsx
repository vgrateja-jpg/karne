import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { AccountBalance, AccountType, BankTxn } from '../lib/types'
import { money, today } from '../lib/format'
import { Banner, Button, Card, Field, Input, PageHeader, Select } from '../components/ui'

const ACCOUNT_TYPES: AccountType[] = ['cash', 'bank', 'gcash', 'coop', 'check']

export function Cash() {
  const [balances, setBalances] = useState<AccountBalance[]>([])
  const [txns, setTxns] = useState<(BankTxn & { account?: { name: string } | null })[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // add account
  const [accName, setAccName] = useState('')
  const [accType, setAccType] = useState<AccountType>('bank')
  const [accOpening, setAccOpening] = useState<number | ''>('')

  // money movement
  const [moveAcct, setMoveAcct] = useState('')
  const [moveType, setMoveType] = useState<'deposit' | 'withdrawal'>('deposit')
  const [moveAmt, setMoveAmt] = useState<number | ''>('')
  const [moveDate, setMoveDate] = useState(today())
  const [moveRef, setMoveRef] = useState('')

  // transfer
  const [fromAcct, setFromAcct] = useState('')
  const [toAcct, setToAcct] = useState('')
  const [xferAmt, setXferAmt] = useState<number | ''>('')

  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    const [b, t] = await Promise.all([
      supabase.from('v_account_balance').select('*').order('name'),
      supabase
        .from('bank_transactions')
        .select('*, account:bank_accounts(name)')
        .order('txn_on', { ascending: false })
        .limit(100),
    ])
    if (b.error) setError(b.error.message)
    else setBalances((b.data ?? []) as AccountBalance[])
    if (!t.error) setTxns((t.data ?? []) as unknown as (BankTxn & { account?: { name: string } | null })[])
    setLoading(false)
  }
  useEffect(() => {
    load()
  }, [])

  async function addAccount() {
    setError(null)
    if (!accName.trim()) return
    setBusy(true)
    const { error } = await supabase.from('bank_accounts').insert({
      name: accName.trim(),
      type: accType,
      opening_balance: accOpening === '' ? 0 : Number(accOpening),
    })
    setBusy(false)
    if (error) setError(error.message)
    else {
      setAccName('')
      setAccOpening('')
      load()
    }
  }

  async function recordMove() {
    setError(null)
    if (!moveAcct || moveAmt === '' || Number(moveAmt) <= 0) {
      setError('Pick an account and an amount.')
      return
    }
    setBusy(true)
    const signed = moveType === 'withdrawal' ? -Math.abs(Number(moveAmt)) : Math.abs(Number(moveAmt))
    const { error } = await supabase.from('bank_transactions').insert({
      bank_account_id: moveAcct,
      txn_on: moveDate,
      amount: signed,
      type: moveType,
      reference: moveRef.trim() || null,
    })
    setBusy(false)
    if (error) setError(error.message)
    else {
      setMoveAmt('')
      setMoveRef('')
      load()
    }
  }

  async function transfer() {
    setError(null)
    if (!fromAcct || !toAcct || fromAcct === toAcct || xferAmt === '' || Number(xferAmt) <= 0) {
      setError('Pick two different accounts and an amount.')
      return
    }
    setBusy(true)
    const amt = Math.abs(Number(xferAmt))
    const { error } = await supabase.from('bank_transactions').insert([
      { bank_account_id: fromAcct, txn_on: today(), amount: -amt, type: 'transfer', reference: 'transfer out' },
      { bank_account_id: toAcct, txn_on: today(), amount: amt, type: 'transfer', reference: 'transfer in' },
    ])
    setBusy(false)
    if (error) setError(error.message)
    else {
      setXferAmt('')
      load()
    }
  }

  const totalCash = balances.reduce((s, b) => s + Number(b.balance), 0)

  return (
    <div>
      <PageHeader
        title="Cash & banks"
        action={
          <div className="text-right">
            <div className="text-xs uppercase text-slate-500">Total across accounts</div>
            <div className="text-xl font-semibold tabular-nums text-slate-900">{money(totalCash)}</div>
          </div>
        }
      />
      {error && (
        <div className="mb-3">
          <Banner kind="error">{error}</Banner>
        </div>
      )}

      {/* balances */}
      <Card className="mb-4">
        <div className="mb-2 text-sm font-medium text-slate-700">Accounts</div>
        {loading ? (
          <div className="py-4 text-center text-slate-400">Loading…</div>
        ) : balances.length === 0 ? (
          <div className="py-4 text-center text-sm text-slate-400">No accounts yet — add one below.</div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {balances.map((b) => (
              <div key={b.account_id} className="rounded-lg border border-slate-200 p-3">
                <div className="text-sm font-medium text-slate-800">{b.name}</div>
                <div className="text-xs uppercase text-slate-400">{b.type}</div>
                <div className={`mt-1 text-lg font-semibold tabular-nums ${b.balance < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                  {money(b.balance)}
                </div>
              </div>
            ))}
          </div>
        )}
        {/* add account */}
        <div className="mt-4 grid grid-cols-1 gap-2 border-t border-slate-100 pt-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
          <Field label="New account name">
            <Input value={accName} onChange={(e) => setAccName(e.target.value)} placeholder="e.g. BPI 0529… / GCash / Cash on hand" />
          </Field>
          <Field label="Type">
            <Select value={accType} onChange={(e) => setAccType(e.target.value as AccountType)}>
              {ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Opening balance">
            <Input
              type="number"
              step="0.01"
              value={accOpening}
              onChange={(e) => setAccOpening(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </Field>
          <Button variant="ghost" onClick={addAccount} disabled={busy || !accName.trim()}>
            + Add account
          </Button>
        </div>
      </Card>

      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* deposit / withdraw */}
        <Card>
          <div className="mb-2 text-sm font-medium text-slate-700">Record deposit / withdrawal</div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Account">
              <Select value={moveAcct} onChange={(e) => setMoveAcct(e.target.value)}>
                <option value="">— pick —</option>
                {balances.map((b) => (
                  <option key={b.account_id} value={b.account_id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Type">
              <Select value={moveType} onChange={(e) => setMoveType(e.target.value as 'deposit' | 'withdrawal')}>
                <option value="deposit">Deposit (in)</option>
                <option value="withdrawal">Withdrawal (out)</option>
              </Select>
            </Field>
            <Field label="Amount">
              <Input type="number" step="0.01" min="0" value={moveAmt} onChange={(e) => setMoveAmt(e.target.value === '' ? '' : Number(e.target.value))} />
            </Field>
            <Field label="Date">
              <Input type="date" value={moveDate} onChange={(e) => setMoveDate(e.target.value)} />
            </Field>
          </div>
          <div className="mt-2">
            <Field label="Reference (optional)">
              <Input value={moveRef} onChange={(e) => setMoveRef(e.target.value)} />
            </Field>
          </div>
          <div className="mt-3">
            <Button onClick={recordMove} disabled={busy}>
              Record
            </Button>
          </div>
        </Card>

        {/* transfer */}
        <Card>
          <div className="mb-2 text-sm font-medium text-slate-700">Transfer between accounts</div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="From">
              <Select value={fromAcct} onChange={(e) => setFromAcct(e.target.value)}>
                <option value="">— pick —</option>
                {balances.map((b) => (
                  <option key={b.account_id} value={b.account_id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="To">
              <Select value={toAcct} onChange={(e) => setToAcct(e.target.value)}>
                <option value="">— pick —</option>
                {balances.map((b) => (
                  <option key={b.account_id} value={b.account_id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Amount">
              <Input type="number" step="0.01" min="0" value={xferAmt} onChange={(e) => setXferAmt(e.target.value === '' ? '' : Number(e.target.value))} />
            </Field>
          </div>
          <div className="mt-3">
            <Button onClick={transfer} disabled={busy}>
              Transfer
            </Button>
          </div>
        </Card>
      </div>

      {/* recent movements */}
      <Card>
        <div className="mb-2 text-sm font-medium text-slate-700">Recent movements</div>
        {txns.length === 0 ? (
          <div className="py-4 text-center text-sm text-slate-400">No movements yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Account</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Reference</th>
                  <th className="py-2 pr-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {txns.map((t) => (
                  <tr key={t.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-3 tabular-nums text-slate-500">{t.txn_on}</td>
                    <td className="py-2 pr-3 font-medium text-slate-800">{t.account?.name ?? '—'}</td>
                    <td className="py-2 pr-3 text-slate-500">{t.type}</td>
                    <td className="py-2 pr-3 text-slate-500">{t.reference ?? '—'}</td>
                    <td className={`py-2 pr-3 text-right tabular-nums ${t.amount < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {money(t.amount)}
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
