import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { money } from '../lib/format'
import { addDays } from '../lib/dates'

interface Channel {
  sales_store: number
  sales_delivery: number
  purchases: number
  expenses_store: number
  expenses_delivery: number
  expenses_shared: number
  beginning: number
  ending: number
  beginning_manual: boolean
  ending_manual: boolean
}
interface ExpCat {
  category: string
  amount: number
}

// One inventory figure with an inline editor + "auto / counted" tag.
function InventoryValue({
  value,
  manual,
  snapDate,
  onChanged,
}: {
  value: number
  manual: boolean
  snapDate: string
  onChanged: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    if (draft === '' || isNaN(Number(draft))) return
    setBusy(true)
    await supabase.from('inventory_snapshots').upsert({ snap_date: snapDate, value: Number(draft) }, { onConflict: 'snap_date' })
    setBusy(false)
    setEditing(false)
    onChanged()
  }
  async function clear() {
    setBusy(true)
    await supabase.from('inventory_snapshots').delete().eq('snap_date', snapDate)
    setBusy(false)
    setEditing(false)
    onChanged()
  }

  if (editing) {
    return (
      <span className="no-print inline-flex items-center gap-1">
        <input
          type="number"
          step="0.01"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="w-28 rounded border border-slate-300 px-2 py-0.5 text-right text-sm tabular-nums"
        />
        <button onClick={save} disabled={busy} className="text-emerald-600 hover:text-emerald-700" title="Save">
          ✓
        </button>
        {manual && (
          <button onClick={clear} disabled={busy} className="text-slate-400 hover:text-slate-600" title="Back to automatic">
            auto
          </button>
        )}
        <button onClick={() => setEditing(false)} className="text-slate-400 hover:text-red-600" title="Cancel">
          ✕
        </button>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="tabular-nums">{money(value)}</span>
      <span className={`rounded px-1 text-[10px] ${manual ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-400'}`}>
        {manual ? 'counted' : 'auto'}
      </span>
      <button
        onClick={() => {
          setDraft(String(value))
          setEditing(true)
        }}
        className="no-print text-xs text-rose-600 hover:underline"
      >
        edit
      </button>
    </span>
  )
}

function Row({
  label,
  value,
  indent,
  strong,
  border,
  muted,
}: {
  label: ReactNode
  value: ReactNode
  indent?: boolean
  strong?: boolean
  border?: boolean
  muted?: boolean
}) {
  return (
    <div
      className={`flex items-center justify-between py-1 ${border ? 'border-t border-slate-200 mt-1 pt-1.5' : ''} ${
        strong ? 'font-semibold text-slate-900' : muted ? 'text-slate-500' : 'text-slate-700'
      }`}
    >
      <span className={indent ? 'pl-4' : ''}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}

export function IncomeStatement({ from, to }: { from: string; to: string }) {
  const [d, setD] = useState<Channel | null>(null)
  const [cats, setCats] = useState<ExpCat[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'combined' | 'byside'>('combined')

  async function load() {
    const [inc, ec] = await Promise.all([
      supabase.rpc('report_income_channel', { p_from: from, p_to: to }),
      supabase.rpc('report_expenses_by_category', { p_from: from, p_to: to }),
    ])
    setD(((inc.data ?? [])[0] as Channel) ?? null)
    setCats((ec.data ?? []) as ExpCat[])
    setLoading(false)
  }
  useEffect(() => {
    setLoading(true)
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to])

  if (loading) return <div className="py-4 text-center text-slate-400">Loading…</div>
  if (!d) return null

  const begSnap = addDays(from, -1)
  // Combined totals
  const sales = d.sales_store + d.sales_delivery
  const expensesTotal = d.expenses_store + d.expenses_delivery + d.expenses_shared
  const cogs = d.beginning + d.purchases + expensesTotal - d.ending
  const net = sales - cogs
  // By-side allocation (meat cost + shared expenses split by share of sales)
  const storeShare = sales > 0 ? d.sales_store / sales : 0
  const delivShare = sales > 0 ? d.sales_delivery / sales : 0
  const meatCost = d.beginning + d.purchases - d.ending
  const col = {
    store: {
      sales: d.sales_store,
      meat: meatCost * storeShare,
      exp: d.expenses_store + d.expenses_shared * storeShare,
    },
    deliv: {
      sales: d.sales_delivery,
      meat: meatCost * delivShare,
      exp: d.expenses_delivery + d.expenses_shared * delivShare,
    },
    total: { sales, meat: meatCost, exp: expensesTotal },
  }
  const netOf = (c: { sales: number; meat: number; exp: number }) => c.sales - c.meat - c.exp

  const Toggle = (
    <div className="no-print flex rounded-lg border border-slate-300 p-0.5 text-xs">
      {(['combined', 'byside'] as const).map((v) => (
        <button
          key={v}
          onClick={() => setView(v)}
          className={`rounded-md px-2.5 py-1 font-medium ${view === v ? 'bg-rose-600 text-white' : 'text-slate-600'}`}
        >
          {v === 'combined' ? 'Combined' : 'Store vs Delivery'}
        </button>
      ))}
    </div>
  )

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-700">Income statement</span>
        {Toggle}
      </div>

      {view === 'combined' ? (
        <div className="text-sm">
          <Row label="Sales (revenue)" value={money(sales)} strong />
          <Row label="Cost of goods sold" value="" muted border />
          <Row
            label="Beginning inventory"
            indent
            value={<InventoryValue value={d.beginning} manual={d.beginning_manual} snapDate={begSnap} onChanged={load} />}
          />
          <Row label="+ Purchases" indent value={money(d.purchases)} />
          <Row label="+ Expenses" indent value={money(expensesTotal)} />
          {cats.map((c) => (
            <div key={c.category} className="flex items-center justify-between py-0.5 pl-8 text-xs text-slate-400">
              <span>{c.category}</span>
              <span className="tabular-nums">{money(c.amount)}</span>
            </div>
          ))}
          <Row
            label="− Ending inventory"
            indent
            value={<InventoryValue value={d.ending} manual={d.ending_manual} snapDate={to} onChanged={load} />}
          />
          <Row label="= Cost of goods sold" value={money(cogs)} border />
          <Row
            label="Net profit"
            border
            strong
            value={<span className={net < 0 ? 'text-rose-600' : 'text-emerald-700'}>{money(net)}</span>}
          />
          <p className="no-print mt-2 text-[11px] text-slate-400">
            Stock value is filled in automatically from your prices. Tap <span className="text-rose-600">edit</span> to type the
            real value after a stock count. Beginning inventory carries over from the previous period.
          </p>
        </div>
      ) : (
        <div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <th className="py-1.5 text-left font-medium"></th>
                <th className="py-1.5 text-right font-medium">Store</th>
                <th className="py-1.5 text-right font-medium">Delivery</th>
                <th className="py-1.5 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              <tr>
                <td className="py-1 text-slate-700">Sales</td>
                <td className="py-1 text-right">{money(col.store.sales)}</td>
                <td className="py-1 text-right">{money(col.deliv.sales)}</td>
                <td className="py-1 text-right">{money(col.total.sales)}</td>
              </tr>
              <tr className="text-slate-500">
                <td className="py-1">− Cost of meat sold</td>
                <td className="py-1 text-right">{money(col.store.meat)}</td>
                <td className="py-1 text-right">{money(col.deliv.meat)}</td>
                <td className="py-1 text-right">{money(col.total.meat)}</td>
              </tr>
              <tr className="border-t border-slate-100 font-medium text-slate-800">
                <td className="py-1">= Gross profit</td>
                <td className="py-1 text-right">{money(col.store.sales - col.store.meat)}</td>
                <td className="py-1 text-right">{money(col.deliv.sales - col.deliv.meat)}</td>
                <td className="py-1 text-right">{money(col.total.sales - col.total.meat)}</td>
              </tr>
              <tr className="text-slate-500">
                <td className="py-1">− Expenses</td>
                <td className="py-1 text-right">{money(col.store.exp)}</td>
                <td className="py-1 text-right">{money(col.deliv.exp)}</td>
                <td className="py-1 text-right">{money(col.total.exp)}</td>
              </tr>
              <tr className="border-t border-slate-200 font-semibold">
                <td className="py-1.5 text-slate-900">Net profit</td>
                {[netOf(col.store), netOf(col.deliv), netOf(col.total)].map((n, i) => (
                  <td key={i} className={`py-1.5 text-right ${n < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                    {money(n)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>

          <div className="no-print mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 pt-2 text-xs text-slate-500">
            <span>Shared stock value —</span>
            <span className="flex items-center gap-1">
              Beginning: <InventoryValue value={d.beginning} manual={d.beginning_manual} snapDate={begSnap} onChanged={load} />
            </span>
            <span className="flex items-center gap-1">
              Ending: <InventoryValue value={d.ending} manual={d.ending_manual} snapDate={to} onChanged={load} />
            </span>
          </div>
          <p className="no-print mt-1 text-[11px] text-slate-400">
            <strong>Store</strong> = walk-in / counter sales. <strong>Delivery</strong> = Rustica and other accounts. The shared
            meat cost and any expenses marked “Shared” are split between the two sides by each side's share of sales. Mark each
            expense Store / Delivery / Shared under <strong>Expenses</strong>.
          </p>
        </div>
      )}
    </div>
  )
}
