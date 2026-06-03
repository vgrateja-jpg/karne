import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { money } from '../lib/format'
import { fetchSettings } from '../lib/settings'
import { Banner, Button, Card, Field, Input, PageHeader, Select } from '../components/ui'
import { NumberInput } from '../components/NumberInput'

interface NetWorth {
  cash: number
  inventory: number
  receivables: number
  loans_receivable: number
  payables: number
  loans_payable: number
}
interface Item {
  id: string
  kind: 'asset' | 'liability'
  name: string
  amount: number
}

function Line({ label, value, strong, border, muted }: { label: string; value: string; strong?: boolean; border?: boolean; muted?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between py-1.5 ${border ? 'mt-1 border-t border-slate-200 pt-2' : ''} ${
        strong ? 'font-semibold text-slate-900' : muted ? 'text-slate-500' : 'text-slate-700'
      }`}
    >
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}

// Editable manual asset/liability row (save when changed, or delete).
function ItemRow({ item, onChanged }: { item: Item; onChanged: () => void }) {
  const [name, setName] = useState(item.name)
  const [amount, setAmount] = useState<number | ''>(item.amount)
  const [busy, setBusy] = useState(false)
  const dirty = name !== item.name || Number(amount || 0) !== item.amount

  async function save() {
    setBusy(true)
    await supabase.from('balance_items').update({ name: name.trim() || item.name, amount: Number(amount || 0) }).eq('id', item.id)
    setBusy(false)
    onChanged()
  }
  async function remove() {
    if (!window.confirm(`Remove "${item.name}"?`)) return
    await supabase.from('balance_items').delete().eq('id', item.id)
    onChanged()
  }

  return (
    <div className="flex items-center gap-2 py-1">
      <Input value={name} onChange={(e) => setName(e.target.value)} className="flex-1" />
      <NumberInput value={amount} onChange={setAmount} className="w-32 text-right" />
      <div className="no-print flex w-16 justify-end gap-2">
        {dirty && (
          <button onClick={save} disabled={busy} className="text-emerald-600 hover:text-emerald-700" title="Save">
            ✓
          </button>
        )}
        <button onClick={remove} className="text-slate-400 hover:text-red-600" title="Remove">
          ✕
        </button>
      </div>
    </div>
  )
}

export function Equity() {
  const [nw, setNw] = useState<NetWorth | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [businessName, setBusinessName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // add-item form
  const [kind, setKind] = useState<'asset' | 'liability'>('asset')
  const [name, setName] = useState('')
  const [amount, setAmount] = useState<number | ''>('')
  const [busy, setBusy] = useState(false)

  async function load() {
    const [n, it] = await Promise.all([
      supabase.rpc('report_networth'),
      supabase.from('balance_items').select('id,kind,name,amount').eq('is_active', true).order('created_at'),
    ])
    if (n.error) setError(n.error.message)
    else setNw(((n.data ?? [])[0] as NetWorth) ?? null)
    if (it.data) setItems(it.data as Item[])
    setLoading(false)
  }
  useEffect(() => {
    fetchSettings().then((s) => setBusinessName(s?.business_name ?? ''))
    load()
  }, [])

  async function add() {
    if (!name.trim() || amount === '') return
    setBusy(true)
    const { error } = await supabase.from('balance_items').insert({ kind, name: name.trim(), amount: Number(amount) })
    setBusy(false)
    if (error) setError(error.message)
    else {
      setName('')
      setAmount('')
      load()
    }
  }

  if (loading) return <div className="py-10 text-center text-slate-400">Loading…</div>

  const manualAssets = items.filter((i) => i.kind === 'asset')
  const manualLiab = items.filter((i) => i.kind === 'liability')
  const autoAssets = nw ? nw.cash + nw.inventory + nw.receivables + nw.loans_receivable : 0
  const autoLiab = nw ? nw.payables + nw.loans_payable : 0
  const manualAssetsTotal = manualAssets.reduce((s, i) => s + Number(i.amount), 0)
  const manualLiabTotal = manualLiab.reduce((s, i) => s + Number(i.amount), 0)
  const totalAssets = autoAssets + manualAssetsTotal
  const totalLiab = autoLiab + manualLiabTotal
  const equity = totalAssets - totalLiab

  return (
    <div>
      <PageHeader
        title="Equity (net worth)"
        action={
          <Button className="no-print" onClick={() => window.print()}>
            🖨 PDF
          </Button>
        }
      />
      <div className="mb-4 hidden text-center print:block">
        <div className="text-xl font-bold text-slate-900">{businessName}</div>
        <div className="text-sm text-slate-600">Net worth</div>
      </div>
      {error && (
        <div className="mb-3">
          <Banner kind="error">{error}</Banner>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 print-area">
        {/* ASSETS */}
        <Card>
          <div className="mb-2 text-sm font-semibold text-slate-700">Assets — what you own</div>
          <div className="text-sm">
            <Line label="Cash & banks" value={money(nw?.cash ?? 0)} />
            <Line label="Inventory (at cost)" value={money(nw?.inventory ?? 0)} />
            <Line label="Receivables (customers owe)" value={money(nw?.receivables ?? 0)} />
            {!!nw?.loans_receivable && <Line label="Loans owed to you" value={money(nw.loans_receivable)} />}
            {manualAssets.length > 0 && <div className="mt-2 text-xs uppercase text-slate-400">Other assets</div>}
            {manualAssets.map((i) => (
              <ItemRow key={i.id} item={i} onChanged={load} />
            ))}
            <Line label="Total assets" value={money(totalAssets)} strong border />
          </div>
        </Card>

        {/* LIABILITIES + EQUITY */}
        <Card>
          <div className="mb-2 text-sm font-semibold text-slate-700">Liabilities — what you owe</div>
          <div className="text-sm">
            <Line label="Payables (to suppliers)" value={money(nw?.payables ?? 0)} />
            {!!nw?.loans_payable && <Line label="Loans you owe" value={money(nw.loans_payable)} />}
            {manualLiab.length > 0 && <div className="mt-2 text-xs uppercase text-slate-400">Other liabilities</div>}
            {manualLiab.map((i) => (
              <ItemRow key={i.id} item={i} onChanged={load} />
            ))}
            <Line label="Total liabilities" value={money(totalLiab)} strong border />
          </div>

          <div className="mt-4 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-3">
            <span className="text-sm font-semibold text-slate-700">Equity (net worth)</span>
            <span className={`text-2xl font-bold tabular-nums ${equity < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
              {money(equity)}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Assets − Liabilities</p>
        </Card>
      </div>

      {/* add manual item */}
      <Card className="no-print mt-4">
        <div className="mb-2 text-sm font-medium text-slate-700">Add an asset or liability</div>
        <p className="mb-3 text-xs text-slate-500">
          For things the system doesn't track — equipment, vehicles, investments, supplies (assets), or other debts (liabilities).
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_1fr_auto_auto] sm:items-end">
          <Field label="Type">
            <Select value={kind} onChange={(e) => setKind(e.target.value as 'asset' | 'liability')}>
              <option value="asset">Asset</option>
              <option value="liability">Liability</option>
            </Select>
          </Field>
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Delivery truck, Freezer, Investment" />
          </Field>
          <Field label="Value">
            <NumberInput value={amount} onChange={setAmount} className="w-32" />
          </Field>
          <Button onClick={add} disabled={busy || !name.trim() || amount === ''}>
            + Add
          </Button>
        </div>
      </Card>
    </div>
  )
}
