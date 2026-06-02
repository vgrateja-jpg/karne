import { useState } from 'react'
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

interface NavItem {
  to: string
  label: string
  icon: string
  end?: boolean
  staff?: boolean // visible to the staff role (everything else is owner/dev only)
}

// Paths a staff member may open directly (everything else redirects them).
const STAFF_PREFIXES = ['/orders', '/inbox', '/delivery', '/inventory', '/butchering', '/profile']
const staffCanOpen = (path: string) => STAFF_PREFIXES.some((p) => path === p || path.startsWith(p + '/'))
interface NavGroup {
  title: string
  items: NavItem[]
}

const groups: NavGroup[] = [
  {
    title: 'Daily',
    items: [
      { to: '/', label: 'Home', icon: '🏠', end: true },
      { to: '/orders/new', label: 'New Order', icon: '✍️', staff: true },
      { to: '/inbox', label: 'Text Orders', icon: '📩', staff: true },
      { to: '/orders', label: 'Orders', icon: '🧾', staff: true },
      { to: '/delivery', label: 'Deliveries', icon: '🚛', staff: true },
    ],
  },
  {
    title: 'Stock',
    items: [
      { to: '/butchering', label: 'Butchering', icon: '🔪', staff: true },
      { to: '/products', label: 'Prices', icon: '🏷️' },
      { to: '/inventory', label: 'Stock', icon: '📦', staff: true },
    ],
  },
  {
    title: 'People',
    items: [
      { to: '/customers', label: 'Customers', icon: '👥' },
      { to: '/purchases', label: 'Suppliers', icon: '🚚' },
      { to: '/staff', label: 'Staff & Salaries', icon: '🧑‍🍳' },
    ],
  },
  {
    title: 'Money',
    items: [
      { to: '/cash', label: 'Cash & Banks', icon: '💵' },
      { to: '/cashcount', label: 'Cash Count', icon: '🧮' },
      { to: '/receivables', label: 'Receivables', icon: '📥' },
      { to: '/expenses', label: 'Expenses', icon: '💸' },
      { to: '/checks', label: 'Cheques', icon: '💳' },
      { to: '/loans', label: 'Loans', icon: '🏦' },
    ],
  },
  {
    title: 'Reports & setup',
    items: [
      { to: '/daily', label: 'Daily Report', icon: '📆' },
      { to: '/month', label: 'Monthly Report', icon: '📊' },
      { to: '/history', label: 'Historical', icon: '🗂️' },
      { to: '/audit', label: 'Audit Trail', icon: '📜' },
      { to: '/profile', label: 'My Profile', icon: '👤', staff: true },
      { to: '/settings', label: 'Settings', icon: '⚙️' },
    ],
  },
]

export function Layout() {
  const { signOut, session, isOwner } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)

  // Staff see only their operational tools; owner/dev see everything.
  const visibleGroups = groups
    .map((g) => ({ ...g, items: isOwner ? g.items : g.items.filter((i) => i.staff) }))
    .filter((g) => g.items.length > 0)
  const blocked = !isOwner && !staffCanOpen(location.pathname)

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 py-4">
        <span className="text-xl font-bold tracking-tight text-rose-600">🥩 Karne</span>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-2">
        {visibleGroups.map((g) => (
          <div key={g.title} className="mb-3">
            <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              {g.title}
            </div>
            {g.items.map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                end={it.end}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm font-medium ${
                    isActive ? 'bg-rose-50 text-rose-700' : 'text-slate-600 hover:bg-slate-100'
                  }`
                }
              >
                <span className="w-5 text-center text-base">{it.icon}</span>
                {it.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="border-t border-slate-200 p-3 text-xs text-slate-500">
        <div className="truncate px-2 pb-2">{session?.user?.email}</div>
        <button
          onClick={handleSignOut}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 font-medium text-slate-700 hover:bg-slate-50"
        >
          Sign out
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-full">
      {/* mobile top bar */}
      <header className="no-print sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 md:hidden">
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="text-2xl leading-none text-slate-700"
        >
          ☰
        </button>
        <span className="text-lg font-bold tracking-tight text-rose-600">🥩 Karne</span>
      </header>

      {/* desktop sidebar */}
      <aside className="no-print fixed inset-y-0 left-0 hidden w-60 border-r border-slate-200 bg-white md:block">
        {sidebar}
      </aside>

      {/* mobile drawer */}
      {open && (
        <div className="no-print fixed inset-0 z-30 md:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl">{sidebar}</div>
        </div>
      )}

      {/* content */}
      <main className="px-4 py-6 md:ml-60 print:ml-0">
        <div className="mx-auto max-w-5xl">
          {blocked ? <Navigate to="/orders/new" replace /> : <Outlet />}
        </div>
      </main>
    </div>
  )
}
