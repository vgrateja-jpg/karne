import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const isConfigured = Boolean(url && key)

if (!isConfigured) {
  // Surfaced in the UI too — this just helps when running locally.
  console.warn(
    'Supabase is not configured. Copy app/.env.example to app/.env.local and fill in your project URL + publishable key.',
  )
}

export const supabase = createClient(url ?? 'http://localhost', key ?? 'anon', {
  auth: { persistSession: true, autoRefreshToken: true },
})
