import { money } from '../lib/format'
import { Button } from './ui'

export interface StatementRow {
  date: string
  label: string
  amount: number
  running: number
}

// Printable statement modal — reused by account statements and loan ledgers.
// The page that opens it should wrap its own content in `no-print-when-modal`
// so printing shows only this statement.
export function StatementModal({
  title,
  subtitle,
  businessName,
  rows,
  loading,
  closingLabel = 'Balance',
  onClose,
}: {
  title: string
  subtitle?: string
  businessName?: string
  rows: StatementRow[]
  loading: boolean
  closingLabel?: string
  onClose: () => void
}) {
  const closing = rows.length ? rows[0].running : 0
  return (
    <div
      className="day-modal-overlay fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
      onClick={onClose}
    >
      <div className="print-area mt-6 w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 hidden text-center print:block">
          <div className="text-lg font-bold">{businessName}</div>
        </div>
        <div className="mb-3 flex items-start justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-800">{title}</div>
            {subtitle && <div className="text-xs text-slate-500">{subtitle}</div>}
          </div>
          <div className="no-print flex gap-2">
            <Button onClick={() => window.print()}>🖨 PDF</Button>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
        {loading ? (
          <div className="py-8 text-center text-slate-400">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-slate-400">No entries yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Description</th>
                  <th className="py-2 pr-3 text-right">Amount</th>
                  <th className="py-2 text-right">{closingLabel}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-3 tabular-nums text-slate-500">{r.date}</td>
                    <td className="py-2 pr-3 text-slate-700">{r.label}</td>
                    <td className={`py-2 pr-3 text-right tabular-nums ${r.amount < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {(r.amount > 0 ? '+' : '') + money(r.amount)}
                    </td>
                    <td className="py-2 text-right tabular-nums font-medium">{money(r.running)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 font-semibold">
                  <td className="py-2 pr-3" colSpan={3}>
                    {closingLabel}
                  </td>
                  <td className="py-2 text-right tabular-nums">{money(closing)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
