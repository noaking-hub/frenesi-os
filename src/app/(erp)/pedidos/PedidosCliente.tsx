'use client'

import { useMemo, useState, useTransition } from 'react'

import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { Modal } from '@/components/erp/Modal'
import { BotaoSecundario, FaixaAlerta, Ponto, Rotulo, Valor } from '@/components/erp/primitivos'
import { CelulaDupla, Tabela, type Coluna } from '@/components/erp/Tabela'
import { COR, type Tom } from '@/components/erp/tokens'
import {
  ROTULO_SITUACAO,
  brl,
  paginaDeRastreio,
  slaDeExpedicao,
  type EstadoSla,
  type Pedido,
  type Sla,
  type SituacaoPedido,
  type StatusDevolucao,
} from '@/domain'

import { confirmarEntregaEmMaos } from './actions'

/**
 * A tela de Pedidos, reconstruída sobre o escopo funcional do módulo.
 *
 * A ideia central do escopo: ao abrir, o operador precisa identificar em
 * segundos o que exige ação. Por isso os cartões do topo FILTRAM ao clique em
 * vez de só informar, e a linha carrega transportadora, rastreio e prazo sem
 * exigir que o pedido seja aberto.
 *
 * A escada operacional de seis degraus do escopo original ficou de fora a
 * pedido da operação: ela não trabalha assim, e campo que ninguém marca fica
 * sempre vazio. O ciclo real tem quatro momentos — pago, faturado, enviado,
 * entregue — e os três primeiros vêm da Yampi.
 */

const TOM_SITUACAO: Record<SituacaoPedido, Tom> = {
  pago: 'info',
  em_producao: 'ouro',
  faturado: 'ouro',
  enviado: 'info',
  entregue: 'ok',
  cancelado: 'neutro',
}

const TOM_SLA: Record<EstadoSla, Tom> = {
  hoje: 'atencao',
  amanha: 'ouro',
  'em-atraso': 'erro',
  entregue: 'ok',
  'sem-previsao': 'neutro',
  'em-dia': 'neutro',
}

type Fila =
  | 'Todos'
  | 'Aguardando expedição'
  | 'Em atraso'
  | 'Em trânsito'
  | 'Entregues'
  | 'Entrega local'

interface Linha {
  pedido: Pedido
  devolucao: StatusDevolucao
}

