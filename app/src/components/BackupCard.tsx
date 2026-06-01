import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Banner, Button, Card } from './ui'

// Every table that holds her data — the manual backup grabs all of them.
const TABLES = [
  'app_settings', 'branches', 'products', 'product_aliases', 'customers', 'customer_aliases',
  'suppliers', 'bank_accounts', 'orders', 'order_items', 'payments', 'inventory_movements',
  'breakdowns', 'breakdown_items', 'purchases', 'purchase_items', 'cattle_purchases',
  'supplier_payments', 'expenses', 'bank_transactions', 'cash_counts', 'customer_charges',
  'loans', 'loan_transactions', 'checks', 'sms_inbox', 'sms_senders', 'audit_log',
]

// Supabase returns at most 1000 rows per request — page through until a table is done.
async function fetchAll(table: string): Promise<unknown[]> {
  const out: unknown[] = []
  const size = 1000
  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(page * size, page * size + size - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...(data ?? []))
    if (!data || data.length < size) break
  }
  return out
}

export function BackupCard() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  async function download() {
    setBusy(true)
    setError(null)
    setOk(null)
    try {
      const tables: Record<string, unknown[]> = {}
      let total = 0
      for (const t of TABLES) {
        const rows = await fetchAll(t)
        tables[t] = rows
        total += rows.length
      }
      const exportedAt = new Date().toISOString()
      const backup = { app: 'karne', version: 1, exported_at: exportedAt, tables }
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `karne-backup-${exportedAt.slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      setOk(`Backup downloaded — ${total.toLocaleString()} records saved. Keep it somewhere safe (Google Drive, USB, or your PC).`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Backup failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <h2 className="mb-1 text-base font-semibold text-slate-800">Backup</h2>
      <p className="mb-3 text-sm text-slate-500">
        Save a complete copy of everything in the system to a file. Do this whenever you want your own copy — keep it on
        Google Drive, a USB stick, or this computer. (A copy is also saved automatically every night.)
      </p>
      {error && (
        <div className="mb-3">
          <Banner kind="error">{error}</Banner>
        </div>
      )}
      <div className="flex items-center gap-2">
        <Button onClick={download} disabled={busy}>
          {busy ? 'Preparing…' : '⬇ Download backup'}
        </Button>
        {ok && <span className="text-sm text-emerald-600">{ok}</span>}
      </div>
    </Card>
  )
}
