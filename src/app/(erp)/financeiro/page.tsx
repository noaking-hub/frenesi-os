import Link from 'next/link'

import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { Badge, EstadoVazio, TituloSecao, Valor } from '@/components/erp/primitivos'
import { Tabela, type Coluna } from '@/components/erp/Tabela'
import type { Tom } from '@/components/erp/tokens'
import { repositorio } from '@/data/repository'

import { brl, conciliarRepasse, pad2, plural } from '@/domain'
import type { ResultadoConciliacao, StatusConciliacao } from '@/domain'

const TOM_STATUS: Record<StatusConciliacao, Tom> = {
  previsto: 'info',
  pendente: 'atencao',
  confirmado: 'ok',
  conciliado: 'ok',
  divergente: 'erro',
  fora_da_janela: 'neutro',
}

const ROTULO: Record<StatusConciliacao, string> = {
  previsto: 'Aguardando pagamento',
  pendente: 'Pago, sem crédito',
  confirmado: 'Conciliado',
  conciliado: 'Conciliado',
  divergente: 'Divergente',
  fora_da_janela: 'Antes de 22/07',
}

/** O que cada status significa — na tela, não na cabeça de quem escreveu. */
const LEGENDA: [string, string][] = [
  ['Conciliado', 'o crédito no extrato bate com o pedido menos a tarifa real do gateway'],
  ['Divergente', 'caiu um valor diferente do pedido menos a tarifa — investigue: estorno parcial, cupom ou desconto que o pedido não registra'],
  ['Pago, sem crédito', 'o cliente pagou e o dinheiro ainda não apareceu no extrato'],
  ['Aguardando pagamento', 'pedido sem pagamento confirmado — nada a conciliar ainda'],
  ['Antes de 22/07', 'venda anterior à conta atual do Mercado Pago; o crédito caiu na operação antiga e não vai aparecer aqui'],
]

type Visao = 'acao' | 'todas' | 'conciliadas' | 'fora'

const VISOES: { id: Visao; rotulo: string }[] = [
  { id: 'acao', rotulo: 'Precisam de ação' },
  { id: 'conciliadas', rotulo: 'Conciliadas' },
  { id: 'fora', rotulo: 'Antes de 22/07' },
  { id: 'todas', rotulo: 'Todas' },
]

const PESO_STATUS: Record<StatusConciliacao, number> = {
  divergente: 0,
  pendente: 1,
  previsto: 2,
  conciliado: 3,
  confirmado: 3,
  fora_da_janela: 4,
}

