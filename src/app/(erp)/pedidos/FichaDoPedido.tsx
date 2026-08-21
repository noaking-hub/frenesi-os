'use client'

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react'

import { PainelInferior } from '@/components/erp/Modal'
import { COR, FUNDO, BORDA, type Tom } from '@/components/erp/tokens'
import {
  ROTULO_LOGISTICO,
  TRANSPORTADORAS_CONHECIDAS,
  brl,
  paginaDeRastreio,
  resumirEvento,
  servicoLegivel,
  slaDeEntrega,
  statusDoEvento,
  statusOperacional,
  type EventoTransportadora,
  type Pedido,
  type Sla,
  type SituacaoLogistica,
  type StatusDevolucao,
} from '@/domain'

import {
  anexarComprovanteDoPedido,
  atualizarRastreamento,
  confirmarEntregaEmMaos,
  linhaDoTempoDoPedido,
  reembolsosDoPedido,
  registrarReembolso,
  type ReembolsoDoPedido,
} from './actions'
import { registrarRastreioManual } from './envios/actions'

/**
 * A ficha do pedido — o painel ancorado do mockup.
 *
 * A aba Rastreamento é a padrão e é um dossiê de seis colunas: dados do
 * pedido, cliente, entrega, rastreamento, ocorrências e integrações, tudo de
 * uma vez. É o desenho do mockup, e o motivo é o atendimento: quem responde
 * "onde está meu pedido?" precisa das seis respostas juntas, não de seis
 * cliques.
 *
 * A linha do tempo chega por ação de servidor quando a ficha abre — trazê-la
 * junto da lista seria transportar o histórico de 612 pedidos para ler o de um.
 */

type Aba = 'Resumo' | 'Itens' | 'Pagamento' | 'Rastreamento' | 'Timeline'
const ABAS: Aba[] = ['Resumo', 'Itens', 'Pagamento', 'Rastreamento', 'Timeline']

export const TOM_LOGISTICO: Record<string, Tom> = {
  'sem-rastreio': 'neutro',
  etiqueta: 'atencao',
  postado: 'info',
  'em-transito': 'info',
  'saiu-para-entrega': 'ouro',
  tentativa: 'erro',
  'aguardando-retirada': 'atencao',
  entregue: 'ok',
  devolucao: 'erro',
  extraviado: 'erro',
}

export interface FichaProps {
  pedido: Pedido
  sla: Sla
  logistica: SituacaoLogistica
  devolucao: StatusDevolucao
  aoFechar: () => void
  /** Recado para a faixa da tela — a ficha fecha ao confirmar entrega. */
  aoRecado: (texto: string) => void
  aoErro: (texto: string) => void
}

