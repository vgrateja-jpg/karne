import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { AccountBalance, CustomerBalance } from '../lib/types'
import { money, today } from '../lib/format'
import { monthRange } from '../lib/dates'
import { Banner, Button, Card, PageHeader } from '../components/ui'

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'bad' }) {
  const color = tone === 'good' ? 'text-emerald-600' : tone === 'bad' ? 'text-rose-600' : 'text-slate-900'
  return (
    <Card>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
      {sub && <div className="text-xs text-slate-400">{sub}</div>}
    </Card>
  )
}

export function Dashboard() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [m, setM] = useState({
    salesToday: 0,
    ordersToday: 0,
    receivables: 0,
    owing: 0,
    cashOnHand: 0,
    salesMonth: 0,
    expensesMonth: 0,
    purchasesMonth: 0,
  })

  useEffect(() => {
    async function load() {
      setLoading(true)
      const d = today()
      const now = new Date()
      const { from, to } = monthRange(now.getFullYear(), now.getMonth())

      const [ordersRes, balRes, acctRes, dailyRes, expRes, cattleRes, purchRes] = await Promise.all([
        supabase.from('orders').select('id').eq('order_date', d),
        supabase.from('v_customer_balance').select('customer_id,balance'),
        supabase.from('v_account_balance').select('balance'),
        supabase.rpc('report_daily', { p_from: from, p_to: to }),
        supabase.from('expenses').select('amount').gte('spent_on', from).lte('spent_on', to),
        supabase.from('cattle_purchases').select('total_cost').gte('purchased_on', from).lte('purchased_on', to),
        supabase.from('purchases').select('total_cost').gte('purchased_on', from).lte('purchased_on', to),
      ])
      if (ordersRes.error) setError(ordersRes.error.message)

      const todayIds = (ordersRes.data ?? []).map((o: { id: string }) => o.id)
      let salesToday = 0
      if (todayIds.length) {
        const totRes = await supabase.from('v_order_totals').select('total').in('order_id', todayIds)
        salesToday = (totRes.data ?? []).reduce((s, t: { total: number }) => s + Number(t.total), 0)
      }

      const bals = (balRes.data ?? []) as CustomerBalance[]
      const positive = bals.filter((b) => b.balance > 0)
      const cashOnHand = ((acctRes.data ?? []) as Pick<AccountBalance, 'balance'>[]).reduce(
        (s, a) => s + Number(a.balance),
        0,
      )
      const salesMonth = ((dailyRes.data ?? []) as { sales: number }[]).reduce((s, r) => s + Number(r.sales), 0)
      const expensesMonth = ((expRes.data ?? []) as { amount: number }[]).reduce((s, r) => s + Number(r.amount), 0)
      const purchasesMonth =
        ((cattleRes.data ?? []) as { total_cost: number }[]).reduce((s, r) => s + Number(r.total_cost), 0) +
        ((purchRes.data ?? []) as { total_cost: number }[]).reduce((s, r) => s + Number(r.total_cost), 0)

      setM({
        salesToday,
        ordersToday: todayIds.length,
        receivables: positive.reduce((s, b) => s + b.balance, 0),
        owing: positive.length,
        cashOnHand,
        salesMonth,
        expensesMonth,
        purchasesMonth,
      })
      setLoading(false)
    }
    load()
  }, [])

  const v = (n: number) => (loading ? '…' : money(n))
  const profit = m.salesMonth - m.expensesMonth - m.purchasesMonth

  return (
    <div>
      <PageHeader
        title="Dashboard"
        action={
          <Link to="/orders/new">
            <Button>+ New order</Button>
          </Link>
        }
      />
      {error && (
        <div className="mb-3">
          <Banner kind="error">{error}</Banner>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Sales today" value={v(m.salesToday)} sub={`${m.ordersToday} order(s) today`} />
        <Stat label="Total receivables" value={v(m.receivables)} sub={`${m.owing} customer(s) owing`} tone="bad" />
        <Stat label="Cash on hand" value={v(m.cashOnHand)} sub="across all accounts" />
      </div>

      <div className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-400">This month</div>
      <div className="mt-1 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Sales" value={v(m.salesMonth)} tone="good" />
        <Stat label="Purchases" value={v(m.purchasesMonth)} />
        <Stat label="Expenses" value={v(m.expensesMonth)} />
        <Stat label="Rough profit" value={v(profit)} sub="sales − purchases − expenses" tone={profit >= 0 ? 'good' : 'bad'} />
      </div>

      <Card className="mt-4 flex flex-col gap-2">
        <div className="text-xs uppercase tracking-wide text-slate-500">Quick actions</div>
        <div className="flex flex-wrap gap-2">
          <Link to="/orders/new"><Button>New order</Button></Link>
          <Link to="/inbox"><Button variant="ghost">Inbox</Button></Link>
          <Link to="/expenses"><Button variant="ghost">Add expense</Button></Link>
          <Link to="/cash"><Button variant="ghost">Cash & banks</Button></Link>
          <Link to="/purchases"><Button variant="ghost">Purchases</Button></Link>
          <Link to="/month"><Button variant="ghost">Monthly</Button></Link>
        </div>
      </Card>
    </div>
  )
}
