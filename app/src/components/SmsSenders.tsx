import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Customer } from '../lib/types'
import { Banner, Button, Card, Input, Select } from './ui'

interface Sender {
  id: string
  phone: string
  label: string | null
  customer_id: string | null
  is_active: boolean
}

export function SmsSenders() {
  const [rows, setRows] = useState<Sender[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [phone, setPhone] = useState('')
  const [label, setLabel] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    const [s, c] = await Promise.all([
      supabase.from('sms_senders').select('*').order('created_at', { ascending: false }),
      supabase.from('customers').select('*').eq('is_active', true).order('name'),
    ])
    if (s.error) setError(s.error.message)
    else setRows((s.data ?? []) as Sender[])
    if (c.data) setCustomers(c.data as Customer[])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function add() {
    setError(null)
    if (!phone.trim()) {
      setError('Enter a phone number.')
      return
    }
    setBusy(true)
    const { error } = await supabase.from('sms_senders').insert({
      phone: phone.trim(),
      label: label.trim() || null,
      customer_id: customerId || null,
    })
    setBusy(false)
    if (error) setError(error.message)
    else {
      setPhone('')
      setLabel('')
      setCustomerId('')
      load()
    }
  }

  async function patch(id: string, p: Partial<Sender>) {
    const { error } = await supabase.from('sms_senders').update(p).eq('id', id)
    if (error) setError(error.message)
    else setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...p } : r)))
  }

  async function remove(id: string) {
    const { error } = await supabase.from('sms_senders').delete().eq('id', id)
    if (error) setError(error.message)
    else setRows((prev) => prev.filter((r) => r.id !== id))
  }

  return (
    <Card>
      <div className="mb-1 text-sm font-medium text-slate-700">SMS order senders</div>
      <p className="mb-3 text-xs text-slate-500">
        Register the phone numbers that text in orders. Texts from these numbers auto-match to the
        chosen customer in the Inbox. Texts from numbers not listed here still appear, flagged as
        “unknown sender”.
      </p>

      {error && (
        <div className="mb-3">
          <Banner kind="error">{error}</Banner>
        </div>
      )}

      {/* add row */}
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <div>
          <span className="mb-1 block text-xs font-medium text-slate-600">Phone</span>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0917 123 4567" />
        </div>
        <div>
          <span className="mb-1 block text-xs font-medium text-slate-600">Label (optional)</span>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="nickname" />
        </div>
        <div>
          <span className="mb-1 block text-xs font-medium text-slate-600">Customer</span>
          <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">— none —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <Button onClick={add} disabled={busy || !phone.trim()}>
          + Add
        </Button>
      </div>

      {loading ? (
        <div className="py-4 text-center text-slate-400">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="py-4 text-center text-sm text-slate-400">No numbers registered yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <th className="py-2 pr-3">Phone</th>
                <th className="py-2 pr-3">Label</th>
                <th className="py-2 pr-3">Customer</th>
                <th className="py-2 pr-3">Active</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-3 font-medium text-slate-800">{r.phone}</td>
                  <td className="py-2 pr-3 text-slate-500">{r.label ?? '—'}</td>
                  <td className="py-2 pr-3">
                    <Select
                      value={r.customer_id ?? ''}
                      onChange={(e) => patch(r.id, { customer_id: e.target.value || null })}
                    >
                      <option value="">— none —</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="checkbox"
                      checked={r.is_active}
                      onChange={(e) => patch(r.id, { is_active: e.target.checked })}
                    />
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => remove(r.id)}
                      className="text-slate-400 hover:text-red-600"
                      title="Remove"
                    >
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
  )
}
