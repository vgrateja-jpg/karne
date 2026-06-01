import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Customer } from '../lib/types'
import { fetchSettings, type AppSettings } from '../lib/settings'
import { money, today } from '../lib/format'
import { Banner, Button, Card, Field, Input, PageHeader, Select } from '../components/ui'

interface Entry {
  entry_id: string | null
  entry_date: string | null
  kind: 'opening' | 'order' | 'charge' | 'payment'
  label: string
  charge: number
  payment: number
}
interface Row extends Entry {
  balance: number
}

export function CustomerStatement() {
  const { id } = useParams<{ id: string }>()
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // payment form
  const [payAmount, setPayAmount] = useState<number | ''>('')
  const [paidAt, setPaidAt] = useState(today())
  const [method, setMethod] = useState('cash')
  // charge form
  const [chargeAmount, setChargeAmount] = useState<number | ''>('')
  const [chargedOn, setChargedOn] = useState(today())
  const [chargeDesc, setChargeDesc] = useState('')
  const [busy, setBusy] = useState(false)
  const [ok, setOk] = useState<string | null>(null)

  // table controls
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('date_desc')
  const [typeFilter, setTypeFilter] = useState('all')

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    const [cust, led, s] = await Promise.all([
      supabase.from('customers').select('*').eq('id', id).single(),
      supabase.rpc('customer_ledger', { p_customer: id }),
      fetchSettings(),
    ])
    if (cust.error) setError(cust.error.message)
    else setCustomer(cust.data as Customer)
    if (led.error) setError(led.error.message)
    else setEntries((led.data as Entry[]) ?? [])
    setSettings(s)
    setLoading(false)
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  // running balance computed chronologically (entries come date-sorted from RPC)
  const chrono = useMemo<Row[]>(() => {
    let run = 0
    return entries.map((e) => {
      run += Number(e.charge) - Number(e.payment)
      return { ...e, balance: run }
    })
  }, [entries])

  const balance = chrono.length ? chrono[chrono.length - 1].balance : customer?.opening_balance ?? 0

  const display = useMemo(() => {
    let rows = chrono
    if (typeFilter === 'charges') rows = rows.filter((r) => r.kind !== 'payment')
    else if (typeFilter === 'payments') rows = rows.filter((r) => r.kind === 'payment')
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      rows = rows.filter((r) => r.label.toLowerCase().includes(q) || (r.entry_date ?? '').includes(q))
    }
    const amt = (r: Row) => Math.max(Number(r.charge), Number(r.payment))
    const sorted = [...rows]
    if (sort === 'date_desc') sorted.reverse()
    else if (sort === 'amount_desc') sorted.sort((a, b) => amt(b) - amt(a))
    else if (sort === 'amount_asc') sorted.sort((a, b) => amt(a) - amt(b))
    // date_asc = chronological (as-is)
    return sorted
  }, [chrono, search, sort, typeFilter])

  async function recordPayment(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setOk(null)
    if (payAmount === '' || Number(payAmount) <= 0) {
      setError('Enter a payment amount greater than 0.')
      return
    }
    setBusy(true)
    const { error } = await supabase
      .from('payments')
      .insert({ customer_id: id, paid_at: paidAt, amount: Number(payAmount), method })
    setBusy(false)
    if (error) setError(error.message)
    else {
      setOk('Payment recorded.')
      setPayAmount('')
      load()
    }
  }

  async function addCharge(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setOk(null)
    if (chargeAmount === '' || Number(chargeAmount) <= 0) {
      setError('Enter a charge amount greater than 0.')
      return
    }
    setBusy(true)
    const { error } = await supabase
      .from('customer_charges')
      .insert({ customer_id: id, charged_on: chargedOn, amount: Number(chargeAmount), description: chargeDesc.trim() || null })
    setBusy(false)
    if (error) setError(error.message)
    else {
      setOk('Charge added.')
      setChargeAmount('')
      setChargeDesc('')
      load()
    }
  }

  async function deleteEntry(r: Row) {
    if (r.kind === 'order') {
      setError('Open the order itself to change or delete it.')
      return
    }
    if (r.kind === 'opening') {
      setError('Change the opening balance by editing the customer.')
      return
    }
    if (!r.entry_id) return
    if (!window.confirm('Delete this entry?')) return
    setError(null)
    const table = r.kind === 'payment' ? 'payments' : 'customer_charges'
    const { error } = await supabase.from(table).delete().eq('id', r.entry_id)
    if (error) setError(error.message)
    else load()
  }

  if (loading) return <div className="py-10 text-center text-slate-400">Loading…</div>

  return (
    <div>
      <PageHeader
        title={customer ? customer.name : 'Customer'}
        action={
          <div className="no-print flex items-center gap-2">
            <Button onClick={() => window.print()}>🖨 Print</Button>
            <Link to="/customers">
              <Button variant="ghost">← Customers</Button>
            </Link>
          </div>
        }
      />
      {error && (
        <div className="mb-3 no-print">
          <Banner kind="error">{error}</Banner>
        </div>
      )}
      {ok && (
        <div className="mb-3 no-print">
          <Banner kind="success">{ok}</Banner>
        </div>
      )}

      {/* print-only statement header */}
      <div className="mb-4 hidden text-center print:block">
        <div className="text-xl font-bold text-slate-900">{settings?.business_name}</div>
        <div className="text-sm text-slate-600">Statement of account — {customer?.name}</div>
        <div className="text-xs text-slate-500">As of {today()}</div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <div className="text-xs uppercase text-slate-500">Balance owed</div>
          <div className={`mt-1 text-2xl font-semibold tabular-nums ${balance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
            {money(balance)}
          </div>
        </Card>

        {/* record payment */}
        <Card className="no-print">
          <div className="mb-2 text-sm font-medium text-slate-700">Record a payment</div>
          <form onSubmit={recordPayment} className="grid grid-cols-2 gap-2 sm:items-end">
            <Field label="Amount">
              <Input
                type="number"
                step="0.01"
                min="0"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value === '' ? '' : Number(e.target.value))}
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
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setPayAmount(Number(balance.toFixed(2)))} title="Pay the full balance">
                Pay full
              </Button>
              <Button type="submit" disabled={busy}>
                Record
              </Button>
            </div>
          </form>
        </Card>

        {/* add charge */}
        <Card className="no-print">
          <div className="mb-2 text-sm font-medium text-slate-700">Add a charge</div>
          <form onSubmit={addCharge} className="grid grid-cols-2 gap-2 sm:items-end">
            <Field label="Amount">
              <Input
                type="number"
                step="0.01"
                min="0"
                value={chargeAmount}
                onChange={(e) => setChargeAmount(e.target.value === '' ? '' : Number(e.target.value))}
              />
            </Field>
            <Field label="Date">
              <Input type="date" value={chargedOn} onChange={(e) => setChargedOn(e.target.value)} />
            </Field>
            <div className="col-span-2">
              <Field label="Description">
                <Input value={chargeDesc} onChange={(e) => setChargeDesc(e.target.value)} placeholder="e.g. extra delivery" />
              </Field>
            </div>
            <div className="col-span-2">
              <Button type="submit" disabled={busy}>
                Add charge
              </Button>
            </div>
          </form>
        </Card>
      </div>

      {/* search / sort / filter */}
      <div className="no-print mb-3 flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-48">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Search entries…" />
        </div>
        <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-40">
          <option value="all">All entries</option>
          <option value="charges">Charges only</option>
          <option value="payments">Payments only</option>
        </Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value)} className="w-48">
          <option value="date_desc">Newest first</option>
          <option value="date_asc">Oldest first</option>
          <option value="amount_desc">Amount: high → low</option>
          <option value="amount_asc">Amount: low → high</option>
        </Select>
      </div>

      <Card className="print-area">
        <div className="mb-2 text-sm font-medium text-slate-700">Ledger</div>
        {display.length === 0 ? (
          <div className="py-8 text-center text-slate-400">No entries{search ? ' match your search.' : ' yet.'}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Description</th>
                  <th className="py-2 pr-3 text-right">Charge</th>
                  <th className="py-2 pr-3 text-right">Payment</th>
                  <th className="py-2 pr-3 text-right">Balance</th>
                  <th className="py-2 w-8 no-print"></th>
                </tr>
              </thead>
              <tbody>
                {display.map((r, i) => (
                  <tr key={r.entry_id ?? `op-${i}`} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-3 tabular-nums text-slate-500">{r.entry_date ?? '—'}</td>
                    <td className="py-2 pr-3 text-slate-800">{r.label}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{r.charge ? money(r.charge) : ''}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-emerald-600">{r.payment ? money(r.payment) : ''}</td>
                    <td className="py-2 pr-3 text-right tabular-nums font-medium">{money(r.balance)}</td>
                    <td className="py-2 text-right no-print">
                      {(r.kind === 'payment' || r.kind === 'charge') && (
                        <button onClick={() => deleteEntry(r)} className="text-slate-400 hover:text-red-600" title="Delete entry">
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 font-semibold">
                  <td className="py-2 pr-3" colSpan={4}>
                    Balance owed
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{money(balance)}</td>
                  <td className="no-print"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
