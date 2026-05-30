import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) {
    return <div className="grid h-full place-items-center text-slate-400">Loading…</div>
  }
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}
