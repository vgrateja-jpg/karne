import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Customer, CustomerBalance, CustomerType } from '../lib/types'
import { money } from '../lib/format'
import { Banner, Button, Card, Field, Input, PageHeader, Select } from '../components/ui'

const TYPES: CustomerType[] = ['wholesale', 'reseller', 'walk_in']

const blank = {
  id: '',
  name: '',
  type: 'wholesale' as CustomerType,
  phone: '',
  opening_balance: 0,
}

export function Customers() {
  const [rows, setRows] = useState<Customer[]>([])
  const [balances, setBalances] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<typeof blank | null>(null)

  async function load() {
    setLoading(true)
    const [cust, bal] = await Promise.all([
      supabase.from('customers').select('*').order('name'),
      supabase.from('v_customer_balance').select('customer_id,balance'),
    ])
    if (cust.error) setError(cust.error.message)
    else setRows((cust.data ?? []) as Customer[])
    if (!bal.error && bal.data) {
      const map: Record<string, number> = {}
      for (const b of bal.data as CustomerBalance[]) map[b.customer_id] = b.balance
      setBalances(map)
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function save() {
    if (!editing) return
    setError(null)
    const payload = {
      name: editing.name.trim(),
      type: editing.type,
      phone: editing.phone.trim() || null,
      opening_balance: Number(editing.opening_balance) || 0,
    }
    const res = editing.id
      ? await supabase.from('customers').update(payload).eq('id', editing.id)
      : await supabase.from('customers').insert(payload)
    if (res.error) setError(res.error.message)
    else {
      setEditing(null)
      load()
    }
  }

  return (
    <div>
      <PageHeader
        title="Customers"
        action={<Button onClick={() => setEditing({ ...blank })}>+ Add customer</Button>}
      />
      {error && (
        <div className="mb-3">
          <Banner kind="error">{error}</Banner>
        </div>
      )}

      {editing && (
        <Card className="mb-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
            <Field label="Name">
              <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </Field>
            <Field label="Type">
              <Select
                value={editing.type}
                onChange={(e) => setEditing({ ...editing, type: e.target.value as CustomerType })}
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Phone (for SMS match)">
              <Input value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
            </Field>
            <Field label="Starting balance owed">
              <Input
                type="number"
                step="0.01"
                value={editing.opening_balance}
                onChange={(e) => setEditing({ ...editing, opening_balance: Number(e.target.value) })}
              />
            </Field>
          </div>
          <div className="mt-3 flex gap-2">
            <Button onClick={save} disabled={!editing.name.trim()}>
              Save
            </Button>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      <Card>
        {loading ? (
          <div className="py-8 text-center text-slate-400">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-slate-400">No customers yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">Phone</th>
                  <th className="py-2 pr-3 text-right">Balance owed</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-3 font-medium">
                      <Link to={`/customers/${c.id}`} className="text-rose-700 hover:underline">
                        {c.name}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-slate-500">{c.type}</td>
                    <td className="py-2 pr-3 text-slate-500">{c.phone ?? '—'}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      <span className={(balances[c.id] ?? 0) > 0 ? 'text-rose-600' : 'text-slate-700'}>
                        {money(balances[c.id] ?? c.opening_balance)}
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      <Button
                        variant="ghost"
                        onClick={() =>
                          setEditing({
                            id: c.id,
                            name: c.name,
                            type: c.type,
                            phone: c.phone ?? '',
                            opening_balance: c.opening_balance,
                          })
                        }
                      >
                        Edit
                      </Button>
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