export function FichaDoPedido({
  pedido,
  sla,
  logistica,
  devolucao,
  aoFechar,
  aoRecado,
  aoErro,
}: FichaProps) {
  const [aba, setAba] = useState<Aba>('Rastreamento')
  const [eventos, setEventos] = useState<EventoTransportadora[] | null>(null)
  const [pendente, iniciar] = useTransition()
  const [copiado, setCopiado] = useState<string | null>(null)
  const refFechar = useRef<HTMLButtonElement>(null)
  const timerCopiado = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let vivo = true
    setEventos(null)
    linhaDoTempoDoPedido(pedido.id).then((e) => {
      if (vivo) setEventos(e)
    })
    return () => {
      vivo = false
    }
  }, [pedido.id])

  // Quem navega por teclado clicou "Abrir" lá na tabela: o foco vem junto
  // para a ficha e VOLTA para onde estava quando ela fecha — sem isso, fechar
  // joga o leitor de tela de volta ao topo do documento.
  useEffect(() => {
    const origem = document.activeElement as HTMLElement | null
    refFechar.current?.focus()
    return () => origem?.focus?.()
  }, [])

  useEffect(
    () => () => {
      if (timerCopiado.current) clearTimeout(timerCopiado.current)
    },
    [],
  )

  const statusOp = statusOperacional({
    situacao: pedido.situacao,
    slaEmAtraso: sla.estado === 'em-atraso',
    log: logistica,
    entregaLocal: pedido.entregaLocal,
  })
  const link = pedido.rastreioUrl ?? paginaDeRastreio(pedido.transportadora, pedido.rastreio)

  // Segunda metade da régua de prazo: o relógio da transportadora, contado da
  // postagem com o prazo que ELA cotou. Sem as duas pontas, "Sem previsão" —
  // data inventada aqui viraria promessa quebrada na boca do atendimento.
  const previsao = slaDeEntrega({
    situacao: pedido.situacao,
    entregueEm: pedido.entregueEm,
    postadoEm: logistica.primeiroEvento,
    prazoDias: pedido.prazoEntregaDias,
    prometidoEm: pedido.entregaPrevistaEm,
  })
  const textoPrevisao =
    previsao.estado === 'no-prazo'
      ? `Até ${previsao.ate}`
      : previsao.estado === 'vence-hoje'
        ? 'Vence hoje'
        : previsao.estado === 'atrasado'
          ? previsao.rotulo.replace('Entrega atrasada', 'Atrasada')
          : previsao.rotulo
  const corPrevisao =
    previsao.estado === 'atrasado'
      ? COR.erro
      : previsao.estado === 'vence-hoje'
        ? COR.atencao
        : previsao.estado === 'entregue'
          ? COR.ok
          : undefined

  const copiar = async (texto: string, chave: string) => {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(chave)
      if (timerCopiado.current) clearTimeout(timerCopiado.current)
      timerCopiado.current = setTimeout(() => setCopiado(null), 1500)
    } catch {
      aoErro('O navegador não liberou a área de transferência.')
    }
  }

  const releitura = () =>
    iniciar(async () => {
      const r = await atualizarRastreamento([pedido.id])
      if (!r.ok) return aoErro(r.erro)
      setEventos(await linhaDoTempoDoPedido(pedido.id))
      aoRecado(
        r.eventos > 0
          ? `${r.eventos} ocorrência(s) nova(s) em ${pedido.id}.`
          : (r.aviso ?? `Nenhuma ocorrência nova em ${pedido.id}.`),
      )
    })

  const entregar = () =>
    iniciar(async () => {
      const r = await confirmarEntregaEmMaos(pedido.id)
      if (!r.ok) return aoErro(r.erro)
      aoFechar()
      aoRecado(
        (r.mlConsumido > 0
          ? `${pedido.id} entregue · ${r.mlConsumido.toFixed(1).replace('.', ',')} ml baixados do estoque.`
          : `${pedido.id} entregue. Nenhum ml baixado — os perfumes deste pedido estão fora do controle de estoque.`) +
          // O espelho na loja acontece na sequência — quem clicou merece saber
          // se a Shopify ficou sabendo ou se o pedido segue na fila de baixa.
          (r.shopify ? ` Shopify: ${r.shopify}` : ''),
      )
    })

  // Data de coleta: o evento de postagem mais antigo que a transportadora
  // registrou. Sem evento, não há data — nunca uma inventada.
  const coleta = [...(eventos ?? [])]
    .reverse()
    .find((e) => statusDoEvento(e.descricao) === 'postado')

  return (
    <PainelInferior titulo={`Pedido ${pedido.id}`} altura="52vh" aoFechar={aoFechar}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 13,
          padding: '13px 26px',
          borderBottom: '1px solid var(--color-borda-sutil)',
          flex: 'none',
        }}
      >
        <span className="font-sans" style={{ fontSize: 11.5, color: 'var(--color-terciario)' }}>
          Pedido
        </span>
        <span
          className="font-mono"
          style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-ouro)', letterSpacing: '.02em' }}
        >
          {pedido.id}
        </span>
        <span style={{ flex: 1 }} />
        <button
          ref={refFechar}
          type="button"
          onClick={aoFechar}
          aria-label="Fechar ficha"
          className="hover:border-ouro/40"
          style={{
            width: 28,
            height: 28,
            border: '1px solid rgba(255,255,255,.12)',
            borderRadius: 999,
            background: 'transparent',
            color: 'var(--color-terciario)',
            cursor: 'pointer',
            lineHeight: 1,
            fontSize: 11,
          }}
        >
          ✕
        </button>
      </header>

      <nav
        role="tablist"
        aria-label="Seções da ficha"
        style={{
          display: 'flex',
          gap: 2,
          padding: '4px 26px 0',
          borderBottom: '1px solid var(--color-borda-sutil)',
          flex: 'none',
          // Nos 393px do iPhone as cinco abas não cabem: a régua rola na
          // horizontal dentro de si mesma, sem quebrar linha.
          overflowX: 'auto',
        }}
      >
        {ABAS.map((a) => (
          <button
            key={a}
            type="button"
            role="tab"
            aria-selected={a === aba}
            onClick={() => setAba(a)}
            className="font-sans"
            style={{
              height: 34,
              padding: '0 13px',
              flex: 'none',
              whiteSpace: 'nowrap',
              border: 0,
              borderBottom: `2px solid ${a === aba ? COR.ouro : 'transparent'}`,
              marginBottom: -1,
              background: 'transparent',
              color: a === aba ? COR.ouro : 'rgba(242,237,227,.55)',
              fontWeight: 600,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {a}
          </button>
        ))}
      </nav>

      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 26px 20px' }}>
        {aba === 'Rastreamento' && (
          <div
            style={{
              display: 'grid',
              // As quatro colunas de dados + as duas linhas do tempo. Em tela
              // menor as colunas quebram; as linhas do tempo mantêm o filete à
              // esquerda como divisor, igual ao mockup.
              gridTemplateColumns: 'repeat(auto-fit, minmax(178px, 1fr))',
              gap: '16px 20px',
              alignItems: 'start',
            }}
          >
            <Bloco titulo="Dados do pedido">
              <Campo rotulo="Pedido" valor={pedido.id} mono ouro />
              <Campo rotulo="Data" valor={dataHora(pedido.compradoEm) ?? pedido.data} />
              <Campo rotulo="Canal" valor={pedido.canal} />
              <Campo rotulo="Valor do pedido" valor={brl(pedido.valor)} mono />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <RotuloCampo>Status operacional</RotuloCampo>
                <span>
                  <Selo tom={statusOp.tom}>{statusOp.rotulo}</Selo>
                </span>
              </div>
            </Bloco>

            <Bloco titulo="Cliente">
              {/* O nome dispensa rótulo — é a primeira coisa da coluna. */}
              <span
                className="font-sans"
                style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-corrente)' }}
              >
                {pedido.cliente || '—'}
              </span>
              <Campo rotulo="CPF" valor={pedido.cpf} mono />
              <Campo rotulo="Telefone" valor={pedido.telefone} />
              <Campo rotulo="E-mail" valor={pedido.email} />
              <Campo rotulo="Cidade / UF" valor={pedido.destino} />
            </Bloco>

            <Bloco titulo="Entrega">
              <Campo rotulo="Endereço" valor={pedido.rua} />
              <Campo rotulo="CEP" valor={pedido.cep} mono />
              <Campo rotulo="Cidade / UF" valor={pedido.destino} />
              <Campo
                rotulo="Tipo de entrega"
                valor={pedido.entregaLocal ? 'Entrega local (motoboy)' : 'Transportadora'}
              />
            </Bloco>

            <Bloco titulo="Rastreamento" largo>
              <Campo
                rotulo="Transportadora"
                valor={
                  pedido.entregaLocal ? 'Motoboy' : (pedido.transportadora ?? 'Não identificada')
                }
              />
              <Campo rotulo="Serviço" valor={servicoLegivel(pedido.servicoFrete) ?? '—'} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                <RotuloCampo>Código de rastreio</RotuloCampo>
                <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                  <span
                    className="font-mono"
                    style={{ fontSize: 11.5, color: 'rgba(242,237,227,.86)', overflowWrap: 'anywhere' }}
                  >
                    {pedido.rastreio ?? 'Ainda não informado'}
                  </span>
                  {pedido.rastreio && (
                    <button
                      type="button"
                      onClick={() => copiar(pedido.rastreio as string, 'codigo')}
                      aria-label="Copiar código de rastreio"
                      title={copiado === 'codigo' ? 'Copiado' : 'Copiar código'}
                      className="hover:text-ouro"
                      style={{
                        border: 0,
                        background: 'transparent',
                        color: copiado === 'codigo' ? COR.ok : 'var(--color-terciario)',
                        cursor: 'pointer',
                        padding: 0,
                        lineHeight: 0,
                      }}
                    >
                      {copiado === 'codigo' ? <IcCheck /> : <IcCopiar />}
                    </button>
                  )}
                </span>
                {/* Entrega local não tem etiqueta: o motoboy não gera código, e
                    oferecer o campo aqui convidaria a inventar um. */}
                {!pedido.entregaLocal && (
                  <InformarRastreio
                    pedidoId={pedido.id}
                    atual={pedido.rastreio}
                    aoGravar={async () => setEventos(await linhaDoTempoDoPedido(pedido.id))}
                  />
                )}
              </div>
              <Campo rotulo="Data de coleta" valor={coleta?.quando ? (dataHora(coleta.quando) ?? '—') : '—'} />
              {/* "Sem previsão" é resposta legítima; data inventada, nunca. */}
              <Campo rotulo="Previsão de entrega" valor={textoPrevisao} cor={corPrevisao} />
              <Campo
                rotulo="Última atualização"
                valor={logistica.desde ? (dataHora(logistica.desde) ?? '—') : 'Sem evento'}
              />
              <Campo rotulo="Tentativas de entrega" valor={String(logistica.tentativas)} />
            </Bloco>

            <LinhaDoTempo titulo="Ocorrências">
              {eventos === null && <Nota>Carregando…</Nota>}
              {eventos?.length === 0 && (
                <Nota>
                  {pedido.entregaLocal
                    ? 'Entrega local não gera ocorrência de transportadora.'
                    : pedido.rastreio
                      ? 'A transportadora ainda não devolveu ocorrências para este código.'
                      : 'Este pedido ainda não tem código de rastreio.'}
                </Nota>
              )}
              {eventos?.map((e) => {
                const st = statusDoEvento(e.descricao)
                return (
                  <Momento
                    key={e.id}
                    quando={e.quando ? (dataHora(e.quando) ?? '—') : '—'}
                    tom={st ? (TOM_LOGISTICO[st] ?? 'neutro') : 'neutro'}
                    titulo={st ? ROTULO_LOGISTICO[st] : 'Ocorrência registrada'}
                    detalhe={`${resumirEvento(e.descricao)}${e.local ? ` · ${e.local}` : ''}`}
                  />
                )
              })}
            </LinhaDoTempo>

            <LinhaDoTempo titulo="Informações adicionais">
              {fatosDeIntegracao(pedido).map((f) => (
                <Momento
                  key={f.chave}
                  quando={dataHora(f.quando) ?? '—'}
                  tom={f.tom}
                  titulo={f.titulo}
                  detalhe={f.detalhe}
                />
              ))}
            </LinhaDoTempo>
          </div>
        )}

        {aba === 'Resumo' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '18px 22px',
              alignItems: 'start',
            }}
          >
            <Bloco titulo="Pedido">
              <Campo rotulo="Número" valor={pedido.id} mono ouro />
              <Campo rotulo="Data" valor={dataHora(pedido.compradoEm) ?? pedido.data} />
              <Campo rotulo="Canal" valor={pedido.canal} />
              <Campo rotulo="Prazo de expedição" valor={sla.rotulo} />
            </Bloco>
            <Bloco titulo="Cliente">
              {/* O nome dispensa rótulo — é a primeira coisa da coluna. */}
              <span
                className="font-sans"
                style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-corrente)' }}
              >
                {pedido.cliente || '—'}
              </span>
              <Campo rotulo="CPF" valor={pedido.cpf} mono />
              <Campo rotulo="Telefone" valor={pedido.telefone} />
              <Campo rotulo="E-mail" valor={pedido.email} />
            </Bloco>
            <Bloco titulo="Entrega">
              <Campo rotulo="Endereço" valor={pedido.rua} />
              <Campo rotulo="CEP" valor={pedido.cep} mono />
              <Campo rotulo="Cidade / UF" valor={pedido.destino} />
              <Campo
                rotulo="Entregue em"
                valor={pedido.entregueEm ? (dataHora(pedido.entregueEm) ?? '—') : '—'}
              />
              <Campo rotulo="Janela de devolução" valor={devolucao.selo} />
            </Bloco>
            <Bloco titulo="Valores">
              <Campo rotulo="Valor do pedido" valor={brl(pedido.valor)} mono />
              <CampoDesconto desconto={pedido.desconto} />
              <Campo rotulo="Frete" valor={brl(pedido.frete)} mono />
              <Campo rotulo="Cashback usado" valor={brl(pedido.cashback)} mono />
              <CampoComprovante url={pedido.comprovanteUrl} pedidoId={pedido.id} />
            </Bloco>
          </div>
        )}

        {aba === 'Itens' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 760 }}>
            {pedido.itens.length === 0 && <Nota>Este pedido não trouxe itens da Yampi.</Nota>}
            {pedido.itens.map((i, n) => (
              <div
                key={`${i.perfume}-${n}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 13,
                  padding: '9px 12px',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,.03)',
                  border: '1px solid rgba(255,255,255,.06)',
                }}
              >
                {/* A foto vem do catálogo (Shopify). Item antigo sem casamento
                    mostra o frasco genérico — nunca um buraco no layout. */}
                {i.imagem ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={i.imagem}
                    alt=""
                    loading="lazy"
                    style={{
                      width: 44,
                      height: 44,
                      flex: 'none',
                      borderRadius: 8,
                      objectFit: 'cover',
                      background: 'rgba(255,255,255,.05)',
                      border: '1px solid rgba(255,255,255,.08)',
                    }}
                  />
                ) : (
                  <span
                    aria-hidden
                    style={{
                      width: 44,
                      height: 44,
                      flex: 'none',
                      display: 'grid',
                      placeItems: 'center',
                      borderRadius: 8,
                      background: 'rgba(255,255,255,.04)',
                      border: '1px solid rgba(255,255,255,.08)',
                      color: 'rgba(239,209,140,.5)',
                    }}
                  >
                    <IcFrascoFicha />
                  </span>
                )}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    className="font-sans"
                    style={{
                      display: 'block',
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: 'var(--color-corrente)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {i.perfume}
                  </span>
                  {/* Sem tamanho não é falha: kit e frasco lacrado não são
                      fracionados, e o nome deles já diz o que são. A linha
                      some em vez de inventar um "5 ml", que era o que ela
                      fazia — e quem envasa acreditava. */}
                  {i.variante !== null && (
                    <span className="font-sans" style={{ fontSize: 10.5, color: 'var(--color-terciario)' }}>
                      {`${i.variante} ml`}
                    </span>
                  )}
                </span>
                <span
                  className="font-mono"
                  style={{ fontSize: 12, color: 'var(--color-corrente)', flex: 'none' }}
                >
                  {brl(i.preco)}
                </span>
              </div>
            ))}
          </div>
        )}

        {aba === 'Pagamento' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '18px 22px',
              alignItems: 'start',
              maxWidth: 760,
            }}
          >
            <Bloco titulo="Pagamento">
              <Campo rotulo="Situação financeira" valor={rotuloPagamento(pedido.pagamento)} />
              <Campo rotulo="Canal" valor={pedido.canal} />
              <Campo rotulo="Gateway do frete" valor={pedido.gateway} />
            </Bloco>
            <Bloco titulo="Valores">
              <Campo rotulo="Valor do pedido" valor={brl(pedido.valor)} mono />
              <CampoDesconto desconto={pedido.desconto} />
              <Campo rotulo="Frete" valor={brl(pedido.frete)} mono />
              <Campo rotulo="Cashback usado" valor={brl(pedido.cashback)} mono />
              <CampoComprovante url={pedido.comprovanteUrl} pedidoId={pedido.id} />
            </Bloco>
            <BlocoReembolsos pedidoId={pedido.id} valorDoPedido={pedido.valor} />
          </div>
        )}

        {aba === 'Timeline' && (
          <div style={{ maxWidth: 780 }}>
            {eventos === null && <Nota>Carregando a linha do tempo…</Nota>}
            {eventos !== null && (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {[
                  ...(eventos ?? []).map((e) => {
                    const st = statusDoEvento(e.descricao)
                    return {
                      chave: e.id,
                      quando: e.quando,
                      tom: (st ? (TOM_LOGISTICO[st] ?? 'neutro') : 'neutro') as Tom,
                      titulo: st ? ROTULO_LOGISTICO[st] : 'Ocorrência registrada',
                      detalhe: `${resumirEvento(e.descricao)}${e.local ? ` · ${e.local}` : ''}`,
                    }
                  }),
                  ...fatosDeIntegracao(pedido).map((f) => ({
                    chave: f.chave,
                    quando: f.quando,
                    tom: f.tom,
                    titulo: f.titulo,
                    detalhe: f.detalhe,
                  })),
                ]
                  .sort((a, b) => (b.quando ?? '').localeCompare(a.quando ?? ''))
                  .map((m) => (
                    <Momento
                      key={m.chave}
                      quando={m.quando ? (dataHora(m.quando) ?? '—') : '—'}
                      tom={m.tom}
                      titulo={m.titulo}
                      detalhe={m.detalhe}
                    />
                  ))}
              </div>
            )}
          </div>
        )}
      </div>

      <footer
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          flexWrap: 'wrap',
          padding: '12px 26px',
          borderTop: '1px solid var(--color-borda-sutil)',
          background: 'rgba(0,0,0,.22)',
          flex: 'none',
        }}
      >
        {pedido.entregaLocal ? (
          pedido.situacao !== 'entregue' && (
            <BotaoFicha primario desabilitado={pendente} aoClicar={entregar} icone={<IcCheck />}>
              {pendente ? 'Confirmando…' : 'Confirmar entrega em mãos'}
            </BotaoFicha>
          )
        ) : (
          <BotaoFicha
            primario
            desabilitado={pendente || !pedido.rastreio}
            aoClicar={releitura}
            icone={<IcAtualizar />}
          >
            {pendente ? 'Consultando…' : 'Atualizar rastreamento'}
          </BotaoFicha>
        )}
        <BotaoFicha
          desabilitado={!pedido.rastreio}
          aoClicar={() => copiar(pedido.rastreio as string, 'rodape')}
          icone={<IcCopiar />}
        >
          {copiado === 'rodape' ? 'Copiado' : 'Copiar rastreio'}
        </BotaoFicha>
        {/* Visível e desligado de propósito: o botão existe no escopo, e nenhum
            e-mail sai enquanto os avisos estiverem desligados. */}
        <BotaoFicha
          desabilitado
          titulo="Os avisos ao cliente estão desligados até o sistema rodar 100%."
          aoClicar={() => {}}
          icone={<IcEnviar />}
        >
          Enviar rastreio ao cliente
        </BotaoFicha>
        {link ? (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="font-sans hover:border-ouro/45"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              height: 33,
              padding: '0 14px',
              border: '1px solid rgba(255,255,255,.12)',
              borderRadius: 9,
              color: 'rgba(242,237,227,.8)',
              fontSize: 11.5,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Ver rastreamento no site da transportadora
            <IcExterno />
          </a>
        ) : (
          !pedido.entregaLocal && (
            <BotaoFicha
              desabilitado
              titulo="Sem página de rastreio para este pedido ainda."
              aoClicar={() => {}}
              icone={<IcExterno />}
            >
              Ver rastreamento no site da transportadora
            </BotaoFicha>
          )
        )}
      </footer>
    </PainelInferior>
  )
}

// ── fatos de integração ────────────────────────────────────────────────────

interface Fato {
  chave: string
  quando: string
  tom: Tom
  titulo: string
  detalhe: string
}

/**
 * A coluna "Informações adicionais" do mockup, com fatos REAIS do pedido:
 * cada linha é um timestamp que as integrações gravaram. Nada é inventado —
 * pedido sem o fato simplesmente não mostra a linha.
 */
function fatosDeIntegracao(p: Pedido): Fato[] {
  const fatos: Fato[] = []
  if (p.compradoEm) {
    fatos.push({
      chave: 'importado',
      quando: p.compradoEm,
      tom: 'neutro',
      titulo: 'Pedido aprovado',
      detalhe: 'Pagamento confirmado · importado da Yampi',
    })
  }
  if (p.producaoEm) {
    fatos.push({
      chave: 'producao',
      quando: p.producaoEm,
      tom: 'neutro',
      titulo: 'Em produção',
      detalhe: 'Pedido entrou na fila de produção',
    })
  }
  if (p.estoqueBaixadoEm) {
    fatos.push({
      chave: 'estoque',
      quando: p.estoqueBaixadoEm,
      tom: 'neutro',
      titulo: 'Estoque baixado',
      detalhe: p.estoqueBaixadoMl
        ? `${p.estoqueBaixadoMl.toFixed(1).replace('.', ',')} ml saíram do saldo`
        : 'Baixa registrada no faturamento',
    })
  }
  if (p.enviadoShopifyEm) {
    fatos.push({
      chave: 'shopify',
      quando: p.enviadoShopifyEm,
      tom: 'neutro',
      titulo: 'Integração',
      detalhe: 'Pedido marcado como processado na Shopify',
    })
  }
  if (p.rastreioLidoEm) {
    fatos.push({
      chave: 'sincronizacao',
      quando: p.rastreioLidoEm,
      tom: 'neutro',
      titulo: 'Sincronização',
      detalhe: 'Rastreamento consultado na transportadora',
    })
  }
  if (p.entregueEm && /^\d{4}-/.test(p.entregueEm)) {
    fatos.push({
      chave: 'entregue',
      quando: p.entregueEm,
      tom: 'ok',
      titulo: 'Entrega confirmada',
      detalhe: 'Pedido chegou ao cliente',
    })
  }
  return fatos.sort((a, b) => b.quando.localeCompare(a.quando))
}

// ── peças ──────────────────────────────────────────────────────────────────

export function Bloco({
  titulo,
  largo,
  children,
}: {
  titulo: string
  /** Duas sub-colunas internas — o bloco de Rastreamento do mockup. */
  largo?: boolean
  children: ReactNode
}) {
  return (
    <section
      className={largo ? 'bloco-largo' : undefined}
      style={largo ? { gridColumn: 'span 2', minWidth: 0 } : { minWidth: 0 }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        <TituloBloco>{titulo}</TituloBloco>
        <div
          className={largo ? 'empilha-900' : undefined}
          style={
            largo
              ? {
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '11px 18px',
                  alignItems: 'start',
                }
              : { display: 'flex', flexDirection: 'column', gap: 11 }
          }
        >
          {children}
        </div>
      </div>
    </section>
  )
}

/** Coluna de linha do tempo com o filete divisor à esquerda, como no mockup. */
function LinhaDoTempo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        minWidth: 0,
        paddingLeft: 20,
        borderLeft: '1px solid var(--color-borda-sutil)',
      }}
    >
      <TituloBloco>{titulo}</TituloBloco>
      <div style={{ display: 'flex', flexDirection: 'column' }}>{children}</div>
    </section>
  )
}

function TituloBloco({ children }: { children: ReactNode }) {
  return (
    <span
      className="font-sans"
      style={{
        fontWeight: 600,
        fontSize: 9.5,
        letterSpacing: '.13em',
        textTransform: 'uppercase',
        color: 'var(--color-terciario)',
      }}
    >
      {children}
    </span>
  )
}

function RotuloCampo({ children }: { children: ReactNode }) {
  return (
    <span className="font-sans" style={{ fontSize: 10, color: 'var(--color-terciario)' }}>
      {children}
    </span>
  )
}

export function Campo({
  rotulo,
  valor,
  mono,
  ouro,
  cor,
}: {
  rotulo: string
  valor: string
  mono?: boolean
  ouro?: boolean
  /** Cor de estado (atraso, vencimento) — sobrepõe o cinza padrão. */
  cor?: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      <RotuloCampo>{rotulo}</RotuloCampo>
      <span
        className={mono ? 'font-mono' : 'font-sans'}
        style={{
          fontSize: mono ? 11.5 : 12,
          color: ouro ? COR.ouro : (cor ?? 'rgba(242,237,227,.88)'),
          fontWeight: ouro || cor ? 700 : 400,
          overflowWrap: 'anywhere',
        }}
      >
        {valor || '—'}
      </span>
    </div>
  )
}

/**
 * O abatimento, e só quando existe.
 *
 * 667 dos pedidos têm desconto zero: uma linha "R$ 0,00" em todos eles polui a
 * ficha para explicar nada. Quando o número aparece, ele está ali para fechar a
 * conta — os itens são preço de tabela e o valor do pedido já é o líquido.
 */
function CampoDesconto({ desconto }: { desconto: number }) {
  if (desconto <= 0) return null
  return <Campo rotulo="Desconto" valor={brl(desconto)} mono />
}

/**
 * O comprovante anexado à venda.
 *
 * "Comprovante da venda", nunca "do recebimento": numa venda parcelada o Pix
 * anexado prova a primeira entrada e nada diz sobre as outras — a ficha não
 * pode afirmar mais do que sabe.
 *
 * O anexo pode chegar DEPOIS da venda — a cliente manda o Pix no WhatsApp no dia
 * seguinte, e sem um caminho aqui a única saída seria registrar a mesma venda de
 * novo, baixando o estoque duas vezes. Por isso a ficha anexa, e não só mostra.
 */
/**
 * Digitar o código da etiqueta emitida no painel da Frenet.
 *
 * A etiqueta dos Correios e da Jadlog sai do painel da Frenet, onde o frete é
 * mais barato — e nenhuma API lista as etiquetas de uma conta de lá. O ERP não
 * tem como descobrir sozinho que o envio existe: ele sabe rastrear um código,
 * não adivinhá-lo. Este campo é a ponte, e é ele que tira o pedido de
 * "aguardando envio" sem depender de alguém preencher a Yampi.
 *
 * Aparece fechado quando já existe código — corrigir é exceção, informar é a
 * regra, e um input sempre aberto ao lado de um código certo é convite a
 * apagá-lo sem querer.
 */
function InformarRastreio({
  pedidoId,
  atual,
  aoGravar,
}: {
  pedidoId: string
  atual: string | null
  aoGravar: () => Promise<void>
}) {
  const [aberto, setAberto] = useState(false)
  const [codigo, setCodigo] = useState('')
  // Vazio = deixa o ERP deduzir pelo formato do código, que é o certo na
  // maioria dos dias. O select existe para quando o pacote saiu por uma
  // transportadora diferente da cotada e o palpite erraria o link do e-mail.
  const [transportadora, setTransportadora] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [gravando, gravar] = useTransition()

  const salvar = () =>
    gravar(async () => {
      setErro(null)
      setAviso(null)
      const r = await registrarRastreioManual(pedidoId, codigo, transportadora || null)
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setAberto(false)
      setCodigo('')
      // Aviso sobrevive ao fechamento do campo de propósito: "a transportadora
      // ainda não reconhece este código" é justamente o que precisa continuar
      // à vista depois de gravar.
      setAviso(r.aviso)
      await aoGravar()
    })

  if (!aberto) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <button
          type="button"
          onClick={() => {
            setAberto(true)
            setCodigo(atual ?? '')
          }}
          className="font-sans hover:text-ouro"
          style={{
            border: 0,
            background: 'transparent',
            padding: 0,
            fontSize: 11.5,
            color: atual ? 'rgba(242,237,227,.5)' : COR.ouro,
            textDecoration: 'underline',
            textUnderlineOffset: 3,
            cursor: 'pointer',
            alignSelf: 'flex-start',
          }}
        >
          {atual ? 'Corrigir código' : 'Informar código da etiqueta'}
        </button>
        {aviso && (
          <span
            className="font-sans"
            style={{ fontSize: 10.5, lineHeight: 1.45, color: COR.ouro, textWrap: 'pretty' }}
          >
            {aviso}
          </span>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          autoFocus
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !gravando) salvar()
            if (e.key === 'Escape') setAberto(false)
          }}
          placeholder="AA123456789BR"
          spellCheck={false}
          autoCapitalize="characters"
          className="font-mono"
          style={{
            flex: 1,
            minWidth: 0,
            padding: '6px 8px',
            fontSize: 11.5,
            color: 'var(--color-corrente)',
            background: 'rgba(255,255,255,.04)',
            border: '1px solid var(--color-borda-sutil)',
            borderRadius: 8,
            outline: 'none',
          }}
        />
        <button
          type="button"
          onClick={salvar}
          disabled={gravando || codigo.trim().length < 6}
          className="font-sans"
          style={{
            border: `1px solid ${BORDA.ouro}`,
            background: FUNDO.ouro,
            color: COR.ouro,
            borderRadius: 8,
            padding: '6px 10px',
            fontSize: 11.5,
            cursor: gravando ? 'wait' : codigo.trim().length < 6 ? 'not-allowed' : 'pointer',
            opacity: codigo.trim().length < 6 ? 0.45 : 1,
            whiteSpace: 'nowrap',
          }}
        >
          {gravando ? 'Gravando…' : 'Salvar'}
        </button>
      </div>
      <select
        value={transportadora}
        onChange={(e) => setTransportadora(e.target.value)}
        aria-label="Transportadora"
        className="font-sans"
        style={{
          padding: '6px 8px',
          fontSize: 11,
          color: transportadora ? 'var(--color-corrente)' : 'var(--color-terciario)',
          background: 'rgba(255,255,255,.04)',
          border: '1px solid var(--color-borda-sutil)',
          borderRadius: 8,
          outline: 'none',
          cursor: 'pointer',
        }}
      >
        <option value="">Transportadora: deduzir pelo código</option>
        {TRANSPORTADORAS_CONHECIDAS.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <span
        className="font-sans"
        style={{ fontSize: 10, lineHeight: 1.4, color: 'var(--color-terciario)', textWrap: 'pretty' }}
      >
        {atual
          ? 'O código atual será substituído. O pedido continua onde está.'
          : 'Ao salvar, o pedido passa a "enviado", o aviso vai ao cliente e a Frenet começa a rastrear. Escolha a transportadora se o pacote saiu por outra diferente da cotada — é ela que decide o link do e-mail.'}
      </span>
      {erro && (
        <span className="font-sans" style={{ fontSize: 10.5, color: COR.erro, textWrap: 'pretty' }}>
          {erro}
        </span>
      )}
    </div>
  )
}

/**
 * Os reembolsos parciais do pedido, e o formulário para registrar mais um.
 *
 * Fica na aba Pagamento porque reembolso é dinheiro, não logística: o produto
 * pode nem ter voltado. Quem devolve mercadoria usa o módulo de Devoluções,
 * que tem conferência e fotos — aqui só se registra o dinheiro que saiu.
 *
 * "Aguardando o extrato" é estado legítimo e aparece: o estorno cai na conta
 * do gateway com alguns minutos ou horas de atraso, e esconder essa espera
 * faria parecer que o registro não funcionou.
 */
function BlocoReembolsos({ pedidoId, valorDoPedido }: { pedidoId: string; valorDoPedido: number }) {
  const [lista, setLista] = useState<ReembolsoDoPedido[] | null>(null)
  const [aberto, setAberto] = useState(false)
  const [valor, setValor] = useState('')
  const [motivo, setMotivo] = useState('')
  const [item, setItem] = useState('')
  const [quando, setQuando] = useState(() => new Date().toISOString().slice(0, 10))
  const [movimento, setMovimento] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [gravando, gravar] = useTransition()
  const entrada = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let vivo = true
    reembolsosDoPedido(pedidoId).then((r) => {
      if (vivo) setLista(r)
    })
    return () => {
      vivo = false
    }
  }, [pedidoId])

  const devolvido = (lista ?? []).reduce((s, r) => s + r.valor, 0)
  const numero = Number(valor.replace(/\./g, '').replace(',', '.'))

  const salvar = () =>
    gravar(async () => {
      setErro(null)
      const r = await registrarReembolso({
        pedidoId,
        valor: numero,
        motivo,
        item: item || null,
        ocorridoEm: quando,
        movimentoId: movimento || null,
        comprovante: arquivo,
      })
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      setAberto(false)
      setValor('')
      setMotivo('')
      setItem('')
      setMovimento('')
      setArquivo(null)
      setLista(await reembolsosDoPedido(pedidoId))
    })

  return (
    <Bloco titulo="Reembolsos ao cliente">
      {lista === null && <Nota>Carregando…</Nota>}
      {lista?.length === 0 && !aberto && (
        <span className="font-sans" style={{ fontSize: 11.5, color: 'var(--color-terciario)' }}>
          Nenhum valor devolvido neste pedido.
        </span>
      )}

      {lista?.map((r) => (
        <div key={r.id} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span className="font-mono" style={{ fontSize: 12, color: COR.erro }}>
              −{brl(r.valor)}
            </span>
            <span className="font-sans" style={{ fontSize: 11, color: 'var(--color-corrente)' }}>
              {r.motivo}
            </span>
            {r.comprovanteUrl && (
              <a
                href={r.comprovanteUrl}
                target="_blank"
                rel="noreferrer"
                className="font-sans hover:text-ouro"
                style={{ fontSize: 10.5, color: COR.ouro, textDecoration: 'underline', textUnderlineOffset: 3 }}
              >
                comprovante
              </a>
            )}
          </span>
          <span className="font-sans" style={{ fontSize: 10, color: 'var(--color-terciario)' }}>
            {(dataHora(r.ocorridoEm) ?? r.ocorridoEm)}
            {r.item ? ` · ${r.item}` : ''} ·{' '}
            <span style={{ color: r.conciliado ? COR.ok : COR.atencao }}>
              {r.conciliado ? 'conciliado com o extrato' : 'aguardando o extrato'}
            </span>
          </span>
        </div>
      ))}

      {devolvido > 0 && (
        <Campo rotulo="Recebido líquido" valor={brl(valorDoPedido - devolvido)} mono />
      )}

      {!aberto ? (
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="font-sans hover:text-ouro"
          style={{
            border: 0,
            background: 'transparent',
            padding: 0,
            fontSize: 11.5,
            color: COR.ouro,
            textDecoration: 'underline',
            textUnderlineOffset: 3,
            cursor: 'pointer',
            alignSelf: 'flex-start',
          }}
        >
          Registrar reembolso
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              autoFocus
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="62,00"
              inputMode="decimal"
              className="font-mono"
              style={{ ...CAMPO_REEMBOLSO, flex: '0 0 92px' }}
            />
            <input
              type="date"
              value={quando}
              onChange={(e) => setQuando(e.target.value)}
              style={{ ...CAMPO_REEMBOLSO, flex: '0 0 130px', colorScheme: 'dark' }}
            />
          </div>
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Motivo — ex.: item devolvido"
            style={CAMPO_REEMBOLSO}
          />
          <input
            value={item}
            onChange={(e) => setItem(e.target.value)}
            placeholder="Item (opcional) — ex.: Libre Intense 5 ml"
            style={CAMPO_REEMBOLSO}
          />
          {/* O id do movimento é o que casa com a linha do extrato por
              igualdade exata, em vez de por valor e data aproximados — a mesma
              lição do crédito que o palpite grudou no pedido errado. */}
          <input
            value={movimento}
            onChange={(e) => setMovimento(e.target.value)}
            placeholder="Id do estorno no gateway (opcional)"
            className="font-mono"
            style={CAMPO_REEMBOLSO}
          />
          <input
            ref={entrada}
            type="file"
            accept="application/pdf,image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              setArquivo(e.target.files?.[0] ?? null)
              e.target.value = ''
            }}
          />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => entrada.current?.click()}
              className="font-sans hover:text-ouro"
              style={{
                border: 0,
                background: 'transparent',
                padding: 0,
                fontSize: 11,
                color: arquivo ? 'rgba(242,237,227,.5)' : COR.ouro,
                textDecoration: 'underline',
                textUnderlineOffset: 3,
                cursor: 'pointer',
              }}
            >
              {arquivo ? `${arquivo.name} · trocar` : 'Anexar comprovante'}
            </button>
            <span style={{ flex: 1 }} />
            <button
              type="button"
              onClick={() => setAberto(false)}
              className="font-sans"
              style={{
                border: 0,
                background: 'transparent',
                padding: 0,
                fontSize: 11,
                color: 'var(--color-terciario)',
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={salvar}
              disabled={gravando || !(numero > 0) || !motivo.trim()}
              className="font-sans"
              style={{
                border: `1px solid ${BORDA.ouro}`,
                background: FUNDO.ouro,
                color: COR.ouro,
                borderRadius: 8,
                padding: '6px 12px',
                fontSize: 11.5,
                cursor: gravando ? 'wait' : 'pointer',
                opacity: numero > 0 && motivo.trim() ? 1 : 0.45,
              }}
            >
              {gravando ? 'Gravando…' : 'Registrar'}
            </button>
          </div>
          <span
            className="font-sans"
            style={{ fontSize: 10, lineHeight: 1.4, color: 'var(--color-terciario)', textWrap: 'pretty' }}
          >
            O valor entra como dedução de receita e o caixa sai pela linha do estorno no extrato do
            gateway — nunca em dobro. O estoque não se mexe: se o produto voltou, use Devoluções.
          </span>
          {erro && (
            <span className="font-sans" style={{ fontSize: 10.5, color: COR.erro, textWrap: 'pretty' }}>
              {erro}
            </span>
          )}
        </div>
      )}
    </Bloco>
  )
}

const CAMPO_REEMBOLSO = {
  width: '100%',
  minWidth: 0,
  padding: '6px 8px',
  fontSize: 11.5,
  color: 'var(--color-corrente)',
  background: 'rgba(255,255,255,.04)',
  border: '1px solid var(--color-borda-sutil)',
  borderRadius: 8,
  outline: 'none',
} as const

function CampoComprovante({ url, pedidoId }: { url: string | null; pedidoId: string }) {
  const entrada = useRef<HTMLInputElement>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, enviar] = useTransition()

  const escolher = (arquivo: File) =>
    enviar(async () => {
      setErro(null)
      const r = await anexarComprovanteDoPedido(pedidoId, arquivo)
      if (!r.ok) setErro(r.erro)
    })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      <RotuloCampo>Comprovante da venda</RotuloCampo>
      <input
        ref={entrada}
        type="file"
        accept="application/pdf,image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const arquivo = e.target.files?.[0]
          if (arquivo) escolher(arquivo)
          // Zerado para o mesmo arquivo poder ser reenviado depois de um erro.
          e.target.value = ''
        }}
      />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="font-sans hover:text-ouro"
            style={{
              fontSize: 12,
              color: COR.ouro,
              textDecoration: 'underline',
              textUnderlineOffset: 3,
            }}
          >
            Abrir comprovante
          </a>
        )}
        <button
          type="button"
          onClick={() => entrada.current?.click()}
          disabled={enviando}
          className="font-sans hover:text-ouro"
          style={{
            border: 0,
            background: 'transparent',
            padding: 0,
            fontSize: 12,
            color: url ? 'rgba(242,237,227,.5)' : COR.ouro,
            textDecoration: 'underline',
            textUnderlineOffset: 3,
            cursor: enviando ? 'wait' : 'pointer',
          }}
        >
          {enviando ? 'Enviando…' : url ? 'Trocar' : 'Anexar comprovante'}
        </button>
      </div>
      {erro && (
        <span className="font-sans" style={{ fontSize: 11, lineHeight: 1.45, color: COR.erro }}>
          {erro}
        </span>
      )}
    </div>
  )
}

/** Um ponto na linha do tempo: bolinha colorida, título, detalhe e hora. */
export function Momento({
  quando,
  tom,
  titulo,
  detalhe,
}: {
  quando: string
  tom: Tom
  titulo: string
  detalhe: string
}) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '5px 0' }}>
      <span
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          alignSelf: 'stretch',
          paddingTop: 5,
        }}
      >
        <span
          style={{ width: 7, height: 7, borderRadius: 999, background: COR[tom], flex: 'none' }}
        />
        <span style={{ flex: 1, width: 1, background: 'rgba(255,255,255,.08)', marginTop: 3 }} />
      </span>
      <span style={{ minWidth: 0, paddingBottom: 6 }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span
            className="font-mono"
            style={{ fontSize: 10, color: 'var(--color-terciario)', flex: 'none' }}
          >
            {quando}
          </span>
          <span
            className="font-sans"
            style={{ fontSize: 11.5, fontWeight: 600, minWidth: 0, color: 'var(--color-corrente)' }}
          >
            {titulo}
          </span>
        </span>
        <span
          className="font-sans"
          style={{
            display: 'block',
            fontSize: 10.5,
            lineHeight: 1.45,
            color: 'var(--color-terciario)',
            textWrap: 'pretty',
          }}
        >
          {detalhe}
        </span>
      </span>
    </div>
  )
}

export function Selo({ tom, children }: { tom: Tom; children: ReactNode }) {
  return (
    <span
      className="font-sans"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 21,
        padding: '0 9px',
        borderRadius: 999,
        background: FUNDO[tom],
        border: `1px solid ${BORDA[tom]}`,
        color: COR[tom],
        fontSize: 10,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}

export function Nota({ children }: { children: ReactNode }) {
  return (
    <p
      className="font-sans"
      style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--color-terciario)', textWrap: 'pretty' }}
    >
      {children}
    </p>
  )
}

export function BotaoFicha({
  children,
  icone,
  primario,
  desabilitado,
  titulo,
  aoClicar,
}: {
  children: ReactNode
  icone?: ReactNode
  /** Preenchido em ouro com texto escuro — o botão principal do mockup. */
  primario?: boolean
  desabilitado?: boolean
  titulo?: string
  aoClicar: () => void
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      disabled={desabilitado}
      title={titulo}
      className={desabilitado ? 'font-sans' : 'font-sans hover:brightness-110'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        height: 33,
        padding: '0 14px',
        borderRadius: 9,
        border: primario ? '1px solid rgba(239,209,140,.65)' : '1px solid rgba(255,255,255,.12)',
        background: primario
          ? 'linear-gradient(180deg, rgba(239,209,140,.95), rgba(214,180,108,.92))'
          : 'transparent',
        color: primario ? '#1A150C' : 'rgba(242,237,227,.8)',
        fontWeight: primario ? 700 : 600,
        fontSize: 11.5,
        cursor: desabilitado ? 'not-allowed' : 'pointer',
        opacity: desabilitado ? 0.4 : 1,
        whiteSpace: 'nowrap',
      }}
    >
      {icone}
      {children}
    </button>
  )
}

function rotuloPagamento(p: Pedido['pagamento']): string {
  return {
    pago: 'Pago',
    pendente: 'Aguardando pagamento',
    divergente: 'Divergente',
    cancelado: 'Cancelado',
  }[p]
}

/** dd/MM HH:mm em São Paulo. `null` para o que não é data ISO — nunca chuta. */
export function dataHora(iso: string | null | undefined): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return null
  // Sem a vírgula que o toLocaleString põe entre data e hora — "01/08, 09:00"
  // não é como a operação escreve.
  return d
    .toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    })
    .replace(',', '')
}

// ── ícones ─────────────────────────────────────────────────────────────────

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'block', flex: 'none' }}
    >
      {children}
    </svg>
  )
}

export const IcAtualizar = () => (
  <Svg>
    <path d="M20 12a8 8 0 1 1-2.3-5.6" />
    <path d="M20 3v4h-4" />
  </Svg>
)
export const IcCopiar = () => (
  <Svg>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V6a2 2 0 0 1 2-2h9" />
  </Svg>
)
export const IcEnviar = () => (
  <Svg>
    <path d="M21 3 3 10.5l6.8 2.7L12.5 20z" />
    <path d="M21 3 9.8 13.2" />
  </Svg>
)
export const IcExterno = () => (
  <Svg>
    <path d="M14 4h6v6" />
    <path d="M20 4 11 13" />
    <path d="M19 14v5a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4 19V6.5A1.5 1.5 0 0 1 5.5 5H11" />
  </Svg>
)
export const IcFrascoFicha = () => (
  <Svg>
    <path d="M9.5 3.5h5" />
    <path d="M10.5 3.5v3h3v-3" />
    <path d="M10.5 6.5C7.5 7.6 5.5 10.4 5.5 13.7c0 3.8 2.9 6.8 6.5 6.8s6.5-3 6.5-6.8c0-3.3-2-6.1-5-7.2" />
  </Svg>
)
export const IcCheck = () => (
  <Svg>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
)
