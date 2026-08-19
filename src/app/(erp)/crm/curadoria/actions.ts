'use server'

import { assessorConfigurado, atorDoErp, comporTexto } from '@/data/assessor/motor'
import { catalogoComDna } from '@/data/quiz'
import { sessaoAtual } from '@/data/sessao'
import { supabaseConfigurado, supabaseServer } from '@/data/supabase'
import { curadoriaPorDna, paresDePerfil } from '@/domain'

/**
 * A curadoria refinada pela IA, olhando para UM lead.
 *
 * A seleção é DETERMINÍSTICA: perfil × DNA olfativo do catálogo espelhado do
 * quiz (curadoriaPorDna). O modelo não escolhe nem inventa — recebe os
 * candidatos já cruzados, com o porquê de cada um, e entra só para compor o
 * texto no tom da marca, por `comporTexto` (sem ferramentas, com auditoria).
 * O laço completo do Gerente não serve aqui: a regra dele "fato só de
 * ferramenta" fazia o motor recusar mesmo com os dados inline no pedido.
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

  const instrucoes =
    `Você escreve a curadoria olfativa da FRENESI Perfumes — decants de perfumes importados,` +
    ` marca elegante e direta. Você recebe o perfil de um lead e candidatos JÁ selecionados` +
    ` pelo ERP (cruzamento do perfil com o DNA olfativo real do catálogo, filtrado por gênero` +
    ` e estoque). Sua única tarefa é compor o texto: escolha os 3 melhores candidatos e escreva,` +
    ` para cada um, UMA frase de por que combina com o perfil, pronta para o atendimento enviar` +
    ` no WhatsApp. Use apenas os motivos e descrições fornecidos. Sem preço, sem link, sem` +
    ` saudação, sem citar perfume fora da lista. Formato: o nome do perfume em negrito, dois` +
    ` pontos, a frase.`

  const conteudo =
    `PERFIL DECLARADO — ${linhasDePerfil}\n\n` +
    `CANDIDATOS (em ordem de afinidade):\n${linhasDeEscolhas}`

  const sessao = await sessaoAtual()
  try {
    const r = await comporTexto({
      instrucoes,
      conteudo,
      ator: atorDoErp(sessao?.id ?? null, sessao?.papel ?? 'operacao'),
      canal: 'erp',
    })
    return { ok: true, texto: r.texto }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
}
