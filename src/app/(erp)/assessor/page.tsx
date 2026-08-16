import { CabecalhoPagina, Pilha } from '@/components/erp/ui'
import { assessorConfigurado, escritaLiberada } from '@/data/assessor/motor'
import { carregarCentralDoGerente } from '@/data/assessor/prioridades'
import { conversaDoUsuario, lerMensagens, listarConversas } from '@/data/assessor/conversas'
import { lerAcoesPendentes } from '@/data/assessor/acoes'
import { sessaoAtual } from '@/data/sessao'

import { AcoesPendentes, type AcaoNaTela } from './AcoesPendentes'
import { Conversa, type MensagemNaTela } from './Conversa'
import {
  BriefingExecutivo,
  IndicadorDeAtualizacao,
  ModoDeOperacao,
  PrioridadesAgora,
  ResumoDoDia,
} from './Central'

/**
 * Central do Gerente — a tela principal do escopo §3.1.
 *
 * A ordem dos blocos é a do documento e não é decoração: indicador de
 * atualização, "Prioridades agora", briefing executivo, resumo do dia, e só
 * então a conversa. O escopo põe a conversa por último porque as três primeiras
 * perguntas do produto — o que está acontecendo, o que exige minha atenção, o
 * que você recomenda — não deveriam exigir que alguém digitasse.
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

  const temCritico = central.itens.some((i) => i.severidade === 'critico')
  const escrita = await escritaLiberada()

  // As ações pendentes ficam ACIMA da conversa: elas são o que exige decisão
  // agora, e enterrá-las no fim do histórico faria uma aprovação esperando
  // resposta parecer conversa antiga.
  const pendentes: AcaoNaTela[] = (await lerAcoesPendentes(id)).map((a) => ({
    id: a.id,
    ferramenta: a.ferramenta,
    risco: a.risco,
    validaAte: a.validaAte,
    previa: a.previa,
  }))

  return (
    <Pilha gap={18}>
      <CabecalhoPagina
        trilha="Meu Assessor"
        titulo="Central do Gerente"
        subtitulo="O que exige decisão agora, o que mudou desde ontem e o retrato do dia — lidos dos mesmos números das telas do ERP."
        icone="faisca"
        acao={<IndicadorDeAtualizacao apuradoEm={central.apuradoEm} modulos={central.modulosConsultados} />}
      />

      <PrioridadesAgora itens={central.itens} resumo={central.resumo} />
      <BriefingExecutivo briefing={central.briefing} />
      <ResumoDoDia e={central.executivo} />

      <AcoesPendentes acoes={pendentes} conversaId={id} escritaLiberada={escrita} />

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
        temCritico={temCritico}
        temEstoqueCritico={central.executivo.estoque.criticos > 0}
      />

      <ModoDeOperacao escrita={escrita} />
    </Pilha>
  )
}
