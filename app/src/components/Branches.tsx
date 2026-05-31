import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Branch } from '../lib/types'
import { Banner, Button, Card, Input } from './ui'

export function Branches() {
  const [rows, setRows] = useState<Branch[]>([])
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    const { data, error } = await supabase.from('branches').select('*').order('name')
    if (error) setError(error.message)
    else setRows((data ?? []) as Branch[])
  }
  useEffect(() => {
    load()
  }, [])

  async function add() {
    if (!name.trim()) return
    setBusy(true)
    const { error } = await supabase.from('branches').insert({ name: name.trim() })
    setBusy(false)
    if (error) setError(error.message)
    else {
      setName('')
      load()
    }
  }

  async function remove(id: string) {
    const { error } = await supabase.from('branches').delete().eq('id', id)
    if (error) setError(error.message)
    else setRows((prev) => prev.filter((r) => r.id !== id))
  }

  return (
    <Card>
      <div className="mb-1 text-sm font-medium text-slate-700">Branches</div>
      <p className="mb-3 text-xs text-slate-500">
        Optional — add your locations (Angeles, Cabanatuan, Tarlac…) to tag orders by branch.
      </p>
      {error && (
        <div className="mb-3">
          <Banner kind="error">{error}</Banner>
        </div>
      )}
      <div className="mb-3 flex items-end gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="branch name" className="max-w-xs" />
        <Button onClick={add} disabled={busy || !name.trim()}>
          + Add
        </Button>
      </div>
      {rows.length === 0 ? (
        <div className="text-sm text-slate-400">No branches yet.</div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between py-2 text-sm">
              <span className="font-medium text-slate-800">{r.name}</span>
              <button onClick={() => remove(r.id)} className="text-slate-400 hover:text-red-600" title="Remove">
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
