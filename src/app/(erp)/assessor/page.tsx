import { assessorConfigurado } from '@/data/assessor/motor'
import { carregarCentralDoGerente } from '@/data/assessor/prioridades'
import { conversaDoUsuario, lerMensagens, listarConversas } from '@/data/assessor/conversas'
import { sessaoAtual } from '@/data/sessao'

import { Conversa, type MensagemNaTela } from './Conversa'
import {
  BriefingExecutivo,
  IndicadorDeAtualizacao,
  PrioridadesAgora,
  ResumoDoDia,
} from './Central'

/**
 * Central do Gerente — a tela principal do escopo §3.1.
 *
 * A ordem dos blocos é a do documento e não é decoração: indicador de
 * atualização, "Prioridades agora", briefing executivo, resumo do dia, e só
 * então a conversa. O escopo põe a conversa por último porque as três
 * primeiras perguntas do produto — o que está acontecendo, o que exige minha
 * atenção, o que você recomenda — não deveriam exigir que alguém digitasse.
 *
 * A tela é fina de propósito: lê e entrega. Toda a inteligência mora em
 * `src/data/assessor` e todo número mora nas funções que as outras telas já
 * usam. Se esta página soubesse calcular algo, existiriam dois números para a
 * mesma pergunta.
 */

export const dynamic = 'force-dynamic'

export default async function TelaDoAssessor({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>
}) {
  const { c } = await searchParams
  const usuario = await sessaoAtual()
  const usuarioId = usuario?.id ?? null

  const [conversas, central] = await Promise.all([
    listarConversas(usuarioId),
    carregarCentralDoGerente(),
  ])

  // Conversa pedida pela URL só abre se for de quem está pedindo — o id vem do
  // navegador, e o histórico do Gerente tem os números da operação inteira.
  const id = c && (await conversaDoUsuario(c, usuarioId)) ? c : null
  const mensagens: MensagemNaTela[] = id
    ? (await lerMensagens(id)).map((m) => ({
        id: m.id,
        papel: m.papel,
        texto: m.texto,
        ferramentas: m.ferramentas,
      }))
    : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
      <IndicadorDeAtualizacao apuradoEm={central.apuradoEm} modulos={central.modulosConsultados} />
      <PrioridadesAgora itens={central.itens} resumo={central.resumo} />
      <BriefingExecutivo briefing={central.briefing} />
      <ResumoDoDia e={central.executivo} />
      <Conversa
        key={id ?? 'nova'}
        conversaId={id}
        inicial={mensagens}
        conversas={conversas.map((x) => ({
          id: x.id,
          titulo: x.titulo,
          atualizadaEm: x.atualizadaEm,
        }))}
        configurado={assessorConfigurado()}
      />
    </div>
  )
}
