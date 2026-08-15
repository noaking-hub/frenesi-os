import 'server-only'

import { supabaseConfigurado, supabaseServer } from '@/data/supabase'

/**
 * Memória do Assessor: conversas e mensagens.
 *
 * A conversa fica no banco, não no navegador, por dois motivos. O primeiro é
 * que o histórico é o que faz "e no mês passado?" significar alguma coisa — sem
 * ele cada pergunta nasce órfã. O segundo é auditoria: o escopo exige saber o
 * que foi perguntado e o que foi respondido, e um histórico que mora na aba do
 * usuário desaparece quando ele fecha a aba.
 *
 * O que NÃO fica guardado é o resultado das ferramentas. Ele é recalculado a
 * cada pergunta, de propósito: número de ontem devolvido como se fosse de hoje
 * é a pior forma de erro num ERP financeiro.
 */

export type Papel = 'usuario' | 'assessor'

export interface Mensagem {
  id: number
  papel: Papel
  texto: string
  ferramentas: { nome: string; ms: number; erro?: string }[]
  criadaEm: string
}

export interface Conversa {
  id: string
  titulo: string
  criadaEm: string
  atualizadaEm: string
}

/** Conversas recentes de quem está usando — as arquivadas ficam de fora. */
export async function listarConversas(usuarioId: string | null, limite = 20): Promise<Conversa[]> {
  if (!supabaseConfigurado()) return []
  let consulta = supabaseServer()
    .from('assessor_conversas')
    .select('id, titulo, criada_em, atualizada_em')
    .is('arquivada_em', null)
    .order('atualizada_em', { ascending: false })
    .limit(limite)

  // Sem usuário identificado (ERP aberto localmente), lista as sem dono. Não
  // é o mesmo que "lista tudo": conversa de gente logada não vaza para quem não está.
  consulta = usuarioId ? consulta.eq('usuario_id', usuarioId) : consulta.is('usuario_id', null)

  const { data } = await consulta
  return (data ?? []).map((c) => ({
    id: c.id as string,
    titulo: c.titulo as string,
    criadaEm: c.criada_em as string,
    atualizadaEm: c.atualizada_em as string,
  }))
}

/** Mensagens de uma conversa, em ordem. */
export async function lerMensagens(conversaId: string): Promise<Mensagem[]> {
  if (!supabaseConfigurado()) return []
  const { data } = await supabaseServer()
    .from('assessor_mensagens')
    .select('id, papel, texto, ferramentas, criada_em')
    .eq('conversa_id', conversaId)
    .order('id', { ascending: true })

  return (data ?? []).map((m) => ({
    id: m.id as number,
    papel: m.papel as Papel,
    texto: m.texto as string,
    ferramentas: (m.ferramentas ?? []) as Mensagem['ferramentas'],
    criadaEm: m.criada_em as string,
  }))
}

/**
 * Título a partir da primeira pergunta.
 *
 * Nomear a conversa com o que foi perguntado é o que torna a lista lateral
 * navegável — "Nova conversa" repetido oito vezes não é uma lista, é um monte.
 */
function tituloDe(pergunta: string): string {
  const limpo = pergunta.replace(/\s+/g, ' ').trim()
  return limpo.length <= 60 ? limpo || 'Nova conversa' : `${limpo.slice(0, 57)}…`
}

export async function abrirConversa(usuarioId: string | null, pergunta: string): Promise<string> {
  const { data, error } = await supabaseServer()
    .from('assessor_conversas')
    .insert({ usuario_id: usuarioId, titulo: tituloDe(pergunta) })
    .select('id')
    .single()
  if (error) throw new Error(`Não consegui abrir a conversa: ${error.message}`)
  return data.id as string
}

/**
 * Confirma que a conversa é de quem diz ser.
 *
 * O id da conversa vem do navegador, e id que vem do navegador pode ser
 * trocado. Sem esta checagem, bastaria adivinhar um uuid para ler a conversa
 * de outra pessoa — e o histórico do Assessor tem números da operação inteira.
 */
export async function conversaDoUsuario(
  conversaId: string,
  usuarioId: string | null,
): Promise<boolean> {
  if (!supabaseConfigurado()) return false
  const { data } = await supabaseServer()
    .from('assessor_conversas')
    .select('usuario_id')
    .eq('id', conversaId)
    .maybeSingle()
  if (!data) return false
  return (data.usuario_id as string | null) === usuarioId
}

export async function gravarMensagem(dados: {
  conversaId: string
  papel: Papel
  texto: string
  ferramentas?: { nome: string; ms: number; erro?: string }[]
}): Promise<void> {
  await supabaseServer().from('assessor_mensagens').insert({
    conversa_id: dados.conversaId,
    papel: dados.papel,
    texto: dados.texto,
    ferramentas: dados.ferramentas ?? [],
  })
  await supabaseServer()
    .from('assessor_conversas')
    .update({ atualizada_em: new Date().toISOString() })
    .eq('id', dados.conversaId)
}

/** Arquivar, não apagar: a auditoria continua valendo depois de sumir da lista. */
export async function arquivarConversa(conversaId: string, usuarioId: string | null) {
  if (!(await conversaDoUsuario(conversaId, usuarioId))) return false
  await supabaseServer()
    .from('assessor_conversas')
    .update({ arquivada_em: new Date().toISOString() })
    .eq('id', conversaId)
  return true
}
