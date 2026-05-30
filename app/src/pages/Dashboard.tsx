import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { CustomerBalance } from '../lib/types'
import { money, today } from '../lib/format'
import { Banner, Button, Card, PageHeader } from '../components/ui'

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</div>
      {sub && <div className="text-xs text-slate-400">{sub}</div>}
    </Card>
  )
}

export function Dashboard() {
  const [salesToday, setSalesToday] = useState(0)
  const [ordersToday, setOrdersToday] = useState(0)
  const [receivables, setReceivables] = useState(0)
  const [owing, setOwing] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const d = today()
      const [ordersRes, balRes] = await Promise.all([
        supabase.from('orders').select('id').eq('order_date', d),
        supabase.from('v_customer_balance').select('customer_id,balance'),
      ])
      if (ordersRes.error) setError(ordersRes.error.message)

      const todayIds = (ordersRes.data ?? []).map((o: { id: string }) => o.id)
      setOrdersToday(todayIds.length)
      if (todayIds.length) {
        const totRes = await supabase.from('v_order_totals').select('total').in('order_id', todayIds)
        setSalesToday((totRes.data ?? []).reduce((s, t: { total: number }) => s + Number(t.total), 0))
      } else {
        setSalesToday(0)
      }

      if (!balRes.error && balRes.data) {
        const bals = balRes.data as CustomerBalance[]
        const positive = bals.filter((b) => b.balance > 0)
        setReceivables(positive.reduce((s, b) => s + b.balance, 0))
        setOwing(positive.length)
      }
      setLoading(false)
    }
    load()
  }, [])

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
        <Stat label="Sales today" value={loading ? '…' : money(salesToday)} sub={`${ordersToday} order(s) today`} />
        <Stat label="Total receivables" value={loading ? '…' : money(receivables)} sub={`${owing} customer(s) owing`} />
        <Card className="flex flex-col justify-center gap-2">
          <div className="text-xs uppercase tracking-wide text-slate-500">Quick actions</div>
          <div className="flex flex-wrap gap-2">
            <Link to="/orders/new">
              <Button>New order</Button>
            </Link>
            <Link to="/customers">
              <Button variant="ghost">Customers</Button>
            </Link>
            <Link to="/inventory">
              <Button variant="ghost">Inventory</Button>
            </Link>
          </div>
        </Card>
      </div>

      <div className="mt-6 text-sm text-slate-400">
        Phase 2 will add the rolling monthly view (replacing the 31 daily tabs), per-customer
        statements, and the daily cash reconciliation.
      </div>
    </div>
  )
}
