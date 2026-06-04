import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { money } from '../lib/format'
import { addDays } from '../lib/dates'

interface Split {
  sales_store: number
  sales_delivery: number
  purch_store: number
  purch_delivery: number
  purch_shared: number
  exp_store: number
  exp_delivery: number
  exp_shared: number
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
          type="text"
          inputMode="decimal"
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
      className={`flex items-center justify-between gap-2 py-1 ${border ? 'border-t border-slate-200 mt-1 pt-1.5' : ''} ${
        strong ? 'font-semibold text-slate-900' : muted ? 'text-slate-500' : 'text-slate-700'
      }`}
    >
      <span className={indent ? 'pl-4' : ''}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}

export function IncomeStatement({ from, to }: { from: string; to: string }) {
  const [d, setD] = useState<Split | null>(null)
  const [cats, setCats] = useState<ExpCat[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'combined' | 'byside'>('combined')

  async function load() {
    const [inc, ec] = await Promise.all([
      supabase.rpc('report_income_split', { p_from: from, p_to: to }),
      supabase.rpc('report_expenses_by_category', { p_from: from, p_to: to }),
    ])
    setD(((inc.data ?? [])[0] as Split) ?? null)
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
  const sales = d.sales_store + d.sales_delivery
  const shareStore = sales > 0 ? d.sales_store / sales : 0
  const shareDeliv = sales > 0 ? d.sales_delivery / sales : 0

  // Store (inventory method) — the shop holds the inventory.
  const storePurch = d.purch_store + d.purch_shared * shareStore
  const storeExp = d.exp_store + d.exp_shared * shareStore
  const storeCOGS = d.beginning + storePurch + storeExp - d.ending
  const storeGross = d.sales_store - storeCOGS

  // Delivery (direct) — buy & deliver, no inventory held.
  const delivCOGS = d.purch_delivery + d.purch_shared * shareDeliv
  const delivExp = d.exp_delivery + d.exp_shared * shareDeliv
  const delivNet = d.sales_delivery - delivCOGS - delivExp

  // Combined (whole business)
  const purchasesAll = d.purch_store + d.purch_delivery + d.purch_shared
  const expensesAll = d.exp_store + d.exp_delivery + d.exp_shared
  const cogs = d.beginning + purchasesAll + expensesAll - d.ending
  const net = sales - cogs

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
          <Row label="+ Purchases" indent value={money(purchasesAll)} />
          <Row label="+ Expenses" indent value={money(expensesAll)} />
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
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* STORE — inventory method */}
          <div className="rounded-lg border border-slate-200 p-3 text-sm">
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Store (walk-in)</div>
            <Row label="Sales" value={money(d.sales_store)} strong />
            <Row label="Cost of goods sold" value="" muted border />
            <Row
              label="Beginning inventory"
              indent
              value={<InventoryValue value={d.beginning} manual={d.beginning_manual} snapDate={begSnap} onChanged={load} />}
            />
            <Row label="+ Purchases" indent value={money(storePurch)} />
            <Row label="+ Expenses" indent value={money(storeExp)} />
            <Row
              label="− Ending inventory"
              indent
              value={<InventoryValue value={d.ending} manual={d.ending_manual} snapDate={to} onChanged={load} />}
            />
            <Row label="= Cost of goods sold" value={money(storeCOGS)} border />
            <Row
              label="Gross profit"
              border
              strong
              value={<span className={storeGross < 0 ? 'text-rose-600' : 'text-emerald-700'}>{money(storeGross)}</span>}
            />
          </div>

          {/* DELIVERY — direct method */}
          <div className="rounded-lg border border-slate-200 p-3 text-sm">
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Delivery</div>
            <Row label="Sales" value={money(d.sales_delivery)} strong />
            <Row label="− Cost of goods sold" value={money(delivCOGS)} />
            <Row label="− Expenses" value={money(delivExp)} />
            <Row
              label="Net profit"
              border
              strong
              value={<span className={delivNet < 0 ? 'text-rose-600' : 'text-emerald-700'}>{money(delivNet)}</span>}
            />
          </div>
        </div>
      )}

      <p className="no-print mt-2 text-[11px] text-slate-400">
        <strong>Store</strong> holds the inventory (Beginning + Purchases + Expenses − Ending = cost of goods sold).{' '}
        <strong>Delivery</strong> is buy-and-deliver (Sales − cost of goods − Expenses). Tag each sale Store/Delivery and each
        purchase/expense Store/Delivery/Shared; “Shared” is split between the two by each side's share of sales. Stock value is
        at cost — tap <span className="text-rose-600">edit</span> to type a counted figure.
      </p>
    </div>
  )
}
