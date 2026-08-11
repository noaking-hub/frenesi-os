import 'server-only'

import { diasAteAniversario } from '@/domain'

import { supabaseConfigurado, supabaseServer } from './supabase'
import { chamarYampi, yampiConfigurada } from './yampi'

/**
 * Giftback: aniversário no cadastro + registro do presente por ano.
 *
 * A data pode vir da Yampi (o checkout pede nascimento em muitas lojas) ou
 * ser cadastrada à mão. O envio é um por aniversário — o unique (email, ano)
 * do banco é quem garante.
 */

export interface Aniversariante {
  nome: string
  email: string
  telefone: string | null
  /** aaaa-mm-dd como está no cadastro. */
  aniversario: string
  diasAte: number
  parabenizadoEsteAno: boolean
  cupomDoAno: string | null
}

export async function aniversariantes(): Promise<{
  lista: Aniversariante[]
  comAniversario: number
  semAniversario: number
}> {
  if (!supabaseConfigurado()) return { lista: [], comAniversario: 0, semAniversario: 0 }
  const sb = supabaseServer()
  const ano = new Date().getFullYear()

  const [{ data: clientes, error }, { data: enviados }] = await Promise.all([
    sb.from('clientes').select('nome, email, telefone, aniversario').limit(5000),
    sb.from('giftbacks_enviados').select('email, cupom').eq('ano', ano),
  ])
  if (error) throw error

  const parabenizados = new Map((enviados ?? []).map((g) => [g.email as string, g.cupom as string | null]))
  const hoje = new Date()

  const linhas = (clientes ?? []) as {
    nome: string
    email: string
    telefone: string | null
    aniversario: string | null
  }[]
  const lista = linhas
    .filter((c) => c.aniversario)
    .flatMap((c) => {
      const dias = diasAteAniversario(c.aniversario as string, hoje)
      if (dias === null) return []
      return [
        {
          nome: c.nome,
          email: c.email,
          telefone: c.telefone,
          aniversario: c.aniversario as string,
          diasAte: dias,
          parabenizadoEsteAno: parabenizados.has(c.email),
          cupomDoAno: parabenizados.get(c.email) ?? null,
        },
      ]
    })
    .sort((a, b) => a.diasAte - b.diasAte)

  return {
    lista,
    comAniversario: lista.length,
    semAniversario: linhas.length - lista.length,
  }
}

export async function gravarAniversario(email: string, aniversario: string): Promise<void> {
  const { error } = await supabaseServer()
    .from('clientes')
    .update({ aniversario })
    .eq('email', email)
  if (error) throw error
}

export async function registrarGiftback(dados: {
  email: string
  cupom: string | null
  canal: 'email' | 'whatsapp'
}): Promise<void> {
  const { error } = await supabaseServer().from('giftbacks_enviados').insert({
    email: dados.email,
    ano: new Date().getFullYear(),
    cupom: dados.cupom,
    canal: dados.canal,
  })
  if (error) {
    if (/duplicate|unique/i.test(error.message ?? '')) {
      throw new Error('Este cliente já foi parabenizado este ano — um presente por aniversário.')
    }
    throw error
  }
}

/**
 * Puxa datas de nascimento do cadastro de clientes da Yampi, quando a loja
 * as coleta. Leitura defensiva: o campo muda de nome entre contas.
 */
export async function importarAniversariosYampi(): Promise<{ atualizados: number; lidos: number }> {
  if (!yampiConfigurada()) {
    throw new Error('A Yampi precisa estar configurada para importar aniversários.')
  }
  const sb = supabaseServer()
  let lidos = 0
  let atualizados = 0

  for (let pagina = 1; pagina <= 40; pagina++) {
    const r = await chamarYampi<{
      data?: Record<string, unknown>[]
      meta?: { pagination?: { current_page: number; total_pages: number } }
    }>('/customers', { limit: '50', page: String(pagina) })
    const registros = r.data ?? []
    lidos += registros.length

    for (const c of registros) {
      const email = typeof c.email === 'string' ? c.email.trim().toLowerCase() : null
      const cru =
        c.birthday ?? c.birth_date ?? c.birthdate ?? c.date_of_birth ?? c.data_nascimento ?? null
      const bruto =
        typeof cru === 'string'
          ? cru
          : cru && typeof cru === 'object' && 'date' in (cru as object)
            ? String((cru as { date: unknown }).date)
            : null
      if (!email || !bruto) continue
      // "1993-05-14 00:00:00" e "14/05/1993" viram aaaa-mm-dd.
      const iso =
        bruto.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ??
        (bruto.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
          ? bruto.replace(/^(\d{2})\/(\d{2})\/(\d{4}).*$/, '$3-$2-$1')
          : null)
      if (!iso) continue
      const { data } = await sb
        .from('clientes')
        .update({ aniversario: iso })
        .eq('email', email)
        .is('aniversario', null)
        .select('id')
      if (data && data.length > 0) atualizados++
    }

    const p = r.meta?.pagination
    if (!p || p.current_page >= p.total_pages) break
  }

  return { atualizados, lidos }
}
