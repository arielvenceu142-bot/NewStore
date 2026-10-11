import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigured = Boolean(url && key && !url.includes('YOUR_PROJECT'))
export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  key || 'placeholder-anon-key',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
)

export type Product = {
  id: string; name: string; description: string | null; category: string
  price_cents: number; image_url: string | null; stock: number | null; active: boolean
}
export type StoreSettings = { store_name: string; primary_color: string; secondary_color: string; promo_banner: string | null }
export const money = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
