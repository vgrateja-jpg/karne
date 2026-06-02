// Row shapes mirroring the database (see supabase/migrations/0001_initial_schema.sql).

export type Category = 'beef' | 'pork' | 'chicken' | 'seafood' | 'processed' | 'other'
// Free text so she can use any unit; common ones are offered as suggestions.
export type Unit = string

export interface Product {
  id: string
  code: string | null
  name: string
  category: Category | null
  unit: Unit
  base_price: number
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
  credit_limit: number
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

export type AccountType = 'cash' | 'bank' | 'gcash' | 'coop' | 'check'

export interface BankAccount {
  id: string
  name: string
  type: AccountType
  opening_balance: number
  is_active: boolean
}

export interface AccountBalance {
  account_id: string
  name: string
  type: AccountType
  opening_balance: number
  balance: number
  is_active: boolean
}

export interface BankTxn {
  id: string
  bank_account_id: string
  txn_on: string
  amount: number
  type: 'deposit' | 'withdrawal' | 'transfer'
  reference: string | null
  notes: string | null
}

export interface Expense {
  id: string
  spent_on: string
  category: string | null
  payee: string | null
  amount: number
  bank_account_id: string | null
  notes: string | null
  channel: 'store' | 'delivery' | 'shared'
}

export interface Supplier {
  id: string
  name: string
  phone: string | null
  notes: string | null
  is_active: boolean
}

export interface CattlePurchase {
  id: string
  tag: string | null
  supplier_id: string | null
  purchased_on: string
  weight_kg: number | null
  price_per_kg: number | null
  total_cost: number
  notes: string | null
}

export interface Purchase {
  id: string
  supplier_id: string | null
  purchased_on: string
  description: string | null
  total_cost: number
  notes: string | null
}

export interface SupplierBalance {
  supplier_id: string
  name: string
  opening_balance: number
  balance: number
}

export type LoanDirection = 'payable' | 'receivable'

export interface Loan {
  id: string
  party_name: string
  direction: LoanDirection
  notes: string | null
  is_active: boolean
}

export interface LoanBalance {
  loan_id: string
  party_name: string
  direction: LoanDirection
  balance: number
}

export interface LoanTxn {
  id: string
  loan_id: string
  txn_on: string
  type: 'principal' | 'interest' | 'payment' | 'adjustment'
  amount: number
  notes: string | null
}

export type CheckStatus = 'pending' | 'deposited' | 'cleared' | 'bounced' | 'cancelled'

export interface Check {
  id: string
  direction: 'received' | 'issued'
  party: string | null
  bank: string | null
  check_no: string | null
  amount: number
  check_date: string | null
  due_date: string | null
  status: CheckStatus
  account_id: string | null
  notes: string | null
}

export interface Branch {
  id: string
  name: string
  is_active: boolean
}
