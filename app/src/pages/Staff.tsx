import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { money, today } from '../lib/format'
import { fmtDayLabel, weekRange } from '../lib/dates'
import { Banner, Button, Card, Field, Input, PageHeader, Select } from '../components/ui'
import { NumberInput } from '../components/NumberInput'

interface Staff {
  id: string
  name: string
  daily_rate: number
  pay_basis: 'daily' | 'weekly'
  channel: 'store' | 'delivery' | 'shared'
  is_active: boolean
}
interface SalaryRow {
  spent_on: string
  payee: string | null
  amount: number
  period_start: string | null
  period_end: string | null
}
interface Acct {
  id: string
  name: string
  type: string
}

// One editable staff row (encapsulates its own draft + save).
function StaffRow({ s, onChanged }: { s: Staff; onChanged: () => void }) {
  const [name, setName] = useState(s.name)
  const [rate, setRate] = useState<number | ''>(s.daily_rate)
  const [basis, setBasis] = useState(s.pay_basis)
  const [channel, setChannel] = useState(s.channel)
  const [busy, setBusy] = useState(false)

  const dirty =
    name !== s.name || Number(rate || 0) !== s.daily_rate || basis !== s.pay_basis || channel !== s.channel

  async function save() {
    setBusy(true)
    await supabase
      .from('staff')
      .update({ name: name.trim() || s.name, daily_rate: Number(rate || 0), pay_basis: basis, channel })
      .eq('id', s.id)
    setBusy(false)
    onChanged()
  }
  async function remove() {
    if (!window.confirm(`Remove ${s.name} from the staff list?`)) return
    await supabase.from('staff').update({ is_active: false }).eq('id', s.id)
    onChanged()
  }

  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td className="py-1.5 pr-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} className="min-w-28" />
      </td>
      <td className="py-1.5 pr-2 w-28">
        <NumberInput value={rate} onChange={setRate} />
      </td>
      <td className="py-1.5 pr-2">
        <Select value={basis} onChange={(e) => setBasis(e.target.value as 'daily' | 'weekly')}>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </Select>
      </td>
      <td className="py-1.5 pr-2">
        <Select value={channel} onChange={(e) => setChannel(e.target.value as Staff['channel'])}>
          <option value="store">Store</option>
          <option value="delivery">Delivery</option>
          <option value="shared">Shared</option>
        </Select>
      </td>
      <td className="py-1.5 text-right whitespace-nowrap">
        {dirty && (
          <Button onClick={save} disabled={busy} className="mr-1 px-2 py-1 text-xs">
            Save
          </Button>
        )}
        <button onClick={remove} className="text-slate-400 hover:text-red-600" title="Remove">
          ✕
        </button>
      </td>
    </tr>
  )
}

