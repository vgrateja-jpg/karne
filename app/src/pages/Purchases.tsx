import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { CattlePurchase, Product, Purchase, Supplier, SupplierBalance } from '../lib/types'
import { money, qty as fmtQty, today } from '../lib/format'
import { friendlyError } from '../lib/errors'
import { Banner, Button, Card, Field, Input, PageHeader, Select } from '../components/ui'
import { NumberInput } from '../components/NumberInput'

export function Purchases() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [balances, setBalances] = useState<SupplierBalance[]>([])
  const [cattle, setCattle] = useState<CattlePurchase[]>([])
  const [other, setOther] = useState<Purchase[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [payments, setPayments] = useState<{ id: string; paid_on: string; amount: number; supplier: { name: string } | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // new supplier
  const [supName, setSupName] = useState('')
  const [supOpening, setSupOpening] = useState<number | ''>('')

  // supplier payment
  const [paySup, setPaySup] = useState('')
  const [payAmt, setPayAmt] = useState<number | ''>('')
  const payDate = today()
  const [payAccount, setPayAccount] = useState('')
  const [accounts, setAccounts] = useState<{ id: string; name: string; type: string }[]>([])

  // cattle form
  const [cTag, setCTag] = useState('')
  const [cSup, setCSup] = useState('')
  const [cDate, setCDate] = useState(today())
  const [cWeight, setCWeight] = useState<number | ''>('')
  const [cPrice, setCPrice] = useState<number | ''>('')

  // other purchase form
  const [oSup, setOSup] = useState('')
  const [oDate, setODate] = useState(today())
  const [oName, setOName] = useState('')
  const [oQty, setOQty] = useState<number | ''>('')
  const [oUnit, setOUnit] = useState('kg')
  const [oCost, setOCost] = useState<number | ''>('')

  async function load() {
    setLoading(true)
    const [s, b, c, o, pr, a, sp] = await Promise.all([
      supabase.from('suppliers').select('*').eq('is_active', true).order('name'),
      supabase.from('v_supplier_balance').select('*').order('name'),
      supabase.from('cattle_purchases').select('*').order('purchased_on', { ascending: false }).limit(100),
      supabase.from('purchases').select('*').order('purchased_on', { ascending: false }).limit(100),
      supabase.from('products').select('*').eq('is_active', true).order('sort_order').order('name'),
      supabase.from('bank_accounts').select('id,name,type').eq('is_active', true).order('name'),
      supabase
        .from('supplier_payments')
        .select('id,paid_on,amount,supplier:suppliers(name)')
        .order('paid_on', { ascending: false })
        .limit(100),
    ])
    if (s.error) setError(s.error.message)
    else setSuppliers((s.data ?? []) as Supplier[])
    if (b.data) setBalances(b.data as SupplierBalance[])
    if (c.data) setCattle(c.data as CattlePurchase[])
    if (o.data) setOther(o.data as Purchase[])
    if (pr.data) setProducts(pr.data as Product[])
    if (sp.data) setPayments(sp.data as unknown as typeof payments)
    if (a.data) {
      const accs = a.data as { id: string; name: string; type: string }[]
      setAccounts(accs)
      setPayAccount((prev) => prev || accs.find((x) => x.type === 'cash')?.id || '')
    }
    setLoading(false)
  }
  useEffect(() => {
    load()
  }, [])

  const supName_ = (id: string | null) => suppliers.find((s) => s.id === id)?.name ?? '—'

  async function addSupplier() {
    if (!supName.trim()) return
    setBusy(true)
    const { error } = await supabase
      .from('suppliers')
      .insert({ name: supName.trim(), opening_balance: supOpening === '' ? 0 : Number(supOpening) })
    setBusy(false)
    if (error) setError(friendlyError(error.message))
    else {
      setSupName('')
      setSupOpening('')
      load()
    }
  }

  async function paySupplier() {
    setError(null)
    if (!paySup || payAmt === '' || Number(payAmt) <= 0) {
      setError('Pick a supplier and an amount.')
      return
    }
    setBusy(true)
    const { error } = await supabase
      .from('supplier_payments')
      .insert({ supplier_id: paySup, amount: Number(payAmt), paid_on: payDate, bank_account_id: payAccount || null })
    setBusy(false)
    if (error) setError(friendlyError(error.message))
    else {
      setPayAmt('')
      load()
    }
  }

  async function addCattle() {
    setError(null)
    if (cWeight === '' || cPrice === '') {
      setError('Enter weight and price per kg.')
      return
    }
    setBusy(true)
    const { error } = await supabase.from('cattle_purchases').insert({
      tag: cTag.trim() || null,
      supplier_id: cSup || null,
      purchased_on: cDate,
      weight_kg: Number(cWeight),
      price_per_kg: Number(cPrice),
    })
    setBusy(false)
    if (error) setError(friendlyError(error.message))
    else {
      setCTag('')
      setCWeight('')
      setCPrice('')
      load()
    }
  }

  async function addOther() {
    setError(null)
    if (oCost === '' || Number(oCost) <= 0) {
      setError('Enter a cost.')
      return
    }
    setBusy(true)
    const name = oName.trim()
    const wantsStock = !!name && oQty !== '' && Number(oQty) > 0
    let productId: string | null = null
    if (wantsStock) {
      // resolve the item to a product, creating it (price 0) if it's new —
      // so it appears in Prices and its quantity lands in Stock.
      const key = name.toLowerCase()
      productId = products.find((p) => p.name.trim().toLowerCase() === key)?.id ?? null
      if (!productId) {
        const ins = await supabase.from('products').insert({ name, unit: oUnit || 'kg', price: 0 }).select('id').single()
        if (ins.error) {
          setBusy(false)
          setError(friendlyError(ins.error.message))
          return
        }
        productId = (ins.data as { id: string }).id
      }
    }
    const { error } = await supabase.rpc('record_other_purchase', {
      p_supplier: oSup || null,
      p_date: oDate,
      p_description: name || null,
      p_product: productId,
      p_qty: wantsStock ? Number(oQty) : null,
      p_total_cost: Number(oCost),
    })
    setBusy(false)
    if (error) setError(friendlyError(error.message))
    else {
      setOName('')
      setOQty('')
      setOCost('')
      load()
    }
  }

  async function removeCattle(id: string) {
    if (!window.confirm('Delete this cattle purchase?')) return
    const { error } = await supabase.from('cattle_purchases').delete().eq('id', id)
    if (error) setError(friendlyError(error.message))
    else load()
  }
  async function removeOther(id: string) {
    if (!window.confirm('Delete this purchase? Any stock it added is removed too.')) return
    const { error } = await supabase.from('purchases').delete().eq('id', id)
    if (error) setError(friendlyError(error.message))
    else load()
  }
  async function removePayment(id: string) {
    if (!window.confirm('Delete this supplier payment?')) return
    const { error } = await supabase.from('supplier_payments').delete().eq('id', id)
    if (error) setError(friendlyError(error.message))
    else load()
  }

  const month = today().slice(0, 7)
  const inMonth = (d: string) => d.slice(0, 7) === month
  const cattleTotal = cWeight !== '' && cPrice !== '' ? Number(cWeight) * Number(cPrice) : 0
  const monthSpend =
    cattle.filter((c) => inMonth(c.purchased_on)).reduce((s, c) => s + Number(c.total_cost), 0) +
    other.filter((o) => inMonth(o.purchased_on)).reduce((s, o) => s + Number(o.total_cost), 0)
  const totalPayable = balances.filter((b) => b.balance > 0).reduce((s, b) => s + b.balance, 0)

  return (
    <div>
      <PageHeader
        title="Suppliers & purchases"
        action={
          <div className="text-right">
            <div className="text-xs uppercase text-slate-500">Bought this month</div>
            <div className="text-xl font-semibold tabular-nums text-slate-900">{money(monthSpend)}</div>
          </div>
        }
      />
      {error && (
        <div className="mb-3">
          <Banner kind="error">{error}</Banner>
        </div>
      )}

      {/* Supplier accounts / payables */}
      <Card className="mb-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">Supplier accounts (what you owe)</span>
          <span className="text-sm text-slate-500">
            Total payable:{' '}
            <span className="font-semibold tabular-nums text-rose-600">{money(totalPayable)}</span>
          </span>
        </div>
        {balances.length > 0 && (
          <div className="mb-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="py-2 pr-3">Supplier</th>
                  <th className="py-2 pr-3 text-right">Balance owed</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((b) => (
                  <tr key={b.supplier_id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-3 font-medium text-slate-800">{b.name}</td>
                    <td className={`py-2 pr-3 text-right tabular-nums ${b.balance > 0 ? 'text-rose-600' : 'text-slate-700'}`}>
                      {money(b.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
          {/* record payment */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:items-end">
            <Field label="Pay supplier">
              <Select value={paySup} onChange={(e) => setPaySup(e.target.value)}>
                <option value="">— pick —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Amount">
              <NumberInput value={payAmt} onChange={setPayAmt} />
            </Field>
            <Field label="Paid from">
              <Select value={payAccount} onChange={(e) => setPayAccount(e.target.value)}>
                <option value="">— (not from an account) —</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Button onClick={paySupplier} disabled={busy}>
              Pay
            </Button>
          </div>
          {/* add supplier */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field label="New supplier">
              <Input value={supName} onChange={(e) => setSupName(e.target.value)} placeholder="name" />
            </Field>
            <Field label="Opening owed">
              <NumberInput value={supOpening} onChange={setSupOpening} />
            </Field>
            <Button variant="ghost" onClick={addSupplier} disabled={busy || !supName.trim()}>
              + Add
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* cattle */}
        <Card>
          <div className="mb-2 text-sm font-medium text-slate-700">Cattle bought (live, weight × price)</div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Tag / name">
              <Input value={cTag} onChange={(e) => setCTag(e.target.value)} placeholder="optional" />
            </Field>
            <Field label="Supplier">
              <Select value={cSup} onChange={(e) => setCSup(e.target.value)}>
                <option value="">— none —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Weight (kg)">
              <NumberInput value={cWeight} onChange={setCWeight} />
            </Field>
            <Field label="Price / kg">
              <NumberInput value={cPrice} onChange={setCPrice} />
            </Field>
            <Field label="Date">
              <Input type="date" value={cDate} onChange={(e) => setCDate(e.target.value)} />
            </Field>
            <div className="flex flex-col justify-end">
              <span className="mb-1 block text-xs font-medium text-slate-600">Total</span>
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold tabular-nums">{money(cattleTotal)}</div>
            </div>
          </div>
          <div className="mt-3">
            <Button onClick={addCattle} disabled={busy}>
              + Add cattle
            </Button>
          </div>
        </Card>

        {/* other purchases */}
        <Card>
          <div className="mb-2 text-sm font-medium text-slate-700">Other stock / supplier purchases</div>
          <datalist id="other-items">
            {products.map((p) => (
              <option key={p.id} value={p.name} />
            ))}
          </datalist>
          <datalist id="other-units">
            {['kg', 'g', 'pc', 'box', 'pack', 'tray'].map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Supplier">
              <Select value={oSup} onChange={(e) => setOSup(e.target.value)}>
                <option value="">— none —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Date">
              <Input type="date" value={oDate} onChange={(e) => setODate(e.target.value)} />
            </Field>
            <Field label="Item (adds to stock)">
              <Input list="other-items" value={oName} onChange={(e) => setOName(e.target.value)} placeholder="e.g. pork, chicken" />
            </Field>
            <Field label="Quantity (optional)">
              <div className="flex gap-1">
                <NumberInput value={oQty} onChange={setOQty} className="flex-1" placeholder="qty" />
                <Input list="other-units" value={oUnit} onChange={(e) => setOUnit(e.target.value)} className="w-16" />
              </div>
            </Field>
            <Field label="Total cost">
              <NumberInput value={oCost} onChange={setOCost} />
            </Field>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Add an item + quantity to put it straight into <strong>Stock</strong>. Leave them blank to just record a cost.
          </p>
          <div className="mt-2">
            <Button onClick={addOther} disabled={busy}>
              + Add purchase
            </Button>
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <div className="mb-2 text-sm font-medium text-slate-700">Recent purchases</div>
        {loading ? (
          <div className="py-6 text-center text-slate-400">Loading…</div>
        ) : cattle.length === 0 && other.length === 0 ? (
          <div className="py-6 text-center text-sm text-slate-400">Nothing recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">What</th>
                  <th className="py-2 pr-3">Supplier</th>
                  <th className="py-2 pr-3 text-right">Cost</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {cattle.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-3 tabular-nums text-slate-500">{c.purchased_on}</td>
                    <td className="py-2 pr-3 text-slate-800">
                      🐄 Cattle{c.tag ? ` (${c.tag})` : ''}{' '}
                      <span className="text-slate-400">
                        {c.weight_kg ? `${fmtQty(c.weight_kg)}kg × ${money(c.price_per_kg)}` : ''}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-slate-500">{supName_(c.supplier_id)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{money(c.total_cost)}</td>
                    <td className="py-2 text-right">
                      <button onClick={() => removeCattle(c.id)} className="text-slate-400 hover:text-red-600" title="Delete">
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
                {other.map((o) => (
                  <tr key={o.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-3 tabular-nums text-slate-500">{o.purchased_on}</td>
                    <td className="py-2 pr-3 text-slate-800">{o.description ?? 'Purchase'}</td>
                    <td className="py-2 pr-3 text-slate-500">{supName_(o.supplier_id)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{money(o.total_cost)}</td>
                    <td className="py-2 text-right">
                      <button onClick={() => removeOther(o.id)} className="text-slate-400 hover:text-red-600" title="Delete">
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

      <Card className="mt-4">
        <div className="mb-2 text-sm font-medium text-slate-700">Recent supplier payments</div>
        {payments.length === 0 ? (
          <div className="py-4 text-center text-sm text-slate-400">No payments recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Supplier</th>
                  <th className="py-2 pr-3 text-right">Amount</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-3 tabular-nums text-slate-500">{p.paid_on}</td>
                    <td className="py-2 pr-3 text-slate-800">{p.supplier?.name ?? '—'}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{money(p.amount)}</td>
                    <td className="py-2 text-right">
                      <button onClick={() => removePayment(p.id)} className="text-slate-400 hover:text-red-600" title="Delete">
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
