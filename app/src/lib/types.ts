// Row shapes mirroring the database (see supabase/migrations/0001_initial_schema.sql).

export type Category = 'beef' | 'pork' | 'chicken' | 'seafood' | 'processed' | 'other'
export type Unit = 'kg' | 'pc' | 'box' | 'pack'

export interface Product {
  id: string
  code: string | null
  name: string
  category: Category | null
  unit: Unit
  price: number
  cost: number | null
  sort_order: number
  is_active: boolean
}

export type CustomerType = 'wholesale' | 'reseller' | 'walk_in'

export interface Customer {
  id: string
  name: string
  type: CustomerType
  phone: string | null
  opening_balance: number
  notes: string | null
  is_active: boolean
}

export type OrderStatus =
  | 'draft'
  | 'confirmed'
  | 'delivered'
  | 'paid'
  | 'partly_paid'
  | 'void'
export type OrderChannel = 'manual' | 'sms' | 'messenger' | 'call'

export interface Order {
  id: string
  customer_id: string | null
  order_date: string
  channel: OrderChannel
  status: OrderStatus
  notes: string | null
  created_at: string
}

export interface OrderItem {
  id: string
  order_id: string
  product_id: string
  quantity: number
  unit_price: number
  line_total: number
  notes: string | null
}

export interface CustomerBalance {
  customer_id: string
  name: string
  opening_balance: number
  purchases: number
  payments: number
  balance: number
}

export interface ProductStock {
  product_id: string
  name: string
  unit: Unit
  on_hand: number
}

// A single line while building a new order in the UI.
export interface OrderLineDraft {
  product_id: string
  quantity: number
  unit_price: number
  notes?: string | null
}
