import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Category, Product, Unit } from '../lib/types'
import { money } from '../lib/format'
import { Banner, Button, Card, Field, Input, PageHeader, Select } from '../components/ui'

const CATEGORIES: Category[] = ['beef', 'pork', 'chicken', 'seafood', 'processed', 'other']
const UNITS: Unit[] = ['kg', 'pc', 'box', 'pack']

const blank = {
  id: '',
  name: '',
  category: 'beef' as Category,
  unit: 'kg' as Unit,
  price: 0,
  is_active: true,
}

export function Products() {
  const [rows, setRows] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<typeof blank | null>(null)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('sort_order')
      .order('name')
    if (error) setError(error.message)
    else setRows((data ?? []) as Product[])
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
      category: editing.category,
      unit: editing.unit,
      price: Number(editing.price) || 0,
      is_active: editing.is_active,
    }
    const res = editing.id
      ? await supabase.from('products').update(payload).eq('id', editing.id)
      : await supabase.from('products').insert(payload)
    if (res.error) setError(res.error.message)
    else {
      setEditing(null)
      load()
    }
  }

  return (
    <div>
      <PageHeader
        title="Products & prices"
        action={<Button onClick={() => setEditing({ ...blank })}>+ Add product</Button>}
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
            <Field label="Category">
              <Select
                value={editing.category}
                onChange={(e) => setEditing({ ...editing, category: e.target.value as Category })}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Unit">
              <Select
                value={editing.unit}
                onChange={(e) => setEditing({ ...editing, unit: e.target.value as Unit })}
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Price (₱ per unit)">
              <Input
                type="number"
                step="0.01"
                value={editing.price}
                onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })}
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
          <div className="py-8 text-center text-slate-400">
            No products yet. Add one, or run <code>supabase/seed_products.sql</code> to import the price list.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Category</th>
                  <th className="py-2 pr-3">Unit</th>
                  <th className="py-2 pr-3 text-right">Price</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-3 font-medium text-slate-800">{p.name}</td>
                    <td className="py-2 pr-3 text-slate-500">{p.category}</td>
                    <td className="py-2 pr-3 text-slate-500">{p.unit}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{money(p.price)}</td>
                    <td className="py-2 text-right">
                      <Button
                        variant="ghost"
                        onClick={() =>
                          setEditing({
                            id: p.id,
                            name: p.name,
                            category: (p.category ?? 'other') as Category,
                            unit: p.unit,
                            price: p.price,
                            is_active: p.is_active,
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
