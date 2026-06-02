import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { money } from '../lib/format'
import { addDays } from '../lib/dates'

interface Income {
  sales: number
  purchases: number
  expenses: number
  beginning: number
  ending: number
  beginning_manual: boolean
  ending_manual: boolean
  cogs: number
  net: number
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
  const [data, setData] = useState<Income | null>(null)
  const [cats, setCats] = useState<ExpCat[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    const [inc, ec] = await Promise.all([
      supabase.rpc('report_income', { p_from: from, p_to: to }),
      supabase.rpc('report_expenses_by_category', { p_from: from, p_to: to }),
    ])
    setData(((inc.data ?? [])[0] as Income) ?? null)
    setCats((ec.data ?? []) as ExpCat[])
    setLoading(false)
  }
  useEffect(() => {
    setLoading(true)
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to])

  if (loading) return <div className="py-4 text-center text-slate-400">Loading…</div>
  if (!data) return null

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="mb-2 text-sm font-semibold text-slate-700">Income statement</div>
      <div className="text-sm">
        <Row label="Sales (revenue)" value={money(data.sales)} strong />

        <Row label="Cost of goods sold" value="" muted border />
        <Row
          label="Beginning inventory"
          indent
          value={<InventoryValue value={data.beginning} manual={data.beginning_manual} snapDate={addDays(from, -1)} onChanged={load} />}
        />
        <Row label="+ Purchases" indent value={money(data.purchases)} />
        <Row label="+ Expenses" indent value={money(data.expenses)} />
        {cats.map((c) => (
          <div key={c.category} className="flex items-center justify-between py-0.5 pl-8 text-xs text-slate-400">
            <span>{c.category}</span>
            <span className="tabular-nums">{money(c.amount)}</span>
          </div>
        ))}
        <Row
          label="− Ending inventory"
          indent
          value={<InventoryValue value={data.ending} manual={data.ending_manual} snapDate={to} onChanged={load} />}
        />
        <Row label="= Cost of goods sold" value={money(data.cogs)} border />

        <Row
          label="Net profit"
          border
          value={<span className={data.net < 0 ? 'text-rose-600' : 'text-emerald-700'}>{money(data.net)}</span>}
          strong
        />
      </div>
      <p className="no-print mt-2 text-[11px] text-slate-400">
        Stock value is filled in automatically from your prices. Tap <span className="text-rose-600">edit</span> to type the real
        value after a stock count. Beginning inventory carries over from the previous period.
      </p>
    </div>
  )
}
