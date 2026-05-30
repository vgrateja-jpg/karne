import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { isConfigured } from '../lib/supabase'
import { Button, Input, Field, Banner } from '../components/ui'

export function Login() {
  const { session, signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (session) return <Navigate to="/" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await signIn(email.trim(), password)
    setBusy(false)
    if (error) setError(error)
    else navigate('/')
  }

  return (
    <div className="grid min-h-full place-items-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-3xl font-bold tracking-tight text-rose-600">Karne</div>
          <p className="mt-1 text-sm text-slate-500">Orders, inventory &amp; receivables</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {!isConfigured && (
            <Banner kind="info">
              Supabase isn’t configured yet. Add your project URL and publishable key to{' '}
              <code>app/.env.local</code> (see <code>.env.example</code>).
            </Banner>
          )}
          {error && <Banner kind="error">{error}</Banner>}
          <Field label="Email">
            <Input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
          <p className="text-center text-xs text-slate-400">
            Accounts are created by the owner. No public sign-up.
          </p>
        </form>
      </div>
    </div>
  )
}
