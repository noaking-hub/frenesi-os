'use client'

import { useMemo, useState } from 'react'

import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { BotaoOuro, Ponto, Rotulo, Switch, TituloSecao, Valor } from '@/components/erp/primitivos'
import { CelulaDupla, Tabela, type Coluna } from '@/components/erp/Tabela'
import { COR, type Tom } from '@/components/erp/tokens'
import {
  ROTULO_RASTREIO,
  ROTULO_SHOPIFY,
  aguardaBaixaShopify,
  ehExcecao,
  plural,
  resumirEnvios,
} from '@/domain'
import type { Envio, EstadoShopify, StatusRastreio } from '@/domain'

const TOM_RASTREIO: Record<StatusRastreio, Tom> = {
  'pagamento-pendente': 'neutro',
  'aguardando-postagem': 'atencao',
  'em-transito': 'info',
  entregue: 'ok',
  'entrega-nao-efetuada': 'erro',
  'sem-movimentacao': 'erro',
}

const TOM_SHOPIFY: Record<EstadoShopify, Tom> = {
  'aguardando-pagamento': 'neutro',
  'aguardando-envio': 'neutro',
  'em-transito': 'info',
  'aguardando-baixa': 'ouro',
  entregue: 'ok',
}

type Filtro = 'Todos' | 'Em trânsito' | 'Entregues' | 'Aguardando baixa' | 'Exceções' | 'Aguardando postagem'

