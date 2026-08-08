'use client'

import { useMemo, useState } from 'react'

import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { Badge, Ponto, Rotulo, TituloSecao, Valor } from '@/components/erp/primitivos'
import { CelulaDupla, Tabela, type Coluna } from '@/components/erp/Tabela'
import { COR, type Tom } from '@/components/erp/tokens'
import { brl, descreveVariante, pad2, plural } from '@/domain'
import type { Pedido, StatusDevolucao, StatusEnvio, StatusPagamento } from '@/domain'

const TOM_PAGAMENTO: Record<StatusPagamento, Tom> = {
  pago: 'ok',
  pendente: 'atencao',
  divergente: 'erro',
}

const TOM_ENVIO: Record<StatusEnvio, Tom> = {
  'Não iniciado': 'neutro',
  'Aguardando envio': 'atencao',
  Enviado: 'info',
  Entregue: 'ok',
  Retido: 'erro',
  Atrasado: 'erro',
}

type Filtro = 'Atenção' | 'Todos' | 'Pagos' | 'Pendentes' | 'Enviados' | 'Entregues'

interface Item {
  pedido: Pedido
  devolucao: StatusDevolucao
}

export function PedidosCliente({ itens }: { itens: Item[] }) {
  const [filtro, setFiltro] = useState<Filtro>('Todos')
  const [aberto, setAberto] = useState<Pedido | null>(null)

  // Cada filtro é um predicado; a contagem do chip sai do mesmo predicado que
  // filtra a tabela — nunca de um número escrito à mão.
  const predicados = useMemo<Record<Filtro, (i: Item) => boolean>>(
    () => ({
      Atenção: (i) =>
        i.pedido.pagamento !== 'pago' ||
        i.pedido.envio === 'Retido' ||
        i.pedido.envio === 'Atrasado' ||
        i.pedido.envio === 'Aguardando envio',
      Todos: () => true,
      Pagos: (i) => i.pedido.pagamento === 'pago',
      Pendentes: (i) => i.pedido.pagamento === 'pendente',
      Enviados: (i) => i.pedido.envio === 'Enviado',
      Entregues: (i) => i.pedido.envio === 'Entregue',
    }),
    [],
  )

  const filtros = Object.keys(predicados) as Filtro[]
  const visiveis = itens.filter(predicados[filtro])

  const pagosNaoEnviados = itens.filter(
    (i) => i.pedido.pagamento === 'pago' && i.pedido.envio === 'Aguardando envio',
  ).length
  const divergentes = itens.filter((i) => i.pedido.pagamento === 'divergente').length
  const receita = itens.reduce((a, i) => a + i.pedido.valor, 0)
  const ticket = itens.length ? receita / itens.length : 0
  const semBaixa = itens.filter(
    (i) => i.pedido.envio === 'Entregue' && i.devolucao.estado !== 'aguardando-entrega',
  ).length

  const kpis: Kpi[] = [
    {
      label: 'Pedidos no período',
      valor: pad2(itens.length),
      hint: `${brl(receita)} em receita bruta`,
    },
    {
      label: 'Pagos não enviados',
      valor: pad2(pagosNaoEnviados),
      hint: 'Prioridade de separação',
      tom: pagosNaoEnviados ? 'atencao' : 'ok',
    },
    {
      label: 'Com divergência',
      valor: pad2(divergentes),
      hint: 'Valor recebido diferente do pedido',
      tom: divergentes ? 'erro' : 'ok',
    },
    {
      label: 'Ticket médio',
      valor: brl(ticket),
      hint: `${plural(itens.length, 'pedido', 'pedidos')} no período`,
      tom: 'ouro',
    },
    {
      label: 'Entregues',
      valor: pad2(semBaixa),
      hint: 'Marcação vinda da Yampi · inicia o prazo de devolução',
      tom: 'ok',
    },
  ]

  const colunas: Coluna<Item>[] = [
    {
      chave: 'pedido',
      titulo: 'Pedido',
      largura: '104px',
      render: (i) => (
        <Valor tamanho={11.5} tom="ouro">
          {i.pedido.id}
        </Valor>
      ),
    },
    {
      chave: 'cliente',
      titulo: 'Cliente',
      largura: 'minmax(0,1fr)',
      render: (i) => (
        <CelulaDupla
          principal={i.pedido.cliente}
          secundaria={`${plural(i.pedido.itens.length, 'item', 'itens')} · ${i.pedido.destino}`}
        />
      ),
    },
    {
      chave: 'data',
      titulo: 'Data',
      largura: '84px',
      render: (i) => (
        <Valor tamanho={11} peso={400} tom="var(--color-secundario)">
          {i.pedido.data}
        </Valor>
      ),
    },
    {
      chave: 'canal',
      titulo: 'Canal',
      largura: '96px',
      render: (i) => (
        <span
          className="font-sans"
          style={{ fontWeight: 500, fontSize: 10.5, color: 'var(--color-secundario)' }}
        >
          {i.pedido.canal}
        </span>
      ),
    },
    {
      chave: 'valor',
      titulo: 'Valor',
      largura: '108px',
      alinhamento: 'right',
      render: (i) => <Valor tamanho={12.5}>{brl(i.pedido.valor)}</Valor>,
    },
    {
      chave: 'pagamento',
      titulo: 'Pagamento',
      largura: '132px',
      render: (i) => <Badge tom={TOM_PAGAMENTO[i.pedido.pagamento]}>{i.pedido.pagamento}</Badge>,
    },
    {
      chave: 'envio',
      titulo: 'Envio',
      largura: '152px',
      render: (i) => (
        <span
          className="font-sans"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            fontWeight: 500,
            fontSize: 11,
            color: COR[TOM_ENVIO[i.pedido.envio]],
          }}
        >
          <Ponto tom={TOM_ENVIO[i.pedido.envio]} />
          {i.pedido.envio}
        </span>
      ),
    },
    {
      chave: 'seta',
      titulo: '',
      largura: '34px',
      alinhamento: 'right',
      render: () => (
        <span aria-hidden style={{ fontSize: 13, color: 'rgba(242,237,227,.28)' }}>
          →
        </span>
      ),
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
        {filtros.map((f) => {
          const ativo = f === filtro
          const contagem = itens.filter(predicados[f]).length
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFiltro(f)}
              className="font-sans hover:border-ouro/40"
              style={{
                height: 32,
                padding: '0 13px',
                border: `1px solid ${ativo ? 'rgba(239,209,140,.4)' : 'var(--color-borda)'}`,
                background: ativo ? 'rgba(239,209,140,.09)' : 'transparent',
                color: ativo ? 'var(--color-ouro)' : 'var(--color-secundario)',
                fontWeight: 600,
                fontSize: 11,
                borderRadius: 'var(--radius-pill)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 7,
              }}
            >
              {f}
              <span className="font-mono" style={{ fontWeight: 500, fontSize: 10, opacity: 0.6 }}>
                {contagem}
              </span>
            </button>
          )
        })}
      </div>

      <Tabela
        colunas={colunas}
        itens={visiveis}
        chaveDe={(i) => i.pedido.id}
        aoClicar={(i) => setAberto(i.pedido)}
        bandeiraDe={(i) =>
          i.pedido.pagamento === 'divergente' || i.pedido.envio === 'Retido'
            ? 'erro'
            : i.pedido.envio === 'Aguardando envio'
              ? 'atencao'
              : null
        }
        rodape={
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '13px 18px',
              borderTop: '1px solid rgba(255,255,255,.06)',
            }}
          >
            <span
              className="font-sans"
              style={{ fontSize: 11, color: 'var(--color-terciario)' }}
            >
              {`${visiveis.length} de ${itens.length} pedidos · filtro ${filtro}`}
            </span>
          </div>
        }
      />

      {aberto && <FichaPedido pedido={aberto} aoFechar={() => setAberto(null)} />}
    </div>
  )
}

