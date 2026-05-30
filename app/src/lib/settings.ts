import { supabase } from './supabase'

export interface AppSettings {
  business_name: string
  address: string | null
  phone: string | null
  receipt_footer: string | null
}

const fallback: AppSettings = {
  business_name: 'My Meat Shop',
  address: null,
  phone: null,
  receipt_footer: 'Thank you!',
}

export async function fetchSettings(): Promise<AppSettings> {
  const { data } = await supabase.from('app_settings').select('*').eq('id', true).single()
  return (data as AppSettings) ?? fallback
}
