'use server'

import { revalidatePath } from 'next/cache'

import {
  coletarConcorrente,
  diagnosticarLoja,
  dominioNormalizado,
  mensagemDe,
  normalizarTitulo,
} from '@/data/concorrentes'
import type { Diagnostico } from '@/data/concorrentes'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import { casarTitulo } from '@/domain'

export type Resposta<T = object> = ({ ok: true } & T) | { ok: false; erro: string }

function exigeSupabase(acao: string) {
  return supabaseConfigurado()
    ? null
    : { ok: false as const, erro: `O Supabase precisa estar configurado para ${acao}.` }
}

/** Cadastra uma loja a monitorar. O id sai do domínio: é único e legível. */
export async function adicionarConcorrente(
  nome: string,
  dominio: string,
  coleta: 'shopify' | 'nuvemshop' | 'manual',
): Promise<Resposta<{ id: string }>> {
  const bloqueio = exigeSupabase('cadastrar concorrentes')
  if (bloqueio) return bloqueio

  const limpo = dominioNormalizado(dominio)
  if (!limpo || !limpo.includes('.')) {
    return { ok: false, erro: 'Informe o domínio da loja, como loja.com.br.' }
  }
  if (!nome.trim()) return { ok: false, erro: 'Informe o nome do concorrente.' }

  const id = limpo.replace(/[^a-z0-9]+/g, '-')
  const { error } = await supabaseServer()
    .from('concorrentes')
    .insert({ id, nome: nome.trim(), dominio: limpo, coleta })
  if (error) {
    if (error.code === '23505') return { ok: false, erro: `${limpo} já está cadastrado.` }
    console.error('[concorrentes] adicionar falhou:', error)
    return { ok: false, erro: error.message }
  }

  revalidatePath('/', 'layout')
  return { ok: true, id }
}

export async function removerConcorrente(id: string): Promise<Resposta> {
  const bloqueio = exigeSupabase('remover concorrentes')
  if (bloqueio) return bloqueio
  const { error } = await supabaseServer().from('concorrentes').delete().eq('id', id)
  if (error) return { ok: false, erro: error.message }
  revalidatePath('/', 'layout')
  return { ok: true }
}

export interface ResumoColeta {
  fonte: string
  lidos: number
  casados: number
  erro: string | null
}

/**
 * Lê todas as fontes automáticas.
 *
 * Uma fonte que falha NÃO derruba as outras: cada uma reporta o próprio
 * resultado. Preço de mercado com três lojas de quatro continua servindo para
 * decidir — desde que a tela diga quais três.
 */
export async function vascularPrecos(): Promise<Resposta<{ resumo: ResumoColeta[] }>> {
  const bloqueio = exigeSupabase('coletar preços')
  if (bloqueio) return bloqueio

  const { data, error } = await supabaseServer()
    .from('concorrentes')
    .select('id, nome')
    .eq('ativo', true)
    .neq('coleta', 'manual')
  if (error) return { ok: false, erro: error.message }
  if (!data?.length) {
    return { ok: false, erro: 'Nenhuma fonte com leitura automática cadastrada.' }
  }

  const resumo: ResumoColeta[] = []
  for (const f of data) {
    try {
      const r = await coletarConcorrente(f.id)
      resumo.push({ fonte: f.nome, lidos: r.lidos, casados: r.casados, erro: null })
    } catch (e) {
      resumo.push({ fonte: f.nome, lidos: 0, casados: 0, erro: mensagemDe(e) })
    }
  }

  revalidatePath('/', 'layout')
  return { ok: true, resumo }
}

/**
 * Lê UMA loja.
 *
 * Vasculhar todas leva minutos — são centenas de páginas por loja, lidas
 * devagar de propósito. Quando só uma mudou de preço, ou só uma estava fora do
 * ar na rodada anterior, reler as outras é espera à toa.
 */
export async function vascularConcorrente(
  id: string,
): Promise<Resposta<{ resumo: ResumoColeta }>> {
  const bloqueio = exigeSupabase('coletar preços')
  if (bloqueio) return bloqueio

  const { data, error } = await supabaseServer()
    .from('concorrentes')
    .select('id, nome, coleta')
    .eq('id', id)
    .maybeSingle()
  if (error) return { ok: false, erro: error.message }
  if (!data) return { ok: false, erro: 'Concorrente não encontrado.' }
  if (data.coleta === 'manual') {
    return { ok: false, erro: `${data.nome} está como leitura manual — lance os preços à mão.` }
  }

  try {
    const r = await coletarConcorrente(id)
    revalidatePath('/', 'layout')
    return { ok: true, resumo: { fonte: data.nome, lidos: r.lidos, casados: r.casados, erro: null } }
  } catch (e) {
    revalidatePath('/', 'layout')
    return { ok: false, erro: `${data.nome}: ${mensagemDe(e)}` }
  }
}

/**
 * Mostra o que a loja devolve, cru.
 *
 * É a ferramenta que evita adivinhação: cada passo da leitura com o que
 * aconteceu, uma amostra do que foi extraído e um trecho da resposta. Quando
 * a coleta não sai como esperado, é aqui que se descobre o motivo.
 */