export function PedidosCliente({ itens }: { itens: Linha[] }) {
  const [fila, setFila] = useState<Fila>('Todos')
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState<{ p: Pedido; devolucao: StatusDevolucao } | null>(null)
  const [recado, setRecado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  // O SLA é calculado uma vez por render e viaja junto: recalcular dentro do
  // filtro e de novo dentro da coluna faria a mesma conta três vezes por linha.
  const comSla = useMemo(
    () => itens.map((i) => ({ p: i.pedido, sla: slaDeExpedicao(i.pedido), devolucao: i.devolucao })),
    [itens],
  )

  const predicados: Record<Fila, (x: { p: Pedido; sla: Sla }) => boolean> = {
    Todos: () => true,
    'Aguardando expedição': ({ p }) => p.situacao === 'pago' || p.situacao === 'faturado',
    'Em atraso': ({ sla }) => sla.estado === 'em-atraso',
    'Em trânsito': ({ p }) => p.situacao === 'enviado',
    Entregues: ({ p }) => p.situacao === 'entregue',
    'Entrega local': ({ p }) => p.entregaLocal && p.situacao !== 'entregue',
  }

  const termo = busca.trim().toLowerCase()
  const visiveis = comSla
    .filter(predicados[fila])
    .filter(
      ({ p }) =>
        !termo ||
        [p.id, p.cliente, p.email, p.cpf, p.destino, p.rastreio ?? '', p.transportadora ?? '']
          .join(' ')
          .toLowerCase()
          .includes(termo),
    )

  const contar = (f: Fila) => comSla.filter(predicados[f]).length

  // Cartões que FILTRAM ao clique — é o que o escopo pede e o que separa um
  // painel operacional de um relatório: o número aponta para o trabalho.
  // Clicar de novo no cartão já ativo volta para "Todos" — sem isso o operador
  // fica preso na fila que abriu e precisa caçar o chip para sair.
  const irPara = (f: Fila) => () => setFila((atual) => (atual === f ? 'Todos' : f))

  const kpis: Kpi[] = [
    {
      label: 'Aguardando expedição',
      valor: String(contar('Aguardando expedição')),
      hint: 'Pago ou faturado, ainda não despachado',
      tom: contar('Aguardando expedição') ? 'ouro' : 'neutro',
      aoClicar: irPara('Aguardando expedição'),
      ativo: fila === 'Aguardando expedição',
    },
    {
      label: 'Em atraso',
      valor: String(contar('Em atraso')),
      hint: 'Passou do prazo de expedição',
      tom: contar('Em atraso') ? 'erro' : 'ok',
      aoClicar: irPara('Em atraso'),
      ativo: fila === 'Em atraso',
    },
    {
      label: 'Em trânsito',
      valor: String(contar('Em trânsito')),
      hint: 'Com a transportadora',
      tom: 'info',
      aoClicar: irPara('Em trânsito'),
      ativo: fila === 'Em trânsito',
    },
    {
      label: 'Entregues',
      valor: String(contar('Entregues')),
      hint: 'Entrega confirmada',
      tom: 'ok',
      aoClicar: irPara('Entregues'),
      ativo: fila === 'Entregues',
    },
    {
      label: 'Entrega local',
      valor: String(contar('Entrega local')),
      hint: 'Motoboy · confirmar entrega baixa o estoque',
      tom: contar('Entrega local') ? 'atencao' : 'neutro',
      aoClicar: irPara('Entrega local'),
      ativo: fila === 'Entrega local',
    },
  ]

  const entregar = (p: Pedido) => {
    setErro(null)
    setRecado(null)
    iniciar(async () => {
      const r = await confirmarEntregaEmMaos(p.id)
      if (!r.ok) return setErro(r.erro)
      setAberto(null)
      setRecado(
        r.mlConsumido > 0
          ? `${p.id} entregue · ${r.mlConsumido.toFixed(1).replace('.', ',')} ml baixados do estoque.`
          : `${p.id} entregue. Nenhum ml baixado — os perfumes deste pedido estão fora do controle de estoque.`,
      )
    })
  }

  const colunas: Coluna<{ p: Pedido; sla: Sla }>[] = [
    {
      chave: 'pedido',
      titulo: 'Pedido',
      largura: '150px',
      render: ({ p }) => (
        <CelulaDupla principal={p.id} secundaria={`${p.data} · ${p.canal}`} />
      ),
    },
    {
      chave: 'cliente',
      titulo: 'Cliente',
      largura: '1fr',
      render: ({ p }) => <CelulaDupla principal={p.cliente} secundaria={p.destino || '—'} />,
    },
    {
      chave: 'valor',
      titulo: 'Valor',
      largura: '96px',
      alinhamento: 'right',
      render: ({ p }) => <Valor tamanho={11.5}>{brl(p.valor)}</Valor>,
    },
    {
      chave: 'situacao',
      titulo: 'Situação',
      largura: '118px',
      render: ({ p }) => (
        <span
          className="font-sans"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            fontWeight: 500,
            fontSize: 10.5,
            color: COR[TOM_SITUACAO[p.situacao]],
            whiteSpace: 'nowrap',
          }}
        >
          <Ponto tom={TOM_SITUACAO[p.situacao]} />
          {ROTULO_SITUACAO[p.situacao]}
        </span>
      ),
    },
    {
      chave: 'envio',
      titulo: 'Envio',
      largura: '190px',
      render: ({ p }) =>
        p.entregaLocal ? (
          <CelulaDupla principal="Entrega local" secundaria="Motoboy · sem rastreio" />
        ) : p.rastreio ? (
          <CelulaDupla
            principal={p.transportadora ?? 'Transportadora não identificada'}
            secundaria={p.rastreio}
          />
        ) : (
          <span className="font-sans" style={{ fontSize: 10.5, color: 'var(--color-terciario)' }}>
            Sem código
          </span>
        ),
    },
    {
      chave: 'sla',
      titulo: 'Prazo',
      largura: '132px',
      render: ({ sla }) => (
        <span
          className="font-sans"
          style={{ fontWeight: 500, fontSize: 10.5, color: COR[TOM_SLA[sla.estado]], whiteSpace: 'nowrap' }}
        >
          {sla.rotulo}
        </span>
      ),
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <FaixaKpis kpis={kpis} />

      {erro && <FaixaAlerta tom="erro" texto={erro} />}
      {recado && <FaixaAlerta tom="ok" texto={recado} />}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {(Object.keys(predicados) as Fila[]).map((f) => {
          const ativo = f === fila
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFila(f)}
              className="font-sans hover:border-ouro/40"
              style={{
                height: 30,
                padding: '0 13px',
                border: `1px solid ${ativo ? 'rgba(239,209,140,.45)' : 'rgba(255,255,255,.1)'}`,
                background: ativo ? 'rgba(239,209,140,.09)' : 'transparent',
                color: ativo ? COR.ouro : 'rgba(242,237,227,.6)',
                fontWeight: 600,
                fontSize: 11,
                borderRadius: 'var(--radius-pill)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {f} <span style={{ opacity: 0.55 }}>{contar(f)}</span>
            </button>
          )
        })}
      </div>

      <label
        className="focus-within:border-ouro/45"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          maxWidth: 520,
          height: 38,
          padding: '0 14px',
          border: '1px solid rgba(255,255,255,.09)',
          background: 'rgba(255,255,255,.03)',
          borderRadius: 9,
        }}
      >
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por pedido, cliente, CPF, cidade, rastreio ou transportadora"
          className="font-sans"
          style={{
            flex: 1,
            border: 0,
            outline: 0,
            background: 'transparent',
            color: 'var(--color-corrente)',
            fontSize: 12.5,
            lineHeight: 1,
          }}
        />
      </label>

      <Tabela
        colunas={colunas}
        itens={visiveis}
        chaveDe={({ p }) => p.id}
        bandeiraDe={({ sla }) => (sla.estado === 'em-atraso' ? 'erro' : null)}
        aoClicar={({ p, devolucao }) => setAberto({ p, devolucao })}
        vazio={
          <p
            className="font-sans"
            style={{
              padding: '46px 24px',
              textAlign: 'center',
              fontSize: 12,
              color: 'var(--color-terciario)',
              borderTop: '1px solid var(--color-borda-sutil)',
            }}
          >
            {termo
              ? 'Nenhum pedido encontrado para esta busca.'
              : 'Nenhum pedido nesta fila — o que é uma boa notícia.'}
          </p>
        }
      />

      {aberto && (
        <DetalheDoPedido
          pedido={aberto.p}
          devolucao={aberto.devolucao}
          pendente={pendente}
          aoEntregar={() => entregar(aberto.p)}
          aoFechar={() => setAberto(null)}
        />
      )}
    </div>
  )
}

