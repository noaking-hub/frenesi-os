'use server'

import { assessorConfigurado, atorDoErp, executarInteracao } from '@/data/assessor/motor'
import { catalogoComDna } from '@/data/quiz'
import { sessaoAtual } from '@/data/sessao'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import { curadoriaPorDna, paresDePerfil } from '@/domain'

/**
 * A curadoria refinada pelo Gerente — o mesmo motor com política, limites e
 * auditoria que atende o resto do ERP, agora olhando para UM lead.
 *
 * A seleção é DETERMINÍSTICA: perfil × DNA olfativo do catálogo espelhado do
 * quiz (curadoriaPorDna). O modelo não escolhe nem inventa — recebe os
 * candidatos já cruzados, com o porquê de cada um, e entra só para compor o
 * texto no tom da marca. Foi a lição da primeira versão: sem base de
 * conhecimento no pedido, o motor recusa (corretamente) a recomendar.
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

  const catalogo = await catalogoComDna()
  if (catalogo.length === 0) {
    return {
      ok: false,
      erro: 'O catálogo do quiz ainda não foi espelhado — rode a sincronização de vendas.',
    }
  }

  const escolhas = curadoriaPorDna(perfil, catalogo, 6)
  if (escolhas.length === 0) {
    return {
      ok: false,
      erro: 'Nenhum perfume do catálogo casa o suficiente com este perfil — melhor não recomendar do que errar.',
    }
  }

  const linhasDePerfil = perfil.map(([p, v]) => `${p}: ${v}`).join('; ')
  const linhasDeEscolhas = escolhas
    .map((e, i) => {
      const partes = [
        `${i + 1}. ${e.nome}${e.marca ? ` — ${e.marca}` : ''}`,
        `   afinidade ${Math.round(e.afinidade * 100)}% | combina em: ${e.casaEm.join(', ')}`,
      ]
      if (e.descricao) partes.push(`   descrição: ${e.descricao}`)
      return partes.join('\n')
    })
    .join('\n')

  const pergunta =
    `Componha a curadoria olfativa para um lead do quiz da FRENESI.\n\n` +
    `Todos os dados necessários já estão NESTE pedido — não use ferramentas nem consulte nada:` +
    ` os candidatos abaixo saíram do cruzamento do perfil do lead com o DNA olfativo real do` +
    ` catálogo (a mesma base do quiz), já filtrados por gênero e estoque.\n\n` +
    `PERFIL DECLARADO — ${linhasDePerfil}\n\n` +
    `CANDIDATOS (em ordem de afinidade):\n${linhasDeEscolhas}\n\n` +
    `Escolha os 3 melhores entre os candidatos e escreva, para cada um, UMA frase de por que` +
    ` combina com este perfil, no tom da marca (elegante, direto), pronta para o atendimento` +
    ` enviar no WhatsApp. Use os motivos e descrições fornecidos. Sem preço, sem link, sem` +
    ` citar perfume fora da lista.`

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