/** Drawer lateral com a ficha completa do pedido. */
function FichaPedido({ pedido, aoFechar }: { pedido: Pedido; aoFechar: () => void }) {
  const subtotal = pedido.itens.reduce((a, i) => a + i.preco, 0)

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 40,
        display: 'flex',
        justifyContent: 'flex-end',
        background: 'rgba(0,0,0,.55)',
      }}
      onClick={aoFechar}
    >
      <aside
        role="dialog"
        aria-label={`Ficha do pedido ${pedido.id}`}
        onClick={(e) => e.stopPropagation()}
        className="animate-[fr-in_.22s_ease_both]"
        style={{
          width: 420,
          height: '100vh',
          overflowY: 'auto',
          background: 'linear-gradient(180deg,#141315,#0E0D0F)',
          borderLeft: '1px solid var(--color-borda-ouro)',
          boxShadow: 'var(--shadow-modal)',
          padding: '22px 24px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
            <Rotulo>{`${pedido.canal} · ${pedido.data}`}</Rotulo>
            <TituloSecao tamanho={19}>{pedido.id}</TituloSecao>
          </div>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar ficha"
            style={{
              width: 28,
              height: 28,
              border: '1px solid var(--color-borda)',
              background: 'transparent',
              color: 'var(--color-secundario)',
              borderRadius: 7,
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Badge tom={TOM_PAGAMENTO[pedido.pagamento]}>{pedido.pagamento}</Badge>
          <Badge tom={TOM_ENVIO[pedido.envio]}>{pedido.envio}</Badge>
          <Badge tom="neutro">{pedido.gateway}</Badge>
        </div>

        <Bloco titulo="Cliente">
          <Linha rotulo="Nome" valor={pedido.cliente} />
          <Linha rotulo="E-mail" valor={pedido.email} />
          <Linha rotulo="Telefone" valor={pedido.telefone} />
        </Bloco>

        <Bloco titulo="Entrega">
          <Linha rotulo="Endereço" valor={pedido.rua} />
          <Linha rotulo="Cidade" valor={pedido.destino} />
          <Linha rotulo="CEP" valor={pedido.cep} mono />
          <Linha rotulo="Volume" valor={`${pedido.peso} · ${pedido.dimensoes}`} />
          <Linha rotulo="Rastreio" valor={pedido.rastreio ?? 'etiqueta não emitida'} mono />
          {/* A marcação de entrega é o que inicia o prazo de devolução. */}
          <Linha
            rotulo="Entregue em"
            valor={pedido.entregueEm ?? 'aguardando confirmação da Yampi'}
          />
        </Bloco>

        <Bloco titulo="Itens">
          {pedido.itens.map((item, idx) => (
            <div
              key={`${item.perfume}-${idx}`}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                paddingBottom: 10,
                borderBottom: '1px solid var(--color-borda-sutil)',
              }}
            >
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span
                  className="font-sans"
                  style={{ fontWeight: 600, fontSize: 12, color: 'var(--color-corrente)' }}
                >
                  {item.perfume}
                </span>
                <span
                  className="font-sans"
                  style={{ fontSize: 10.5, color: 'var(--color-terciario)' }}
                >
                  {/* Variante e frasco vêm da mesma regra do portal. */}
                  {descreveVariante(item.variante)}
                </span>
              </span>
              <Valor tamanho={12}>{brl(item.preco)}</Valor>
            </div>
          ))}
          <Linha rotulo="Subtotal" valor={brl(subtotal)} mono />
          <Linha rotulo="Frete" valor={brl(pedido.frete)} mono />
          {pedido.cashback > 0 && (
            <Linha rotulo="Cashback gerado" valor={brl(pedido.cashback)} mono />
          )}
          <Linha rotulo="Total do pedido" valor={brl(pedido.valor)} mono />
        </Bloco>
      </aside>
    </div>
  )
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '15px 16px',
        background: 'rgba(255,255,255,.028)',
        border: '1px solid var(--color-borda)',
        borderRadius: 12,
      }}
    >
      <Rotulo>{titulo}</Rotulo>
      {children}
    </section>
  )
}

function Linha({ rotulo, valor, mono }: { rotulo: string; valor: string; mono?: boolean }) {
  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      <span className="font-sans" style={{ fontSize: 11, color: 'var(--color-terciario)' }}>
        {rotulo}
      </span>
      {mono ? (
        <Valor tamanho={11.5}>{valor}</Valor>
      ) : (
        <span
          className="font-sans"
          style={{
            fontWeight: 500,
            fontSize: 11.5,
            color: 'var(--color-corrente)',
            textAlign: 'right',
            textWrap: 'pretty',
          }}
        >
          {valor}
        </span>
      )}
    </span>
  )
}