export async function diagnosticarConcorrente(
  dominio: string,
  estrategia: 'shopify' | 'nuvemshop' | 'manual' = 'nuvemshop',
): Promise<Resposta<{ diagnostico: Diagnostico }>> {
  if (estrategia === 'manual') {
    return { ok: false, erro: 'Fonte manual não é lida automaticamente.' }
  }
  try {
    return { ok: true, diagnostico: await diagnosticarLoja(dominio, estrategia) }
  } catch (e) {
    return { ok: false, erro: mensagemDe(e) }
  }
}

/** Preço digitado à mão. É o caminho que funciona em qualquer loja. */
export async function lancarPrecoManual(dados: {
  concorrenteId: string
  baseId: string
  variante: number
  preco: number
}): Promise<Resposta> {
  const bloqueio = exigeSupabase('lançar preços')
  if (bloqueio) return bloqueio
  if (!dados.concorrenteId) return { ok: false, erro: 'Escolha o concorrente.' }
  if (!dados.baseId) return { ok: false, erro: 'Escolha o perfume.' }
  if (!(dados.preco > 0)) return { ok: false, erro: 'Informe o preço praticado.' }

  const sb = supabaseServer()
  const { data: base } = await sb
    .from('perfumes_base')
    .select('nome')
    .eq('id', dados.baseId)
    .maybeSingle()

  const { error } = await sb.from('concorrente_precos').upsert(
    {
      concorrente_id: dados.concorrenteId,
      // Chave estável do lançamento manual: relançar o mesmo par substitui,
      // em vez de criar uma segunda observação do mesmo produto.
      chave: `manual|${dados.baseId}|${dados.variante}`,
      base_id: dados.baseId,
      variante: dados.variante,
      titulo: `${base?.nome ?? dados.baseId} · ${dados.variante} ml (lançado à mão)`,
      preco: dados.preco,
      url: null,
      lido_em: new Date().toISOString(),
    },
    { onConflict: 'concorrente_id,chave' },
  )
  if (error) {
    console.error('[concorrentes] lançar preço falhou:', error)
    return { ok: false, erro: error.message }
  }

  await sb
    .from('concorrentes')
    .update({ ultima_leitura: new Date().toISOString(), ultimo_status: 'manual', ultimo_erro: null })
    .eq('id', dados.concorrenteId)

  revalidatePath('/', 'layout')
  return { ok: true }
}

/**
 * Ensina que um título de concorrente é uma base nossa.
 *
 * Grava o apelido E aplica no que já foi lido — senão o operador ensinaria o
 * nome e não veria efeito nenhum até a próxima coleta.
 */
export async function ensinarApelido(titulo: string, baseId: string): Promise<Resposta> {
  const bloqueio = exigeSupabase('ensinar nomes')
  if (bloqueio) return bloqueio
  if (!baseId) return { ok: false, erro: 'Escolha o perfume do catálogo.' }

  const sb = supabaseServer()
  const normalizado = normalizarTitulo(titulo)

  const { error } = await sb
    .from('concorrente_apelidos')
    .upsert({ titulo_normalizado: normalizado, base_id: baseId }, { onConflict: 'titulo_normalizado' })
  if (error) return { ok: false, erro: error.message }

  const { error: erroAplicar } = await sb
    .from('concorrente_precos')
    .update({ base_id: baseId })
    .is('base_id', null)
    .eq('titulo', titulo)
  if (erroAplicar) return { ok: false, erro: erroAplicar.message }

  revalidatePath('/', 'layout')
  return { ok: true }
}

/**
 * Tenta casar de novo o que ficou sem dono.
 *
 * Útil depois de o catálogo mudar: perfume cadastrado hoje pode dar dono a um
 * título lido semana passada.
 */
export async function recasarPendentes(): Promise<Resposta<{ casados: number }>> {
  const bloqueio = exigeSupabase('recasar preços')
  if (bloqueio) return bloqueio

  const sb = supabaseServer()
  const [{ data: pendentes, error: e1 }, { data: bases, error: e2 }] = await Promise.all([
    sb.from('concorrente_precos').select('concorrente_id, chave, titulo').is('base_id', null),
    sb.from('perfumes_base').select('id, nome, marca').eq('ativo', true),
  ])
  if (e1) return { ok: false, erro: e1.message }
  if (e2) return { ok: false, erro: e2.message }

  const catalogo = (bases ?? []) as { id: string; nome: string; marca: string }[]
  let casados = 0

  for (const p of pendentes ?? []) {
    const c = casarTitulo(p.titulo as string, catalogo)
    if (!c) continue
    const { error } = await sb
      .from('concorrente_precos')
      .update({ base_id: c.baseId })
      .eq('concorrente_id', p.concorrente_id)
      .eq('chave', p.chave)
    if (!error) casados++
  }

  revalidatePath('/', 'layout')
  return { ok: true, casados }
}
