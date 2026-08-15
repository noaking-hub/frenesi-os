import { assessorConfigurado } from '@/data/assessor/motor'
import { conversaDoUsuario, lerMensagens, listarConversas } from '@/data/assessor/conversas'
import { sessaoAtual } from '@/data/sessao'

import { carregarPrioridades } from '@/data/assessor/prioridades'

import { Conversa, type MensagemNaTela } from './Conversa'
import { Fila } from './Fila'

/**
 * Meu Assessor — Fase 1.
 *
 * A tela é fina de propósito: ela lê a conversa e entrega ao componente. Toda
 * a inteligência mora em `src/data/assessor`, e todo o número mora nas
 * funções que as outras telas já usam. Se esta página soubesse calcular
 * alguma coisa, existiriam dois números para a mesma pergunta.
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

  // A fila é buscada junto com a lista: ela não depende de pergunta nenhuma,
  // e o custo de esperá-la em série seria pago na abertura da tela.
  const [conversas, fila] = await Promise.all([listarConversas(usuarioId), carregarPrioridades()])

  // Conversa pedida pela URL só abre se for de quem está pedindo — o id vem do
  // navegador, e o histórico do Assessor tem os números da operação inteira.
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
      <Fila itens={fila.itens} resumo={fila.resumo} />
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