export function EnviosCliente({ envios }: { envios: Envio[] }) {
  const [filtro, setFiltro] = useState<Filtro>('Todos')
  // Baixas aplicadas nesta sessão. Com a integração real isto vira mutação.
  const [baixados, setBaixados] = useState<Record<string, boolean>>({})
  const [rastreioAberto, setRastreioAberto] = useState<Envio | null>(null)
  const [lendoYampi, setLendoYampi] = useState(true)
  const [baixaAutomatica, setBaixaAutomatica] = useState(true)

  // Aplica as baixas locais sobre os dados antes de qualquer contagem, para que
  // KPIs, filtros e linhas nunca discordem depois de um clique.
  const atuais = useMemo<Envio[]>(
    () =>
      envios.map((e) =>
        baixados[e.pedidoId] ? { ...e, shopify: 'entregue' as EstadoShopify } : e,
      ),
    [envios, baixados],
  )

  const predicados = useMemo<Record<Filtro, (e: Envio) => boolean>>(
    () => ({
      Todos: () => true,
      'Em trânsito': (e) => e.status === 'em-transito',
      Entregues: (e) => e.status === 'entregue',
      'Aguardando baixa': aguardaBaixaShopify,
      Exceções: ehExcecao,
      'Aguardando postagem': (e) => e.status === 'aguardando-postagem',
    }),
    [],
  )

  const filtros = Object.keys(predicados) as Filtro[]
  const visiveis = atuais.filter(predicados[filtro])
  const r = resumirEnvios(atuais)
  const fila = atuais.filter(aguardaBaixaShopify)

  const kpis: Kpi[] = [
    { label: 'Em trânsito', valor: String(r.emTransito), hint: 'Rastreio disparado pela Yampi', tom: 'info' },
    { label: 'Entregues', valor: String(r.entregues), hint: 'Confirmados na Yampi', tom: 'ok' },
    {
      label: 'Baixados na Shopify',
      valor: String(r.baixados),
      hint: 'Marcados como entregues pelo ERP',
      tom: 'ok',
    },
    {
      label: 'Aguardando baixa',
      valor: String(r.aguardandoBaixa),
      hint: 'Entregue na Yampi, aberto na Shopify',
      tom: r.aguardandoBaixa ? 'ouro' : 'neutro',
    },
    {
      label: 'Exceções',
      valor: String(r.excecoes),
      hint: 'Sem movimentação ou entrega falha',
      tom: r.excecoes ? 'erro' : 'ok',
    },
  ]

  const colunas: Coluna<Envio>[] = [
    {
      chave: 'pedido',
      titulo: 'Pedido',
      largura: '90px',
      render: (e) => (
        <Valor tamanho={11.5} tom="ouro">
          {e.pedidoId}
        </Valor>
      ),
    },
    {
      chave: 'cliente',
      titulo: 'Cliente',
      largura: 'minmax(0,1fr)',
      render: (e) => <CelulaDupla principal={e.cliente} secundaria={e.destino} />,
    },
    {
      chave: 'transportadora',
      titulo: 'Transportadora',
      largura: '136px',
      render: (e) => (
        <CelulaDupla principal={e.transportadora} secundaria={`Yampi · ${e.gateway}`} />
      ),
    },
    {
      chave: 'rastreio',
      titulo: 'Rastreio',
      largura: '124px',
      render: (e) =>
        e.rastreio ? (
          <button
            type="button"
            onClick={(ev) => {
              ev.stopPropagation()
              setRastreioAberto(e)
            }}
            className="font-mono hover:text-ouro"
            style={{
              border: 0,
              background: 'transparent',
              padding: 0,
              fontWeight: 500,
              fontSize: 11,
              color: 'var(--color-ouro)',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            {e.rastreio}
          </button>
        ) : (
          // Etiqueta é gerada manualmente na Frenet/Melhor Envio — até lá não há código.
          <span className="font-mono" style={{ fontSize: 11, color: 'rgba(242,237,227,.35)' }}>
            Sem código
          </span>
        ),
    },
    {
      chave: 'evento',
      titulo: 'Último evento',
      largura: 'minmax(0,1fr)',
      render: (e) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <span
            className="font-sans"
            style={{
              fontSize: 11.5,
              lineHeight: 1.3,
              color: COR[TOM_RASTREIO[e.status]],
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {e.ultimoEvento}
          </span>
          <span
            className="font-mono"
            style={{ fontSize: 10, lineHeight: 1.25, color: 'rgba(242,237,227,.35)' }}
          >
            {`${ROTULO_RASTREIO[e.status]} · ${e.eventoQuando}`}
          </span>
        </span>
      ),
    },
    {
      chave: 'shopify',
      titulo: 'Shopify',
      largura: '152px',
      render: (e) =>
        aguardaBaixaShopify(e) ? (
          <button
            type="button"
            onClick={() => setBaixados((s) => ({ ...s, [e.pedidoId]: true }))}
            className="font-sans hover:bg-[rgba(239,209,140,.18)]"
            style={{
              height: 27,
              padding: '0 10px',
              border: '1px solid rgba(239,209,140,.32)',
              background: 'rgba(239,209,140,.08)',
              color: 'var(--color-ouro)',
              fontWeight: 600,
              fontSize: 10.5,
              borderRadius: 7,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Marcar entregue
          </button>
        ) : (
          <span
            className="font-sans"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              fontWeight: 500,
              fontSize: 10.5,
              color: COR[TOM_SHOPIFY[e.shopify]],
              whiteSpace: 'nowrap',
            }}
          >
            <Ponto tom={TOM_SHOPIFY[e.shopify]} />
            {ROTULO_SHOPIFY[e.shopify]}
          </span>
        ),
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }}>
        <CardIntegracao
          sigla="YP"
          nome="Yampi"
          ligado={lendoYampi}
          aoAlternar={setLendoYampi}
          status={lendoYampi ? 'Rastreamento ativo' : 'Desligado'}
          detalhe={
            lendoYampi
              ? 'Frete e rastreio de Melhor Envio e Frenet · consulta a cada 15 min'
              : 'Leitura de rastreio desligada · nenhuma entrega será capturada'
          }
        />
        <CardIntegracao
          sigla="SH"
          nome="Shopify · baixa de entrega"
          ligado={baixaAutomatica}
          aoAlternar={setBaixaAutomatica}
          status={baixaAutomatica ? 'Automática' : 'Manual'}
          detalhe={
            baixaAutomatica
              ? 'A Yampi não reporta a entrega · o ERP marca o pedido como entregue na Shopify'
              : 'Baixa somente com confirmação manual nesta tela'
          }
        />
      </div>

      <FaixaKpis kpis={kpis} />

      {fila.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '14px 18px',
            borderRadius: 13,
            background: 'rgba(92,158,112,.07)',
            border: '1px solid rgba(92,158,112,.24)',
          }}
        >
          <span
            aria-hidden
            className="animate-[fr-pulse_2.4s_ease-in-out_infinite]"
            style={{ width: 7, height: 7, borderRadius: '50%', background: COR.ok, flex: 'none' }}
          />
          <span
            className="font-sans"
            style={{ flex: 1, fontWeight: 500, fontSize: 12.5, lineHeight: 1.45, color: 'rgba(242,237,227,.85)' }}
          >
            {fila.length === 1
              ? `O pedido ${fila[0].pedidoId} foi entregue na Yampi e continua aberto na Shopify.`
              : `${fila.length} pedidos entregues na Yampi continuam abertos na Shopify.`}
          </span>
          <BotaoOuro
            altura={34}
            onClick={() =>
              setBaixados((s) => {
                const novo = { ...s }
                fila.forEach((e) => {
                  novo[e.pedidoId] = true
                })
                return novo
              })
            }
          >
            Marcar entregues na Shopify
          </BotaoOuro>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
        {filtros.map((f) => {
          const ativo = f === filtro
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFiltro(f)}
              className="font-sans hover:border-ouro/40"
              style={{
                height: 31,
                padding: '0 13px',
                border: `1px solid ${ativo ? 'rgba(239,209,140,.4)' : 'var(--color-borda)'}`,
                background: ativo ? 'rgba(239,209,140,.09)' : 'transparent',
                color: ativo ? 'var(--color-ouro)' : 'var(--color-secundario)',
                fontWeight: 600,
                fontSize: 11,
                borderRadius: 'var(--radius-pill)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: 7,
              }}
            >
              {f}
              <span className="font-mono" style={{ fontWeight: 500, fontSize: 10, opacity: 0.6 }}>
                {atuais.filter(predicados[f]).length}
              </span>
            </button>
          )
        })}
      </div>

      <Tabela
        colunas={colunas}
        itens={visiveis}
        chaveDe={(e) => e.pedidoId}
        bandeiraDe={(e) =>
          ehExcecao(e) ? 'erro' : e.status === 'aguardando-postagem' ? 'atencao' : null
        }
        vazio={
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 10,
              padding: '52px 40px',
              borderTop: '1px solid var(--color-borda-sutil)',
            }}
          >
            <span
              aria-hidden
              style={{ width: 22, height: 22, border: '1px solid rgba(239,209,140,.3)', transform: 'rotate(45deg)' }}
            />
            <span
              className="font-display"
              style={{ fontWeight: 600, fontSize: 14, marginTop: 6, color: 'rgba(242,237,227,.75)' }}
            >
              Sem registros neste filtro
            </span>
            <span className="font-sans" style={{ fontSize: 11.5, color: 'var(--color-terciario)' }}>
              Nada pendente aqui no momento.
            </span>
          </div>
        }
        rodape={
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '13px 18px',
              borderTop: '1px solid rgba(255,255,255,.06)',
            }}
          >
            <span
              aria-hidden
              className="animate-[fr-pulse_2.4s_ease-in-out_infinite]"
              style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-ok)', flex: 'none' }}
            />
            <span
              className="font-sans"
              style={{ fontSize: 11, lineHeight: 1.4, color: 'var(--color-terciario)', textWrap: 'pretty' }}
            >
              Yampi consultada a cada 15 min · a Shopify recebe a baixa direto do ERP, já que a
              Yampi não reporta a entrega
            </span>
          </div>
        }
      />

      {rastreioAberto && (
        <ModalRastreio
          envio={rastreioAberto}
          aoFechar={() => setRastreioAberto(null)}
          aoBaixar={() => {
            setBaixados((s) => ({ ...s, [rastreioAberto.pedidoId]: true }))
            setRastreioAberto(null)
          }}
        />
      )}
    </div>
  )
}

