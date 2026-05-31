import { Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { Products } from './pages/Products'
import { Customers } from './pages/Customers'
import { CustomerStatement } from './pages/CustomerStatement'
import { NewOrder } from './pages/NewOrder'
import { Orders } from './pages/Orders'
import { Inventory } from './pages/Inventory'
import { Month } from './pages/Month'
import { Receipt } from './pages/Receipt'
import { Settings } from './pages/Settings'
import { Inbox } from './pages/Inbox'

export default function App() {
  return (
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
        <Route path="/inbox" element={<Inbox />} />
        <Route path="/month" element={<Month />} />
        <Route path="/orders/new" element={<NewOrder />} />
        <Route path="/orders/:id/receipt" element={<Receipt />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/customers/:id" element={<CustomerStatement />} />
        <Route path="/products" element={<Products />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}