/**
 * O painel de detalhes, com as abas que o escopo define.
 *
 * Rastreamento ganha espaço próprio porque é a aba que a operação abre para
 * responder ao cliente — e responder exige o código, a transportadora e a
 * última leitura, não um link solto.
 */
function DetalheDoPedido({
  pedido,
  devolucao,
  pendente,
  aoEntregar,
  aoFechar,
}: {
  pedido: Pedido
  devolucao: StatusDevolucao
  pendente: boolean
  aoEntregar: () => void
  aoFechar: () => void
}) {
  const [aba, setAba] = useState<'Resumo' | 'Itens' | 'Pagamento' | 'Rastreamento'>('Resumo')
  const sla = slaDeExpedicao(pedido)
  const link = pedido.rastreioUrl ?? paginaDeRastreio(pedido.transportadora, pedido.rastreio)

  const linha = (rotulo: string, valor: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Rotulo>{rotulo}</Rotulo>
      <span className="font-sans" style={{ fontSize: 12, color: 'rgba(242,237,227,.82)' }}>
        {valor || '—'}
      </span>
    </div>
  )

  const grade = (filhos: React.ReactNode) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14 }}>
      {filhos}
    </div>
  )

  return (
    <Modal titulo={`Pedido ${pedido.id}`} largura={900} padding="20px 24px 24px" aoFechar={aoFechar}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(['Resumo', 'Itens', 'Pagamento', 'Rastreamento'] as const).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAba(a)}
              className="font-sans hover:border-ouro/40"
              style={{
                height: 30,
                padding: '0 13px',
                border: `1px solid ${a === aba ? 'rgba(239,209,140,.45)' : 'rgba(255,255,255,.1)'}`,
                background: a === aba ? 'rgba(239,209,140,.09)' : 'transparent',
                color: a === aba ? COR.ouro : 'rgba(242,237,227,.6)',
                fontWeight: 600,
                fontSize: 11,
                borderRadius: 'var(--radius-pill)',
                cursor: 'pointer',
              }}
            >
              {a}
            </button>
          ))}
        </div>

        {aba === 'Resumo' &&
          grade(
            <>
              {linha('Situação', ROTULO_SITUACAO[pedido.situacao])}
              {linha('Prazo de expedição', sla.rotulo)}
              {linha('Canal', pedido.canal)}
              {linha('Comprado em', pedido.data)}
              {linha('Cliente', pedido.cliente)}
              {linha('E-mail', pedido.email)}
              {linha('CPF', pedido.cpf)}
              {linha('Telefone', pedido.telefone)}
              {linha('Destino', pedido.destino)}
              {linha('Endereço', pedido.rua)}
              {linha('CEP', pedido.cep)}
              {linha('Entregue em', pedido.entregueEm ? pedido.entregueEm.slice(0, 10) : '—')}
              {linha('Janela de devolução', devolucao.selo)}
            </>,
          )}

        {aba === 'Itens' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {pedido.itens.length === 0 && (
              <span className="font-sans" style={{ fontSize: 11.5, color: 'var(--color-terciario)' }}>
                Este pedido não trouxe itens da Yampi.
              </span>
            )}
            {pedido.itens.map((i, n) => (
              <div
                key={`${i.perfume}-${n}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 13px',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,.03)',
                  border: '1px solid rgba(255,255,255,.07)',
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <CelulaDupla principal={i.perfume} secundaria={`${i.variante} ml`} />
                </span>
                <Valor tamanho={12}>{brl(i.preco)}</Valor>
              </div>
            ))}
          </div>
        )}

        {aba === 'Pagamento' &&
          grade(
            <>
              {linha('Situação do pagamento', pedido.pagamento)}
              {linha('Valor do pedido', brl(pedido.valor))}
              {linha('Frete', brl(pedido.frete))}
              {linha('Cashback usado', brl(pedido.cashback))}
            </>,
          )}

        {aba === 'Rastreamento' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {pedido.entregaLocal ? (
              <>
                <FaixaAlerta
                  tom="atencao"
                  texto={
                    'Entrega em mãos: não há transportadora nem código. Este pedido não é faturado, ' +
                    'então a confirmação da entrega é o que fecha o ciclo e baixa o estoque.'
                  }
                />
                {pedido.situacao !== 'entregue' && (
                  <span>
                    <BotaoSecundario altura={34} desabilitado={pendente} onClick={aoEntregar}>
                      {pendente ? 'Confirmando…' : 'Confirmar entrega em mãos'}
                    </BotaoSecundario>
                  </span>
                )}
              </>
            ) : (
              <>
                {grade(
                  <>
                    {linha('Transportadora', pedido.transportadora ?? 'Não identificada')}
                    {linha('Serviço', pedido.servicoFrete ?? '—')}
                    {linha('Código', pedido.rastreio ?? 'Ainda não emitido')}
                    {linha(
                      'Última consulta',
                      pedido.rastreioLidoEm ? pedido.rastreioLidoEm.slice(0, 16).replace('T', ' ') : 'Nunca',
                    )}
                  </>,
                )}
                {link && (
                  <a
                    href={link}
                    target="_blank"
                    rel="noreferrer"
                    className="font-sans hover:brightness-110"
                    style={{ fontWeight: 600, fontSize: 11.5, color: COR.ouro, textDecoration: 'none' }}
                  >
                    Abrir rastreio na transportadora →
                  </a>
                )}
                <span
                  className="font-sans"
                  style={{ fontSize: 10.5, lineHeight: 1.5, color: 'var(--color-terciario)', textWrap: 'pretty' }}
                >
                  A linha do tempo completa dos escaneamentos fica em Pedidos → Rastreamento e
                  entregas, onde a consulta ao vivo também está.
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
