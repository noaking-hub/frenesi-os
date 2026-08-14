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

/**
 * O PostgREST devolve no máximo 1.000 linhas por requisição — com 2.000+
 * variantes, uma leitura sem paginação enxerga metade do catálogo e não avisa
 * nada: o retorno é um 200 com uma lista curta. Foi assim que o casamento de
 * item por SKU perdeu 56% dos itens de pedido, todos com SKU depois da
 * milésima linha. Toda leitura de tabela grande passa por aqui.
 */
export async function tudoDe<T>(
  tabela: string,
  pagina: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const TAMANHO = 1000
  const linhas: T[] = []
  for (let de = 0; ; de += TAMANHO) {
    const { data, error } = await pagina(de, de + TAMANHO - 1)
    if (error) throw error
    const parte = data ?? []
    linhas.push(...parte)
    if (parte.length < TAMANHO) break
    if (de > 100_000) throw new Error(`Paginação de ${tabela} passou de 100 mil linhas`)
  }
  return linhas
}
