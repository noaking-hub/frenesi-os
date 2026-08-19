'use server'

import { assessorConfigurado, atorDoErp, executarInteracao } from '@/data/assessor/motor'
import { carregarEstoque } from '@/data/consultas'
import { sessaoAtual } from '@/data/sessao'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import { paresDePerfil } from '@/domain'

/**
 * A curadoria refinada pelo Gerente — o mesmo motor com política, limites e
 * auditoria que atende o resto do ERP, agora olhando para UM lead.
 *
 * A afinidade estatística ordena o que perfis parecidos clicaram; o modelo
 * entra por cima com o que a estatística não tem: conhecimento de perfumaria
 * (o que é um âmbar especiado, com o que um cítrico aromático conversa) e a
 * restrição ao que a FRENESI pode VENDER HOJE — a lista de disponíveis vai no
 * pedido, e fora dela não vale recomendar.
 */
export async function curadoriaDoGerente(
  email: string,
): Promise<{ ok: true; texto: string } | { ok: false; erro: string }> {
  if (!assessorConfigurado()) {
    return { ok: false, erro: 'O Gerente IA não está configurado (falta a chave do modelo).' }
  }
  if (!supabaseConfigurado()) return { ok: false, erro: 'Supabase não configurado.' }

  const alvo = email.trim().toLowerCase()
  if (!alvo) return { ok: false, erro: 'Lead sem e-mail.' }

  const { data } = await supabaseServer()
    .from('quiz_respostas')
    .select('dados')
    .eq('id', `lead:${alvo}`)
    .maybeSingle()
  const perfil = paresDePerfil((data?.dados as { respostas?: unknown } | null)?.respostas)
  if (perfil.length === 0) {
    return { ok: false, erro: 'Este lead não tem perfil de respostas gravado.' }
  }

  // Só o que dá para vender hoje: base sob controle de estoque com ml
  // disponível. Recomendar o indisponível é queimar a recomendação.
  const estoque = await carregarEstoque()
  const disponiveis = estoque.coberturas
    .filter((c) => c.disponivelMl > 0)
    .sort((a, b) => b.disponivelMl - a.disponivelMl)
    .slice(0, 80)
    .map((c) => `${c.base.nome}${c.base.marca ? ` — ${c.base.marca}` : ''}`)
  if (disponiveis.length === 0) {
    return { ok: false, erro: 'Nenhuma base com estoque disponível para recomendar.' }
  }

  const linhasDePerfil = perfil.map(([p, v]) => `${p}: ${v}`).join('; ')
  const pergunta =
    `Monte a curadoria olfativa para um lead do quiz da FRENESI.\n\n` +
    `PERFIL DECLARADO — ${linhasDePerfil}\n\n` +
    `PERFUMES DISPONÍVEIS HOJE (recomende SOMENTE desta lista, respeitando o gênero do perfil):\n` +
    disponiveis.map((d) => `- ${d}`).join('\n') +
    `\n\nEscolha os 3 que melhor servem a este perfil. Para cada um, escreva UMA frase de` +
    ` por que combina, no tom da marca (elegante, direto), pronta para o atendimento enviar` +
    ` no WhatsApp. Sem preço, sem link, sem inventar perfume fora da lista.`

  const sessao = await sessaoAtual()
  try {
    const r = await executarInteracao({
      pergunta,
      ator: atorDoErp(sessao?.id ?? null, sessao?.papel ?? 'operacao'),
      canal: 'erp',
      conversaId: null,
    })
    const texto = r?.texto?.trim()
    if (!texto) return { ok: false, erro: 'O Gerente não devolveu resposta.' }
    return { ok: true, texto }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
}
