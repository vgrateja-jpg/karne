import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Loan, LoanBalance, LoanDirection } from '../lib/types'
import { money, today } from '../lib/format'
import { Banner, Button, Card, Field, Input, PageHeader, Select } from '../components/ui'
import { StatementModal, type StatementRow } from '../components/StatementModal'
import { fetchSettings } from '../lib/settings'

interface Acct {
  id: string
  name: string
  type: string
}

export function Loans() {
  const [loans, setLoans] = useState<Loan[]>([])
  const [balances, setBalances] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // new loan
  const [party, setParty] = useState('')
  const [direction, setDirection] = useState<LoanDirection>('payable')
  const [notes, setNotes] = useState('')

  // record transaction
  const [loanId, setLoanId] = useState('')
  const [txType, setTxType] = useState<'principal' | 'interest' | 'payment' | 'adjustment'>('principal')
  const [txAmt, setTxAmt] = useState<number | ''>('')
  const [txDate, setTxDate] = useState(today())
  const [txAccount, setTxAccount] = useState('')

  const [accounts, setAccounts] = useState<Acct[]>([])
  const [businessName, setBusinessName] = useState('')

  // loan ledger
  const [stmt, setStmt] = useState<{ id: string; party: string } | null>(null)
  const [stmtRows, setStmtRows] = useState<StatementRow[]>([])
  const [stmtLoading, setStmtLoading] = useState(false)

  useEffect(() => {
    fetchSettings().then((s) => setBusinessName(s?.business_name ?? ''))
  }, [])

  async function openLedger(id: string, party: string) {
    setStmt({ id, party })
    setStmtLoading(true)
    setStmtRows([])
    const { data } = await supabase.rpc('loan_ledger', { p_loan: id })
    setStmtRows(
      ((data ?? []) as { entry_date: string; kind: string; amount: number; running: number }[]).map((r) => ({
        date: r.entry_date,
        label: r.kind,
        amount: Number(r.amount),
        running: Number(r.running),
      })),
    )
    setStmtLoading(false)
  }

  async function load() {
    setLoading(true)
    const [l, b, a] = await Promise.all([
      supabase.from('loans').select('*').eq('is_active', true).order('party_name'),
      supabase.from('v_loan_balance').select('loan_id,balance'),
      supabase.from('bank_accounts').select('id,name,type').eq('is_active', true).order('name'),
    ])
    if (l.error) setError(l.error.message)
    else setLoans((l.data ?? []) as Loan[])
    if (b.data) {
      const map: Record<string, number> = {}
      for (const r of b.data as LoanBalance[]) map[r.loan_id] = r.balance
      setBalances(map)
    }
    if (a.data) {
      setAccounts(a.data as Acct[])
      setTxAccount((prev) => prev || (a.data as Acct[]).find((x) => x.type === 'cash')?.id || '')
    }
    setLoading(false)
  }
  useEffect(() => {
    load()
  }, [])

  async function addLoan() {
    if (!party.trim()) return
    setBusy(true)
    const { error } = await supabase
      .from('loans')
      .insert({ party_name: party.trim(), direction, notes: notes.trim() || null })
    setBusy(false)
    if (error) setError(error.message)
    else {
      setParty('')
      setNotes('')
      load()
    }
  }

  async function recordTxn() {
    setError(null)
    if (!loanId || txAmt === '' || Number(txAmt) <= 0) {
      setError('Pick a loan and an amount.')
      return
    }
    setBusy(true)
    const linksCash = txType === 'principal' || txType === 'payment'
    const { error } = await supabase
      .from('loan_transactions')
      .insert({
        loan_id: loanId,
        type: txType,
        amount: Number(txAmt),
        txn_on: txDate,
        bank_account_id: linksCash ? txAccount || null : null,
      })
    setBusy(false)
    if (error) setError(error.message)
    else {
      setTxAmt('')
      load()
    }
  }

  const payable = loans.filter((l) => l.direction === 'payable').reduce((s, l) => s + (balances[l.id] ?? 0), 0)
  const receivable = loans.filter((l) => l.direction === 'receivable').reduce((s, l) => s + (balances[l.id] ?? 0), 0)

  return (
    <div>
      <div className={stmt ? 'no-print-when-modal' : undefined}>
      <PageHeader title="Loans & financing" />
      {error && (
        <div className="mb-3">
          <Banner kind="error">{error}</Banner>
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3">
        <Card>
          <div className="text-xs uppercase text-slate-500">You owe (payable)</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-rose-600">{money(payable)}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase text-slate-500">Owed to you (receivable)</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-emerald-600">{money(receivable)}</div>
        </Card>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* add loan */}
        <Card>
          <div className="mb-2 text-sm font-medium text-slate-700">Add a loan</div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Party (person/bank)">
              <Input value={party} onChange={(e) => setParty(e.target.value)} />
            </Field>
            <Field label="Direction">
              <Select value={direction} onChange={(e) => setDirection(e.target.value as LoanDirection)}>
                <option value="payable">You borrowed (payable)</option>
                <option value="receivable">You lent (receivable)</option>
              </Select>
            </Field>
            <div className="col-span-2">
              <Field label="Notes (e.g. interest terms)">
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="optional" />
              </Field>
            </div>
          </div>
          <div className="mt-3">
            <Button onClick={addLoan} disabled={busy || !party.trim()}>
              + Add loan
            </Button>
          </div>
        </Card>

        {/* record transaction */}
        <Card>
          <div className="mb-2 text-sm font-medium text-slate-700">Record on a loan</div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Loan">
              <Select value={loanId} onChange={(e) => setLoanId(e.target.value)}>
                <option value="">— pick —</option>
                {loans.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.party_name} ({l.direction})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Type">
              <Select value={txType} onChange={(e) => setTxType(e.target.value as typeof txType)}>
                <option value="principal">Principal (+)</option>
                <option value="interest">Interest (+)</option>
                <option value="payment">Payment (−)</option>
                <option value="adjustment">Adjustment (+)</option>
              </Select>
            </Field>
            <Field label="Amount">
              <Input type="number" step="0.01" min="0" value={txAmt} onChange={(e) => setTxAmt(e.target.value === '' ? '' : Number(e.target.value))} />
            </Field>
            <Field label="Date">
              <Input type="date" value={txDate} onChange={(e) => setTxDate(e.target.value)} />
            </Field>
            <div className="col-span-2">
              <Field label="Cash/bank account (for principal & payments)">
                <Select value={txAccount} onChange={(e) => setTxAccount(e.target.value)}>
                  <option value="">— none (don't move cash) —</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Borrowing adds the money to the account; a payment takes it out. Interest/adjustments don't move cash.
          </p>
          <div className="mt-3">
            <Button onClick={recordTxn} disabled={busy}>
              Record
            </Button>
          </div>
        </Card>
      </div>

      <Card>
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-sm font-medium text-slate-700">Loans</span>
          <span className="no-print text-xs text-slate-400">tap a loan for its ledger</span>
        </div>
        {loading ? (
          <div className="py-6 text-center text-slate-400">Loading…</div>
        ) : loans.length === 0 ? (
          <div className="py-6 text-center text-sm text-slate-400">No loans yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="py-2 pr-3">Party</th>
                  <th className="py-2 pr-3">Direction</th>
                  <th className="py-2 pr-3">Notes</th>
                  <th className="py-2 pr-3 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {loans.map((l) => (
                  <tr
                    key={l.id}
                    onClick={() => openLedger(l.id, l.party_name)}
                    className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50"
                  >
                    <td className="py-2 pr-3 font-medium text-slate-800">{l.party_name}</td>
                    <td className="py-2 pr-3 text-slate-500">{l.direction === 'payable' ? 'You owe' : 'Owed to you'}</td>
                    <td className="py-2 pr-3 text-slate-500">{l.notes ?? '—'}</td>
                    <td className={`py-2 pr-3 text-right tabular-nums ${l.direction === 'payable' ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {money(balances[l.id] ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      </div>

      {stmt && (
        <StatementModal
          title={`Loan ledger — ${stmt.party}`}
          businessName={businessName}
          rows={stmtRows}
          loading={stmtLoading}
          closingLabel="Balance"
          onClose={() => setStmt(null)}
        />
      )}
    </div>
  )
}
