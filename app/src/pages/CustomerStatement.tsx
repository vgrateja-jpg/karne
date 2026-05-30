import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Customer } from '../lib/types'
import { money, today } from '../lib/format'
import { Banner, Button, Card, Field, Input, PageHeader, Select } from '../components/ui'

interface LedgerEntry {
  entry_date: string | null
  kind: 'opening' | 'order' | 'payment'
  label: string
  charge: number
  payment: number
}

interface LedgerRow extends LedgerEntry {
  balance: number
}

export function CustomerStatement() {
  const { id } = useParams<{ id: string }>()
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [rows, setRows] = useState<LedgerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // record-payment form
  const [amount, setAmount] = useState<number | ''>('')
  const [paidAt, setPaidAt] = useState(today())
  const [method, setMethod] = useState('cash')
  const [busy, setBusy] = useState(false)
  const [ok, setOk] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    const [cust, led] = await Promise.all([
      supabase.from('customers').select('*').eq('id', id).single(),
      supabase.rpc('customer_ledger', { p_customer: id }),
    ])
    if (cust.error) setError(cust.error.message)
    else setCustomer(cust.data as Customer)
    if (led.error) setError(led.error.message)
    else {
      let running = 0
      const computed = (led.data as LedgerEntry[]).map((e) => {
        running += Number(e.charge) - Number(e.payment)
        return { ...e, balance: running }
      })
      setRows(computed)
    }
    setLoading(false)
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  async function recordPayment(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setOk(null)
    if (!id || amount === '' || Number(amount) <= 0) {
      setError('Enter a payment amount greater than 0.')
      return
    }
    setBusy(true)
    const { error } = await supabase.from('payments').insert({
      customer_id: id,
      paid_at: paidAt,
      amount: Number(amount),
      method,
    })
    setBusy(false)
    if (error) setError(error.message)
    else {
      setOk('Payment recorded.')
      setAmount('')
      load()
    }
  }

  const balance = rows.length ? rows[rows.length - 1].balance : (customer?.opening_balance ?? 0)

  return (
    <div>
      <PageHeader
        title={customer ? customer.name : 'Customer'}
        action={
          <Link to="/customers">
            <Button variant="ghost">← All customers</Button>
          </Link>
        }
      />
      {error && (
        <div className="mb-3">
          <Banner kind="error">{error}</Banner>
        </div>
      )}

      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <div className="text-xs uppercase text-slate-500">Balance owed</div>
          <div className={`mt-1 text-2xl font-semibold tabular-nums ${balance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
            {money(balance)}
          </div>
        </Card>
        <Card className="md:col-span-2">
          <div className="mb-2 text-sm font-medium text-slate-700">Record a payment</div>
          <form onSubmit={recordPayment} className="grid grid-cols-1 gap-3 sm:grid-cols-4 sm:items-end">
            <Field label="Amount">
              <Input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
              />
            </Field>
            <Field label="Date">
              <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
            </Field>
            <Field label="Method">
              <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="cash">Cash</option>
                <option value="bank">Bank</option>
                <option value="gcash">GCash</option>
                <option value="check">Check</option>
              </Select>
            </Field>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Record'}
            </Button>
          </form>
          {ok && <div className="mt-2 text-sm text-emerald-600">{ok}</div>}
        </Card>
      </div>

      <Card>
        <div className="mb-2 text-sm font-medium text-slate-700">Statement</div>
        {loading ? (
          <div className="py-8 text-center text-slate-400">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-slate-400">No activity yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Description</th>
                  <th className="py-2 pr-3 text-right">Charge</th>
                  <th className="py-2 pr-3 text-right">Payment</th>
                  <th className="py-2 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-3 tabular-nums text-slate-500">{r.entry_date ?? '—'}</td>
                    <td className="py-2 pr-3 text-slate-800">{r.label}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{r.charge ? money(r.charge) : ''}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-emerald-600">
                      {r.payment ? money(r.payment) : ''}
                    </td>
                    <td className="py-2 text-right tabular-nums font-medium">{money(r.balance)}</td>
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
