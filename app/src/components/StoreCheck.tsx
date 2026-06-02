import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { money } from '../lib/format'
import { Button, Input } from './ui'

interface Data {
  beginning: number
  sales: number
  actual_stock: number | null
  cash_remitted: number | null
}

function Line({ label, value, indent, strong, border, warn }: {
  label: string
  value: ReactNode
  indent?: boolean
  strong?: boolean
  border?: boolean
  warn?: boolean
}) {
  return (
    <div
      className={`flex items-center justify-between py-1 ${border ? 'mt-1 border-t border-slate-200 pt-1.5' : ''} ${
        strong ? 'font-semibold text-slate-900' : 'text-slate-700'
      }`}
    >
      <span className={indent ? 'pl-4' : ''}>{label}</span>
      <span className={`tabular-nums ${warn ? 'text-rose-600' : ''}`}>{value}</span>
    </div>
  )
}

export function StoreCheck({ date }: { date: string }) {
  const [d, setD] = useState<Data | null>(null)
  const [actualStock, setActualStock] = useState('')
  const [cashRemitted, setCashRemitted] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [ok, setOk] = useState(false)

  async function load() {
    setLoading(true)
    const { data } = await supabase.rpc('report_store_check', { p_date: date })
    const row = ((data ?? [])[0] as Data) ?? null
    setD(row)
    setActualStock(row?.actual_stock != null ? String(row.actual_stock) : '')
    setCashRemitted(row?.cash_remitted != null ? String(row.cash_remitted) : '')
    setLoading(false)
  }
  useEffect(() => {
    setOk(false)
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  if (loading) return <div className="py-4 text-center text-slate-400">Loading…</div>
  if (!d) return null

  const beginning = Number(d.beginning)
  const sales = Number(d.sales)
  const estimated = beginning - sales
  const actual = actualStock === '' ? null : Number(actualStock)
  const missing = actual === null ? null : estimated - actual
  const remitted = cashRemitted === '' ? null : Number(cashRemitted)
  const cashShort = remitted === null ? null : sales - remitted

  async function save() {
    setBusy(true)
    await supabase.from('store_checks').upsert(
      {
        check_date: date,
        actual_stock: actualStock === '' ? null : Number(actualStock),
        cash_remitted: cashRemitted === '' ? null : Number(cashRemitted),
      },
      { onConflict: 'check_date' },
    )
    setBusy(false)
    setOk(true)
    load()
  }

  return (
    <div>
      <div className="mb-2 text-sm font-semibold text-slate-700">Store (Pampang) — end-of-day check</div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* STOCK */}
        <div className="rounded-lg border border-slate-200 p-3 text-sm">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
            Stock — did all the meat get accounted for?
          </div>
          <Line label="Stock in for the day" value={money(beginning)} />
          <Line label="− Sales for the day" value={money(sales)} />
          <Line label="= Estimated stock left" value={money(estimated)} border />
          <div className="flex items-center justify-between py-1">
            <span>Actual stock left (counted)</span>
            <Input
              type="number"
              step="0.01"
              value={actualStock}
              onChange={(e) => setActualStock(e.target.value)}
              className="w-28 text-right"
              placeholder="count"
            />
          </div>
          <Line
            label="Missing stock"
            border
            strong
            warn={missing != null && missing > 0.005}
            value={missing == null ? '—' : money(missing)}
          />
        </div>

        {/* CASH */}
        <div className="rounded-lg border border-slate-200 p-3 text-sm">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
            Cash — did the staff hand over the money?
          </div>
          <Line label="Sales for the day" value={money(sales)} />
          <div className="flex items-center justify-between py-1">
            <span>Cash remitted by staff</span>
            <Input
              type="number"
              step="0.01"
              value={cashRemitted}
              onChange={(e) => setCashRemitted(e.target.value)}
              className="w-28 text-right"
              placeholder="amount"
            />
          </div>
          <Line
            label="Short / over"
            border
            strong
            warn={cashShort != null && Math.abs(cashShort) > 0.005}
            value={cashShort == null ? '—' : (cashShort > 0 ? 'short ' : cashShort < 0 ? 'over ' : '') + money(Math.abs(cashShort))}
          />
        </div>
      </div>

      <div className="no-print mt-3 flex items-center gap-2">
        <Button onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save check'}
        </Button>
        {ok && <span className="text-sm text-emerald-600">Saved.</span>}
      </div>
      <p className="no-print mt-2 text-[11px] text-slate-400">
        Stock is valued at selling price. “Stock in for the day” is what came in today; the estimated leftover is rough.
        A positive <strong>missing stock</strong> or <strong>short</strong> means something didn't make it back — worth a look.
      </p>
    </div>
  )
}
