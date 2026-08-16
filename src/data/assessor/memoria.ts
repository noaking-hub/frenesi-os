import 'server-only'

import { supabaseConfigurado, supabaseServer } from '@/data/supabase'

/**
 * Memória do Gerente — §9 e §9.1.
 *
 * A regra que define o módulo inteiro está na quarta camada do escopo: **dados
 * do negócio nunca são memorizados**. Saldo, estoque, preço e pedido são
 * consultados em tempo de resposta, sempre. Memória que guarda saldo vira saldo
 * velho apresentado como atual, e num ERP financeiro isso é pior do que não
 * lembrar de nada.
 *
 * Sobram duas camadas persistentes: PREFERÊNCIA (como a pessoa quer ver) e
 * DECISÃO (o que ela já resolveu e não quer rediscutir). Ambas cabem numa
 * frase, ambas são visíveis e ambas podem ser apagadas.
 */

export interface Memoria {
  id: string
  tipo: 'preferencia' | 'decisao'
  chave: string
  valor: string
  origem: 'usuario' | 'aprovada'
  criadaEm: string
  atualizadaEm: string
}

/** Teto de memórias por usuário — e ele existe para proteger a RESPOSTA. */
const TETO = 40

export async function lerMemorias(usuarioId: string | null): Promise<Memoria[]> {
  if (!supabaseConfigurado()) return []
  const { data, error } = await supabaseServer()
    .from('gerente_memorias')
    .select('*')
    .eq('usuario_id', usuarioId ?? 'sessao-anonima')
    .order('atualizada_em', { ascending: false })
    .limit(TETO)
  if (error) throw new Error(error.message)
  return (data ?? []).map((m) => ({
    id: String(m.id),
    tipo: m.tipo as Memoria['tipo'],
    chave: String(m.chave),
    valor: String(m.valor),
    origem: m.origem as Memoria['origem'],
    criadaEm: String(m.criada_em),
    atualizadaEm: String(m.atualizada_em),
  }))
}

export async function gravarMemoria(dados: {
  usuarioId: string | null
  tipo: 'preferencia' | 'decisao'
  chave: string
  valor: string
  origem?: 'usuario' | 'aprovada'
  traceId?: string
}): Promise<void> {
  if (!supabaseConfigurado()) throw new Error('Supabase não configurado.')
  const { error } = await supabaseServer()
    .from('gerente_memorias')
    .upsert(
      {
        usuario_id: dados.usuarioId ?? 'sessao-anonima',
        tipo: dados.tipo,
        chave: dados.chave.trim().toLowerCase(),
        valor: dados.valor.trim(),
        origem: dados.origem ?? 'usuario',
        trace_id: dados.traceId ?? null,
        atualizada_em: new Date().toISOString(),
      },
      // A chave SUBSTITUI. Sem isto, "prefiro ver em 30 dias" dito três vezes
      // viraria três memórias concorrentes e o Gerente escolheria uma sem
      // critério nenhum.
      { onConflict: 'usuario_id,chave' },
    )
  if (error) throw new Error(error.message)
}

export async function apagarMemoria(id: string, usuarioId: string | null): Promise<void> {
  if (!supabaseConfigurado()) throw new Error('Supabase não configurado.')
  const { error } = await supabaseServer()
    .from('gerente_memorias')
    .delete()
    .eq('id', id)
    // O dono confere: um id adivinhado não apaga a preferência de outra pessoa.
    .eq('usuario_id', usuarioId ?? 'sessao-anonima')
  if (error) throw new Error(error.message)
}

/**
 * O texto que entra no prompt.
 *
 * Curto e rotulado, e com o aviso final que resolve o conflito do §9.1: quando
 * a memória contraria a configuração oficial, PREVALECE O ERP e a divergência é
 * dita em voz alta. Sem essa linha, uma preferência velha silenciosamente
 * venceria uma regra de negócio nova — e ninguém saberia por quê.
 */
export function memoriaParaPrompt(memorias: Memoria[]): string {
  if (memorias.length === 0) return ''
  const preferencias = memorias.filter((m) => m.tipo === 'preferencia')
  const decisoes = memorias.filter((m) => m.tipo === 'decisao')

  const bloco = (titulo: string, itens: Memoria[]) =>
    itens.length === 0 ? '' : `\n${titulo}\n${itens.map((m) => `- ${m.valor}`).join('\n')}`

  return `
O QUE VOCÊ JÁ SABE SOBRE ESTE USUÁRIO:${bloco('Preferências:', preferencias)}${bloco(
    'Decisões que ele já tomou (não rediscuta sem motivo novo):',
    decisoes,
  )}

Isto é preferência e histórico, NÃO é dado da operação — nenhum número aqui vale
como fato. E se alguma dessas linhas contrariar uma configuração oficial do ERP,
vale o ERP: siga a configuração e diga ao usuário que a preferência dele conflita
com ela.`
}