export function Staff() {
  const [staff, setStaff] = useState<Staff[]>([])
  const [date, setDate] = useState(today())
  const [present, setPresent] = useState<Record<string, boolean>>({})
  const [weekDays, setWeekDays] = useState<Record<string, number>>({})
  const [recent, setRecent] = useState<SalaryRow[]>([])
  const [accounts, setAccounts] = useState<Acct[]>([])
  const [payAccount, setPayAccount] = useState('')
  const [amt, setAmt] = useState<Record<string, number | ''>>({}) // amount overrides
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // add-staff form
  const [nName, setNName] = useState('')
  const [nRate, setNRate] = useState<number | ''>('')
  const [nBasis, setNBasis] = useState<'daily' | 'weekly'>('daily')
  const [nChannel, setNChannel] = useState<'store' | 'delivery' | 'shared'>('store')

  const week = weekRange(date)

  async function loadStaff() {
    const { data } = await supabase.from('staff').select('*').eq('is_active', true).order('name')
    setStaff((data ?? []) as Staff[])
  }
  async function loadDay() {
    const { from, to } = weekRange(date)
    const [att, wk, sal] = await Promise.all([
      supabase.from('staff_attendance').select('staff_id,present').eq('work_date', date),
      supabase.from('staff_attendance').select('staff_id').eq('present', true).gte('work_date', from).lte('work_date', to),
      supabase
        .from('expenses')
        .select('spent_on,payee,amount,period_start,period_end')
        .not('staff_id', 'is', null)
        .order('spent_on', { ascending: false })
        .limit(20),
    ])
    const p: Record<string, boolean> = {}
    for (const r of (att.data ?? []) as { staff_id: string; present: boolean }[]) p[r.staff_id] = r.present
    setPresent(p)
    const wd: Record<string, number> = {}
    for (const r of (wk.data ?? []) as { staff_id: string }[]) wd[r.staff_id] = (wd[r.staff_id] ?? 0) + 1
    setWeekDays(wd)
    setRecent((sal.data ?? []) as SalaryRow[])
  }

  useEffect(() => {
    setLoading(true)
    Promise.all([
      loadStaff(),
      supabase
        .from('bank_accounts')
        .select('id,name,type')
        .eq('is_active', true)
        .order('name')
        .then(({ data }) => {
          const accs = (data ?? []) as Acct[]
          setAccounts(accs)
          setPayAccount((prev) => prev || accs.find((a) => a.type === 'cash')?.id || '')
        }),
    ]).then(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    loadDay()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, staff.length])

  async function addStaff() {
    if (!nName.trim()) return
    setBusy(true)
    const { error } = await supabase
      .from('staff')
      .insert({ name: nName.trim(), daily_rate: Number(nRate || 0), pay_basis: nBasis, channel: nChannel })
    setBusy(false)
    if (error) setError(error.message)
    else {
      setNName('')
      setNRate('')
      loadStaff()
    }
  }

  async function togglePresent(id: string, val: boolean) {
    setPresent((p) => ({ ...p, [id]: val }))
    await supabase.from('staff_attendance').upsert({ staff_id: id, work_date: date, present: val }, { onConflict: 'staff_id,work_date' })
    loadDay()
  }

  async function pay(rows: { staff: Staff; amount: number; from: string; to: string }[]) {
    setError(null)
    setOk(null)
    const valid = rows.filter((r) => r.amount > 0)
    if (valid.length === 0) {
      setError('Nothing to pay — mark who is present first.')
      return
    }
    setBusy(true)
    const { error } = await supabase.from('expenses').upsert(
      valid.map((r) => ({
        spent_on: r.to,
        category: 'Salary',
        payee: r.staff.name,
        amount: r.amount,
        channel: r.staff.channel,
        bank_account_id: payAccount || null,
        staff_id: r.staff.id,
        period_start: r.from,
        period_end: r.to,
      })),
      { onConflict: 'staff_id,period_start,period_end', ignoreDuplicates: true },
    )
    setBusy(false)
    if (error) setError(error.message)
    else {
      setOk('Salaries recorded as expenses (already-paid periods were skipped).')
      setAmt({})
      loadDay()
    }
  }

  const dailyStaff = staff.filter((s) => s.pay_basis === 'daily')
  const weeklyStaff = staff.filter((s) => s.pay_basis === 'weekly')
  const dailyPresent = dailyStaff.filter((s) => present[s.id])
  const dailyAmount = (s: Staff) => (amt[s.id] === '' || amt[s.id] == null ? s.daily_rate : Number(amt[s.id]))
  const weeklyAmount = (s: Staff) =>
    amt[s.id] === '' || amt[s.id] == null ? (weekDays[s.id] ?? 0) * s.daily_rate : Number(amt[s.id])
  const dailyTotal = dailyPresent.reduce((t, s) => t + dailyAmount(s), 0)
  const weeklyTotal = weeklyStaff.reduce((t, s) => t + weeklyAmount(s), 0)

  return (
    <div>
      <PageHeader
        title="Staff & salaries"
        action={<Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />}
      />
      {error && (
        <div className="mb-3">
          <Banner kind="error">{error}</Banner>
        </div>
      )}
      {ok && (
        <div className="mb-3">
          <Banner kind="success">{ok}</Banner>
        </div>
      )}

      {/* Staff list */}
      <Card className="mb-4">
        <div className="mb-2 text-sm font-medium text-slate-700">Staff</div>
        {loading ? (
          <div className="py-4 text-center text-slate-400">Loading…</div>
        ) : staff.length === 0 ? (
          <div className="py-3 text-center text-sm text-slate-400">No staff yet — add below.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="py-2 pr-2">Name</th>
                  <th className="py-2 pr-2">Daily rate</th>
                  <th className="py-2 pr-2">Paid</th>
                  <th className="py-2 pr-2">Side</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => (
                  <StaffRow key={s.id} s={s} onChanged={loadStaff} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {/* add staff */}
        <div className="mt-3 grid grid-cols-1 gap-2 border-t border-slate-100 pt-3 sm:grid-cols-[1fr_auto_auto_auto_auto] sm:items-end">
          <Field label="New staff name">
            <Input value={nName} onChange={(e) => setNName(e.target.value)} placeholder="name" />
          </Field>
          <Field label="Daily rate">
            <NumberInput value={nRate} onChange={setNRate} className="w-28" />
          </Field>
          <Field label="Paid">
            <Select value={nBasis} onChange={(e) => setNBasis(e.target.value as 'daily' | 'weekly')}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </Select>
          </Field>
          <Field label="Side">
            <Select value={nChannel} onChange={(e) => setNChannel(e.target.value as Staff['channel'])}>
              <option value="store">Store</option>
              <option value="delivery">Delivery</option>
              <option value="shared">Shared</option>
            </Select>
          </Field>
          <Button variant="ghost" onClick={addStaff} disabled={busy || !nName.trim()}>
            + Add
          </Button>
        </div>
      </Card>

      {/* Attendance */}
      <Card className="mb-4">
        <div className="mb-1 text-sm font-medium text-slate-700">
          Who's present — {fmtDayLabel(date)}
        </div>
        <p className="mb-2 text-xs text-slate-400">Tick who came in. Weekly staff are paid for the days they're present.</p>
        {staff.length === 0 ? (
          <div className="py-2 text-sm text-slate-400">Add staff first.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {staff.map((s) => (
              <label
                key={s.id}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${
                  present[s.id] ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-600'
                }`}
              >
                <input type="checkbox" checked={!!present[s.id]} onChange={(e) => togglePresent(s.id, e.target.checked)} />
                {s.name}
                <span className="text-xs text-slate-400">({s.pay_basis})</span>
              </label>
            ))}
          </div>
        )}
      </Card>

      {/* Pay account */}
      {(dailyStaff.length > 0 || weeklyStaff.length > 0) && (
        <Card className="mb-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Daily */}
            <div>
              <div className="mb-2 text-sm font-medium text-slate-700">Daily wages — {fmtDayLabel(date)}</div>
              {dailyPresent.length === 0 ? (
                <div className="py-2 text-sm text-slate-400">No daily-paid staff marked present today.</div>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {dailyPresent.map((s) => (
                      <tr key={s.id} className="border-b border-slate-100 last:border-0">
                        <td className="py-1.5 pr-2 text-slate-800">{s.name}</td>
                        <td className="py-1.5 w-28">
                          <NumberInput value={amt[s.id] ?? s.daily_rate} onChange={(v) => setAmt((m) => ({ ...m, [s.id]: v }))} />
                        </td>
                      </tr>
                    ))}
                    <tr className="font-semibold">
                      <td className="py-1.5 pr-2">Total</td>
                      <td className="py-1.5 tabular-nums">{money(dailyTotal)}</td>
                    </tr>
                  </tbody>
                </table>
              )}
              {dailyPresent.length > 0 && (
                <Button
                  className="mt-2"
                  disabled={busy}
                  onClick={() => pay(dailyPresent.map((s) => ({ staff: s, amount: dailyAmount(s), from: date, to: date })))}
                >
                  Pay daily wages
                </Button>
              )}
            </div>

            {/* Weekly */}
            <div>
              <div className="mb-2 text-sm font-medium text-slate-700">
                Weekly wages — week of {fmtDayLabel(week.from)}–{fmtDayLabel(week.to)}
              </div>
              {weeklyStaff.length === 0 ? (
                <div className="py-2 text-sm text-slate-400">No weekly-paid staff.</div>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {weeklyStaff.map((s) => (
                      <tr key={s.id} className="border-b border-slate-100 last:border-0">
                        <td className="py-1.5 pr-2 text-slate-800">
                          {s.name} <span className="text-xs text-slate-400">{weekDays[s.id] ?? 0} day(s)</span>
                        </td>
                        <td className="py-1.5 w-28">
                          <NumberInput
                            value={amt[s.id] ?? (weekDays[s.id] ?? 0) * s.daily_rate}
                            onChange={(v) => setAmt((m) => ({ ...m, [s.id]: v }))}
                          />
                        </td>
                      </tr>
                    ))}
                    <tr className="font-semibold">
                      <td className="py-1.5 pr-2">Total</td>
                      <td className="py-1.5 tabular-nums">{money(weeklyTotal)}</td>
                    </tr>
                  </tbody>
                </table>
              )}
              {weeklyStaff.length > 0 && (
                <Button
                  className="mt-2"
                  disabled={busy}
                  onClick={() =>
                    pay(weeklyStaff.map((s) => ({ staff: s, amount: weeklyAmount(s), from: week.from, to: week.to })))
                  }
                >
                  Pay weekly wages
                </Button>
              )}
            </div>
          </div>
          <div className="mt-3 max-w-xs">
            <Field label="Pay from">
              <Select value={payAccount} onChange={(e) => setPayAccount(e.target.value)}>
                <option value="">— (not from an account) —</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Card>
      )}

      {/* Recent salary payments */}
      <Card>
        <div className="mb-2 text-sm font-medium text-slate-700">Recent salary payments</div>
        {recent.length === 0 ? (
          <div className="py-3 text-center text-sm text-slate-400">None yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="py-2 pr-3">Paid on</th>
                  <th className="py-2 pr-3">Staff</th>
                  <th className="py-2 pr-3">Period</th>
                  <th className="py-2 pr-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r, i) => (
                  <tr key={i} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-3 tabular-nums text-slate-500">{r.spent_on}</td>
                    <td className="py-2 pr-3 text-slate-800">{r.payee ?? '—'}</td>
                    <td className="py-2 pr-3 text-slate-500">
                      {r.period_start === r.period_end
                        ? fmtDayLabel(r.period_start ?? r.spent_on)
                        : `${fmtDayLabel(r.period_start ?? '')}–${fmtDayLabel(r.period_end ?? '')}`}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{money(r.amount)}</td>
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
