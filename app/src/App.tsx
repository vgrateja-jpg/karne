import { Suspense, lazy } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ProtectedRoute } from './components/ProtectedRoute'

// Lazy-load each page so the first load only downloads what's needed
// (code-splitting → much smaller initial download).
const Login = lazy(() => import('./pages/Login').then((m) => ({ default: m.Login })))
const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })))
const Daily = lazy(() => import('./pages/Daily').then((m) => ({ default: m.Daily })))
const Month = lazy(() => import('./pages/Month').then((m) => ({ default: m.Month })))
const History = lazy(() => import('./pages/History').then((m) => ({ default: m.History })))
const Audit = lazy(() => import('./pages/Audit').then((m) => ({ default: m.Audit })))
const Inbox = lazy(() => import('./pages/Inbox').then((m) => ({ default: m.Inbox })))
const NewOrder = lazy(() => import('./pages/NewOrder').then((m) => ({ default: m.NewOrder })))
const Orders = lazy(() => import('./pages/Orders').then((m) => ({ default: m.Orders })))
const OrderDetail = lazy(() => import('./pages/OrderDetail').then((m) => ({ default: m.OrderDetail })))
const Receipt = lazy(() => import('./pages/Receipt').then((m) => ({ default: m.Receipt })))
const Delivery = lazy(() => import('./pages/Delivery').then((m) => ({ default: m.Delivery })))
const Customers = lazy(() => import('./pages/Customers').then((m) => ({ default: m.Customers })))
const CustomerStatement = lazy(() => import('./pages/CustomerStatement').then((m) => ({ default: m.CustomerStatement })))
const Receivables = lazy(() => import('./pages/Receivables').then((m) => ({ default: m.Receivables })))
const Products = lazy(() => import('./pages/Products').then((m) => ({ default: m.Products })))
const Inventory = lazy(() => import('./pages/Inventory').then((m) => ({ default: m.Inventory })))
const Butchering = lazy(() => import('./pages/Butchering').then((m) => ({ default: m.Butchering })))
const Purchases = lazy(() => import('./pages/Purchases').then((m) => ({ default: m.Purchases })))
const Expenses = lazy(() => import('./pages/Expenses').then((m) => ({ default: m.Expenses })))
const Cash = lazy(() => import('./pages/Cash').then((m) => ({ default: m.Cash })))
const CashCount = lazy(() => import('./pages/CashCount').then((m) => ({ default: m.CashCount })))
const Loans = lazy(() => import('./pages/Loans').then((m) => ({ default: m.Loans })))
const Checks = lazy(() => import('./pages/Checks').then((m) => ({ default: m.Checks })))
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })))

export default function App() {
  return (
    <Suspense fallback={<div className="grid h-full place-items-center py-20 text-slate-400">Loading…</div>}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Dashboard />} />
          <Route path="/daily" element={<Daily />} />
          <Route path="/month" element={<Month />} />
          <Route path="/history" element={<History />} />
          <Route path="/audit" element={<Audit />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/orders/new" element={<NewOrder />} />
          <Route path="/orders/:id/receipt" element={<Receipt />} />
          <Route path="/orders/:id" element={<OrderDetail />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/delivery" element={<Delivery />} />
          <Route path="/receivables" element={<Receivables />} />
          <Route path="/cashcount" element={<CashCount />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/customers/:id" element={<CustomerStatement />} />
          <Route path="/products" element={<Products />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/butchering" element={<Butchering />} />
          <Route path="/purchases" element={<Purchases />} />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/cash" element={<Cash />} />
          <Route path="/loans" element={<Loans />} />
          <Route path="/checks" element={<Checks />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
