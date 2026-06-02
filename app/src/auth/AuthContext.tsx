import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export type Role = 'dev' | 'owner' | 'staff'

interface AuthState {
  session: Session | null
  role: Role | null
  isOwner: boolean // dev or owner = full access
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<Role | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    function loadRoleThenFinish(s: Session | null) {
      if (!s) {
        setRole(null)
        setLoading(false)
        return
      }
      supabase
        .from('profiles')
        .select('role')
        .eq('id', s.user.id)
        .single()
        .then(({ data }) => {
          if (!active) return
          setRole((data?.role as Role) ?? 'staff')
          setLoading(false)
        })
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      loadRoleThenFinish(data.session)
    })

    // IMPORTANT: don't await Supabase calls *inside* this callback — it holds an
    // internal lock and would deadlock. Defer the role fetch with setTimeout.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setTimeout(() => {
        if (active) loadRoleThenFinish(s)
      }, 0)
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error ? error.message : null }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, role, isOwner: role === 'owner' || role === 'dev', loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