function CardIntegracao({
  sigla,
  nome,
  status,
  detalhe,
  ligado,
  aoAlternar,
}: {
  sigla: string
  nome: string
  status: string
  detalhe: string
  ligado: boolean
  aoAlternar: (v: boolean) => void
}) {
  const tom: Tom = ligado ? 'ok' : 'atencao'
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        background: 'linear-gradient(150deg,#16151A,#101011)',
        border: `1px solid ${ligado ? 'rgba(92,158,112,.24)' : 'var(--color-borda)'}`,
        borderRadius: 'var(--radius-card)',
        padding: '15px 17px',
      }}
    >
      <span
        aria-hidden
        className="font-display"
        style={{
          width: 40,
          height: 40,
          borderRadius: 11,
          background: 'rgba(239,209,140,.08)',
          border: '1px solid var(--color-borda-ouro)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          fontSize: 12,
          color: 'var(--color-ouro)',
          flex: 'none',
        }}
      >
        {sigla}
      </span>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            className="font-sans"
            style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.25, color: 'var(--color-corrente)' }}
          >
            {nome}
          </span>
          <span
            className="font-sans"
            style={{
              fontWeight: 600,
              fontSize: 9,
              lineHeight: 1,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              color: COR[tom],
              border: `1px solid ${COR[tom]}`,
              borderRadius: 'var(--radius-pill)',
              padding: '3px 7px',
              whiteSpace: 'nowrap',
            }}
          >
            {status}
          </span>
        </span>
        <span
          className="font-sans"
          style={{ fontSize: 10.5, lineHeight: 1.4, color: 'var(--color-terciario)' }}
        >
          {detalhe}
        </span>
      </div>
      <Switch ligado={ligado} onChange={aoAlternar} label={nome} />
    </div>
  )
}

