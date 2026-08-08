import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Cliente Supabase do servidor.
 *
 * Enquanto o projeto não está provisionado, `repository.ts` cai nos fixtures.
 * Assim que as variáveis existirem, as consultas passam a vir do banco criado
 * por `supabase/migrations`.
 */

let cached: SupabaseClient | null = null

export function supabaseConfigurado(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  )
}

export function supabaseServer(): SupabaseClient {
  if (!supabaseConfigurado()) {
    throw new Error(
      'Supabase não configurado. Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.',
    )
  }
  if (!cached) {
    cached = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    )
  }
  return cached
}
