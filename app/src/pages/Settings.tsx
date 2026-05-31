import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Banner, Button, Card, Field, Input, PageHeader } from '../components/ui'
import { SmsSenders } from '../components/SmsSenders'

export function Settings() {
  const [form, setForm] = useState({ business_name: '', address: '', phone: '', receipt_footer: '' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.from('app_settings').select('*').eq('id', true).single()
      if (error) setError(error.message)
      else if (data)
        setForm({
          business_name: data.business_name ?? '',
          address: data.address ?? '',
          phone: data.phone ?? '',
          receipt_footer: data.receipt_footer ?? '',
        })
      setLoading(false)
    }
    load()
  }, [])

  async function save() {
    setBusy(true)
    setError(null)
    setOk(null)
    const { error } = await supabase
      .from('app_settings')
      .update({
        business_name: form.business_name.trim() || 'My Meat Shop',
        address: form.address.trim() || null,
        phone: form.phone.trim() || null,
        receipt_footer: form.receipt_footer.trim() || null,
      })
      .eq('id', true)
    setBusy(false)
    if (error) setError(error.message)
    else setOk('Saved. New receipts and reports will use these details.')
  }

  return (
    <div>
      <PageHeader title="Business settings" />
      {error && (
        <div className="mb-3">
          <Banner kind="error">{error}</Banner>
        </div>
      )}
      <Card className="max-w-xl">
        <p className="mb-4 text-sm text-slate-500">These appear at the top of printed receipts and reports.</p>
        {loading ? (
          <div className="py-6 text-center text-slate-400">Loading…</div>
        ) : (
          <div className="space-y-3">
            <Field label="Business name">
              <Input value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} />
            </Field>
            <Field label="Address">
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </Field>
            <Field label="Phone">
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="Receipt footer">
              <Input
                value={form.receipt_footer}
                onChange={(e) => setForm({ ...form, receipt_footer: e.target.value })}
                placeholder="e.g. Thank you! / Salamat po!"
              />
            </Field>
            <div className="flex items-center gap-2 pt-1">
              <Button onClick={save} disabled={busy}>
                {busy ? 'Saving…' : 'Save'}
              </Button>
              {ok && <span className="text-sm text-emerald-600">{ok}</span>}
            </div>
          </div>
        )}
      </Card>

      <div className="mt-4 max-w-3xl">
        <SmsSenders />
      </div>
    </div>
  )
}