function ModalRastreio({
  envio,
  aoFechar,
  aoBaixar,
}: {
  envio: Envio
  aoFechar: () => void
  aoBaixar: () => void
}) {
  const podeBaixar = aguardaBaixaShopify(envio)

  return (
    <div
      onClick={aoFechar}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,.6)',
        padding: 40,
      }}
    >
      <section
        role="dialog"
        aria-label={`Rastreio do pedido ${envio.pedidoId}`}
        onClick={(e) => e.stopPropagation()}
        className="animate-[fr-in_.22s_ease_both]"
        style={{
          width: 620,
          maxHeight: '82vh',
          overflowY: 'auto',
          background: 'linear-gradient(170deg,#16151A,#101011)',
          border: '1px solid var(--color-borda-ouro)',
          borderRadius: 'var(--radius-modal)',
          boxShadow: 'var(--shadow-modal)',
          padding: '22px 24px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
            <Rotulo>{`Rastreio · ${envio.transportadora} · Yampi / ${envio.gateway}`}</Rotulo>
            <TituloSecao tamanho={18}>{envio.rastreio}</TituloSecao>
            <span
              className="font-sans"
              style={{ fontSize: 11, lineHeight: 1.4, color: 'var(--color-terciario)' }}
            >
              {`${envio.pedidoId} · ${envio.cliente} · ${envio.destino}`}
            </span>
          </div>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar rastreio"
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

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {envio.eventos.map((ev, i) => {
            const tom: Tom =
              ev.severidade === 'ok'
                ? 'ok'
                : ev.severidade === 'erro'
                  ? 'erro'
                  : ev.severidade === 'atencao'
                    ? 'atencao'
                    : ev.severidade === 'info'
                      ? 'info'
                      : 'neutro'
            return (
              <span
                key={`${ev.quando}-${i}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '92px 12px minmax(0,1fr)',
                  gap: 11,
                  alignItems: 'start',
                  padding: '8px 0',
                }}
              >
                <span
                  className="font-mono"
                  style={{ fontSize: 10, lineHeight: 1.45, color: 'rgba(242,237,227,.34)' }}
                >
                  {ev.quando}
                </span>
                <span
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 3,
                    paddingTop: 4,
                  }}
                >
                  <Ponto tom={tom} />
                  <span
                    style={{
                      width: 1,
                      flex: 1,
                      minHeight: 12,
                      background: 'var(--color-borda)',
                      display: 'block',
                    }}
                  />
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                  <span
                    className="font-sans"
                    style={{ fontSize: 11.5, lineHeight: 1.45, color: 'rgba(242,237,227,.75)' }}
                  >
                    {ev.descricao}
                  </span>
                  <span
                    className="font-sans"
                    style={{ fontSize: 10, lineHeight: 1.25, color: 'var(--color-terciario)' }}
                  >
                    {ev.local}
                  </span>
                </span>
              </span>
            )
          })}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '13px 14px',
            borderRadius: 11,
            background: 'rgba(255,255,255,.028)',
            border: '1px solid var(--color-borda)',
          }}
        >
          <span
            className="font-sans"
            style={{
              flex: 1,
              fontSize: 11.5,
              lineHeight: 1.45,
              color: podeBaixar ? COR.ouro : 'var(--color-secundario)',
            }}
          >
            {envio.shopify === 'entregue'
              ? 'Pedido marcado como entregue na Shopify.'
              : podeBaixar
                ? 'Entrega confirmada na Yampi · pedido ainda aberto na Shopify.'
                : 'Pedido segue aberto na Shopify até a Yampi registrar a entrega.'}
          </span>
          {podeBaixar && <BotaoOuro onClick={aoBaixar}>Marcar entregue na Shopify</BotaoOuro>}
        </div>
      </section>
    </div>
  )
}