export default async function Conciliacao({
  searchParams,
}: {
  searchParams: Promise<{ ver?: string }>
}) {
  const sp = await searchParams
  const visao: Visao = (VISOES.find((v) => v.id === sp.ver)?.id ?? 'acao') as Visao

  const repasses = await repositorio().repasses()
  const resultados = repasses.map(conciliarRepasse)

  const divergentes = resultados.filter((r) => r.status === 'divergente')
  const pendentes = resultados.filter((r) => r.status === 'pendente')
  const conciliadas = resultados.filter(
    (r) => r.status === 'conciliado' || r.status === 'confirmado',
  )
  const fora = resultados.filter((r) => r.status === 'fora_da_janela')

  const aMenos = divergentes
    .filter((r) => (r.diferenca ?? 0) < 0)
    .reduce((a, r) => a + Math.abs(r.diferenca ?? 0), 0)
  const aMais = divergentes
    .filter((r) => (r.diferenca ?? 0) > 0)
    .reduce((a, r) => a + (r.diferenca ?? 0), 0)
  const aguardando = pendentes.reduce((a, r) => a + r.liquidoEsperado, 0)
  const tarifaPaga = conciliadas.reduce((a, r) => a + (r.repasse.taxaReal ?? 0), 0)

  const kpis: Kpi[] = [
    {
      label: 'Conciliadas',
      valor: pad2(conciliadas.length),
      hint: `Crédito confere · ${brl(tarifaPaga)} de tarifa real paga`,
      tom: 'ok',
    },
    {
      label: 'Divergências',
      valor: pad2(divergentes.length),
      hint: divergentes.length
        ? [aMenos ? `${brl(aMenos)} a menos` : '', aMais ? `${brl(aMais)} a mais` : '']
            .filter(Boolean)
            .join(' · ')
        : 'Nenhum valor fora do esperado',
      tom: divergentes.length ? 'erro' : 'ok',
    },
    {
      label: 'Pagas sem crédito',
      valor: pad2(pendentes.length),
      hint: pendentes.length
        ? `${brl(aguardando)} ainda não apareceram no extrato`
        : 'Todo pagamento confirmado já creditou',
      tom: pendentes.length ? 'atencao' : 'ok',
    },
    {
      label: 'Antes de 22/07',
      valor: pad2(fora.length),
      hint: 'Vendas da conta antiga — fora do alcance deste extrato',
      tom: 'neutro',
    },
  ]

  // O que a visão escolhida mostra. "Precisam de ação" é o padrão: uma fila
  // de 427 itens onde 400 não têm ação possível é uma fila que ninguém abre.
  const visiveis = resultados
    .filter((r) => {
      if (visao === 'acao') return r.precisaAcao
      if (visao === 'conciliadas') return r.status === 'conciliado' || r.status === 'confirmado'
      if (visao === 'fora') return r.status === 'fora_da_janela'
      return true
    })
    .sort(
      (a, b) =>
        PESO_STATUS[a.status] - PESO_STATUS[b.status] ||
        (b.repasse.compradoEm ?? '').localeCompare(a.repasse.compradoEm ?? ''),
    )

  const colunas: Coluna<ResultadoConciliacao>[] = [
    {
      chave: 'pedido',
      titulo: 'Pedido',
      largura: '150px',
      render: (r) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Valor tamanho={11.5} tom="ouro">
            {r.repasse.pedidoId}
          </Valor>
          <span className="font-mono" style={{ fontSize: 9.5, color: 'rgba(242,237,227,.35)' }}>
            {r.repasse.compradoEm ? r.repasse.compradoEm.split('-').reverse().join('/') : '—'}
          </span>
        </span>
      ),
    },
    {
      chave: 'origem',
      titulo: 'Pagamento',
      largura: 'minmax(0,1fr)',
      render: (r) => (
        <span
          className="font-sans"
          style={{ fontWeight: 500, fontSize: 12, lineHeight: 1.3, color: 'rgba(242,237,227,.8)' }}
        >
          {r.repasse.origem}
        </span>
      ),
    },
    {
      chave: 'esperado',
      titulo: 'Pedido (bruto)',
      largura: '118px',
      alinhamento: 'right',
      render: (r) => (
        <Valor tamanho={12} peso={400} tom="rgba(242,237,227,.7)">
          {brl(r.repasse.esperado)}
        </Valor>
      ),
    },
    {
      chave: 'tarifa',
      titulo: 'Tarifa',
      largura: '100px',
      alinhamento: 'right',
      render: (r) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
          <Valor tamanho={12} peso={400} tom="var(--color-terciario)">
            {r.repasse.taxaReal === null || r.repasse.taxaReal === undefined
              ? '—'
              : brl(r.repasse.taxaReal)}
          </Valor>
          {(r.repasse.taxaReal === null || r.repasse.taxaReal === undefined) && (
            <span className="font-sans" style={{ fontSize: 9, color: 'rgba(242,237,227,.3)' }}>
              gateway ainda não informou
            </span>
          )}
        </span>
      ),
    },
    {
      chave: 'recebido',
      titulo: 'Caiu na conta',
      largura: '118px',
      alinhamento: 'right',
      render: (r) => (
        <Valor tamanho={12}>{r.repasse.recebido === null ? '—' : brl(r.repasse.recebido)}</Valor>
      ),
    },
    {
      chave: 'diferenca',
      titulo: 'Diferença',
      largura: '104px',
      alinhamento: 'right',
      render: (r) => (
        <Valor
          tamanho={12}
          tom={r.diferenca === null ? 'var(--color-terciario)' : r.diferenca < 0 ? 'erro' : 'atencao'}
        >
          {r.diferenca === null
            ? '—'
            : `${r.diferenca < 0 ? '−' : '+'} ${brl(Math.abs(r.diferenca))}`}
        </Valor>
      ),
    },
    {
      chave: 'status',
      titulo: 'Status',
      largura: '150px',
      render: (r) => <Badge tom={TOM_STATUS[r.status]}>{ROTULO[r.status]}</Badge>,
    },
  ]

  // O botão "Conciliar" morreu de causa natural: a conciliação é automática a
  // cada atualização do extrato, e quando o crédito caiu, a tarifa e a
  // diferença já estão calculadas. O que sobra divergente é informação para
  // investigar (estorno parcial, desconto que não bate), não um clique.

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <TituloSecao tamanho={16}>Cada venda contra o extrato</TituloSecao>
        <span
          className="font-sans"
          style={{ fontSize: 10.5, lineHeight: 1.4, color: 'var(--color-terciario)', textWrap: 'pretty' }}
        >
          A conciliação acontece sozinha a cada atualização do extrato. O que aparece aqui é o
          resultado — e a visão padrão mostra só o que sobrou para alguém decidir.
        </span>
      </div>

      {/* Visões como links: o filtro fica na URL e sobrevive ao F5. */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {VISOES.map((v) => {
          const ativa = v.id === visao
          const quantos =
            v.id === 'acao'
              ? divergentes.length + pendentes.length
              : v.id === 'conciliadas'
                ? conciliadas.length
                : v.id === 'fora'
                  ? fora.length
                  : resultados.length
          return (
            <Link
              key={v.id}
              href={v.id === 'acao' ? '/financeiro' : `/financeiro?ver=${v.id}`}
              className="font-sans"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                height: 30,
                padding: '0 13px',
                borderRadius: 'var(--radius-pill)',
                border: `1px solid ${ativa ? 'rgba(239,209,140,.45)' : 'rgba(255,255,255,.1)'}`,
                background: ativa ? 'rgba(239,209,140,.09)' : 'transparent',
                color: ativa ? 'var(--color-ouro)' : 'rgba(242,237,227,.6)',
                fontWeight: 600,
                fontSize: 11.5,
                transition: 'background-color .16s, color .16s, border-color .16s',
              }}
            >
              {v.rotulo}
              <span className="font-mono" style={{ fontSize: 10, opacity: 0.75 }}>
                {quantos}
              </span>
            </Link>
          )
        })}
      </div>

      {visiveis.length === 0 ? (
        <EstadoVazio
          titulo={visao === 'acao' ? 'Nada precisa de você' : 'Nada nesta visão'}
          instrucao={
            visao === 'acao'
              ? 'Toda venda com crédito no extrato está conciliada. Divergências e pagamentos sem crédito apareceriam aqui.'
              : 'Troque a visão acima para ver as demais vendas.'
          }
        />
      ) : (
        <Tabela
          colunas={colunas}
          itens={visiveis}
          chaveDe={(r) => r.repasse.pedidoId}
          bandeiraDe={(r) =>
            r.status === 'divergente' ? 'erro' : r.status === 'pendente' ? 'atencao' : null
          }
        />
      )}

      {/* Legenda: o significado de cada status mora na tela. */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 7,
          padding: '14px 16px',
          background: 'var(--color-mesa)',
          border: '1px solid var(--color-borda)',
          borderRadius: 'var(--radius-card)',
        }}
      >
        <TituloSecao tamanho={12}>O que cada status quer dizer</TituloSecao>
        {LEGENDA.map(([nome, texto]) => (
          <span
            key={nome}
            className="font-sans"
            style={{ fontSize: 10.5, lineHeight: 1.5, color: 'var(--color-terciario)' }}
          >
            <strong style={{ color: 'rgba(242,237,227,.75)', fontWeight: 600 }}>{nome}</strong>
            {` — ${texto}.`}
          </span>
        ))}
        <span
          className="font-sans"
          style={{ fontSize: 10.5, lineHeight: 1.5, color: 'var(--color-terciario)' }}
        >
          {plural(resultados.length, 'venda acompanhada', 'vendas acompanhadas')} no total.
        </span>
      </div>
    </div>
  )
}
