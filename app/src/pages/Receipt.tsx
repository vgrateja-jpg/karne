import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchSettings, type AppSettings } from '../lib/settings'
import { money, qty as fmtQty } from '../lib/format'
import { Banner, Button } from '../components/ui'

interface ReceiptItem {
  quantity: number
  unit_price: number
  line_total: number
  product: { name: string; unit: string } | null
}
interface ReceiptOrder {
  id: string
  order_date: string
  notes: string | null
  customer: { name: string; phone: string | null } | null
}

export function Receipt() {
  const { id } = useParams<{ id: string }>()
  const [order, setOrder] = useState<ReceiptOrder | null>(null)
  const [items, setItems] = useState<ReceiptItem[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      if (!id) return
      setLoading(true)
      const [o, it, s] = await Promise.all([
        supabase
          .from('orders')
          .select('id, order_date, notes, customer:customers(name, phone)')
          .eq('id', id)
          .single(),
        supabase
          .from('order_items')
          .select('quantity, unit_price, line_total, product:products(name, unit)')
          .eq('order_id', id),
        fetchSettings(),
      ])
      if (o.error) setError(o.error.message)
      else setOrder(o.data as unknown as ReceiptOrder)
      if (!it.error) setItems((it.data ?? []) as unknown as ReceiptItem[])
      setSettings(s)
      setLoading(false)
    }
    load()
  }, [id])

  const total = items.reduce((s, i) => s + Number(i.line_total), 0)
  const totalQty = items.reduce((s, i) => s + Number(i.quantity), 0)

  if (loading) return <div className="py-10 text-center text-slate-400">Loading…</div>
  if (error) return <Banner kind="error">{error}</Banner>

  return (
    <div>
      <div className="no-print mb-4 flex gap-2">
        <Link to="/orders">
          <Button variant="ghost">← Orders</Button>
        </Link>
        <Button onClick={() => window.print()}>🖨 Print receipt</Button>
      </div>

      <div className="print-area mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-center">
          <div className="text-xl font-bold text-slate-900">{settings?.business_name}</div>
          {settings?.address && <div className="text-sm text-slate-500">{settings.address}</div>}
          {settings?.phone && <div className="text-sm text-slate-500">{settings.phone}</div>}
        </div>

        <hr className="my-4 border-slate-200" />

        <div className="mb-3 flex justify-between text-sm">
          <div>
            <div className="text-slate-500">Customer</div>
            <div className="font-medium text-slate-800">{order?.customer?.name ?? 'Cash / walk-in'}</div>
          </div>
          <div className="text-right">
            <div className="text-slate-500">Date</div>
            <div className="font-medium text-slate-800">{order?.order_date}</div>
            <div className="text-xs text-slate-400">No. {order?.id.slice(0, 8).toUpperCase()}</div>
          </div>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-300 text-left text-xs uppercase text-slate-500">
              <th className="py-1.5 pr-2">Item</th>
              <th className="py-1.5 pr-2 text-right">Qty</th>
              <th className="py-1.5 pr-2 text-right">Price</th>
              <th className="py-1.5 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className="border-b border-slate-100">
                <td className="py-1.5 pr-2 text-slate-800">{it.product?.name ?? '—'}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums text-slate-500">
                  {fmtQty(it.quantity)} {it.product?.unit}
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums text-slate-500">{money(it.unit_price)}</td>
                <td className="py-1.5 text-right tabular-nums">{money(it.line_total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 font-semibold">
              <td className="py-2 pr-2">Total</td>
              <td className="py-2 pr-2 text-right tabular-nums text-slate-500">{fmtQty(totalQty)}</td>
              <td></td>
              <td className="py-2 text-right tabular-nums text-base">{money(total)}</td>
            </tr>
          </tfoot>
        </table>

        {order?.notes && <div className="mt-3 text-sm text-slate-500">Note: {order.notes}</div>}

        {settings?.receipt_footer && (
          <div className="mt-6 text-center text-sm text-slate-500">{settings.receipt_footer}</div>
        )}
      </div>
    </div>
  )
}
