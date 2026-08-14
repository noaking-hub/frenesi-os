'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

import { Valor } from '@/components/erp/primitivos'
import { CelulaDupla, Tabela, type Coluna } from '@/components/erp/Tabela'
import { COR } from '@/components/erp/tokens'
import { plural, volume } from '@/domain'
import type { FilaDeEnvase, ItemDoEnvase, PedidoNaFila, PerfumeNaFila } from '@/data/consultas'

type Visao = 'perfume' | 'pedido'

/** As unidades por variante, do jeito que quem envasa lê: "3× 5 ml". */
function Itens({ itens }: { itens: ItemDoEnvase[] }) {
  if (itens.length === 0) {
    return (
      <span className="font-sans" style={{ fontSize: 10, color: 'rgba(242,237,227,.3)' }}>
        sem itens identificados
      </span>
    )
  }
  return (
    <span style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
      {itens.map((i) => (
        <span
          key={i.variante}
          className="font-mono"
          style={{
            fontSize: 10,
            lineHeight: 1.4,
            color: 'rgba(242,237,227,.7)',
            border: '1px solid rgba(255,255,255,.1)',
            borderRadius: 'var(--radius-pill)',
            padding: '2px 8px',
            whiteSpace: 'nowrap',
          }}
          title={`${i.unidades} × ${i.variante} ml = ${i.ml} ml`}
        >
          {`${i.unidades}× ${i.variante} ml`}
        </span>
      ))}
    </span>
  )
}

/**
 * A mesma fila, de dois ângulos.
 *
 * Por PERFUME é a ordem de quem trabalha: pega o frasco uma vez e enche
 * tudo que sai dele. Por PEDIDO é a conferência de quem separa e despacha.
 * São a mesma reserva somada de jeitos diferentes — nunca dois números.
 */
export function FilaCliente({ fila }: { fila: FilaDeEnvase }) {
  const [visao, setVisao] = useState<Visao>('perfume')
  const [busca, setBusca] = useState('')

  const termo = busca.trim().toLowerCase()

  const perfumes = useMemo(
    () =>
      fila.porPerfume.filter(
        (p) => !termo || `${p.perfume} ${p.marca}`.toLowerCase().includes(termo),
      ),
    [fila.porPerfume, termo],
  )

  const pedidos = useMemo(
    () =>
      fila.porPedido.filter(
        (p) => !termo || `${p.pedidoId} ${p.cliente}`.toLowerCase().includes(termo),
      ),
    [fila.porPedido, termo],
  )

  const colunasPerfume: Coluna<PerfumeNaFila>[] = [
    {
      chave: 'perfume',
      titulo: 'Perfume base',
      largura: 'minmax(0,1.2fr)',
      render: (p) => <CelulaDupla principal={p.perfume} secundaria={p.marca} />,
    },
    {
      chave: 'itens',
      titulo: 'A envasar',
      largura: 'minmax(0,1fr)',
      render: (p) => <Itens itens={p.itens} />,
    },
    {
      chave: 'ml',
      titulo: 'Volume',
      largura: '104px',
      alinhamento: 'right',
      render: (p) => (
        <Valor tamanho={12.5} tom="ouro">
          {volume(p.mlAEnvasar)}
        </Valor>
      ),
    },
    {
      chave: 'frasco',
      titulo: 'No frasco',
      largura: '132px',
      alinhamento: 'right',
      // Contra o FÍSICO, não contra o disponível: o disponível já está
      // comprometido com esta mesma fila, e compará-los daria falta em tudo.
      render: (p) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
          <Valor tamanho={12} peso={400} tom={p.faltaMl > 0 ? 'erro' : 'rgba(242,237,227,.62)'}>
            {volume(p.fisicoMl)}
          </Valor>
          {p.faltaMl > 0 && (
            <span className="font-sans" style={{ fontSize: 9, color: COR.erro, whiteSpace: 'nowrap' }}>
              {`faltam ${volume(p.faltaMl)}`}
            </span>
          )}
        </span>
      ),
    },
    {
      chave: 'pedidos',
      titulo: 'Pedidos',
      largura: '92px',
      alinhamento: 'right',
      render: (p) => (
        <Valor tamanho={12} peso={400} tom="rgba(242,237,227,.6)">
          {p.pedidos}
        </Valor>
      ),
    },
    {
      chave: 'acao',
      titulo: '',
      largura: '110px',
      render: (p) => (
        <Link
          href={`/produtos/${p.baseId}`}
          className="font-sans hover:bg-[rgba(239,209,140,.13)]"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            height: 28,
            padding: '0 11px',
            border: '1px solid rgba(239,209,140,.22)',
            background: 'rgba(239,209,140,.05)',
            color: 'var(--color-ouro)',
            fontWeight: 600,
            fontSize: 10.5,
            borderRadius: 7,
          }}
        >
          Ver perfume
        </Link>
      ),
    },
  ]

  const colunasPedido: Coluna<PedidoNaFila>[] = [
    {
      chave: 'pedido',
      titulo: 'Pedido',
      largura: 'minmax(0,1fr)',
      render: (p) => <CelulaDupla principal={p.pedidoId} secundaria={p.cliente} />,
    },
    {
      chave: 'quando',
      titulo: 'Pago em',
      largura: '116px',
      render: (p) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Valor tamanho={11} peso={400} tom="var(--color-terciario)">
            {p.quando}
          </Valor>
          {p.entregaLocal && (
            <span className="font-sans" style={{ fontSize: 9, color: COR.info }}>
              entrega local
            </span>
          )}
        </span>
      ),
    },
    {
      chave: 'itens',
      titulo: 'Separar',
      largura: 'minmax(0,1.2fr)',
      render: (p) => <Itens itens={p.itens} />,
    },
    {
      chave: 'ml',
      titulo: 'Volume',
      largura: '104px',
      alinhamento: 'right',
      render: (p) => (
        <Valor tamanho={12.5} tom="ouro">
          {volume(p.mlTotal)}
        </Valor>
      ),
    },
    {
      chave: 'bloqueio',
      titulo: 'Situação',
      largura: 'minmax(0,.9fr)',
      render: (p) =>
        p.bloqueios.length === 0 ? (
          <span className="font-sans" style={{ fontSize: 10.5, color: COR.ok }}>
            Pronto para envasar
          </span>
        ) : (
          <span
            className="font-sans"
            style={{
              fontSize: 10.5,
              lineHeight: 1.35,
              color: COR.erro,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={`Sem volume: ${p.bloqueios.join(', ')}`}
          >
            {`Sem volume: ${p.bloqueios.join(', ')}`}
          </span>
        ),
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', gap: 6 }}>
          {(
            [
              ['perfume', `Por perfume · ${fila.perfumes}`],
              ['pedido', `Por pedido · ${fila.pedidos}`],
            ] as const
          ).map(([id, rotulo]) => {
            const ativo = visao === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => setVisao(id)}
                className="hover:border-ouro/40 font-sans"
                style={{
                  height: 36,
                  padding: '0 14px',
                  border: `1px solid ${ativo ? 'rgba(239,209,140,.45)' : 'rgba(255,255,255,.1)'}`,
                  background: ativo ? 'rgba(239,209,140,.09)' : 'transparent',
                  color: ativo ? COR.ouro : 'rgba(242,237,227,.6)',
                  fontWeight: 600,
                  fontSize: 11,
                  borderRadius: 8,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {rotulo}
              </button>
            )
          })}
        </span>

        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder={visao === 'perfume' ? 'Buscar perfume…' : 'Buscar pedido ou cliente…'}
          aria-label="Buscar na fila"
          className="font-sans focus:border-ouro/45"
          style={{
            height: 36,
            flex: 1,
            minWidth: 220,
            padding: '0 12px',
            border: '1px solid rgba(255,255,255,.11)',
            background: 'rgba(255,255,255,.03)',
            borderRadius: 9,
            color: 'var(--color-corrente)',
            fontSize: 12.5,
            outline: 0,
          }}
        />
      </div>

      {visao === 'perfume' ? (
        <Tabela
          colunas={colunasPerfume}
          itens={perfumes}
          chaveDe={(p) => p.baseId}
          bandeiraDe={(p) => (p.faltaMl > 0 ? 'erro' : null)}
          vazio={
            <div style={{ padding: '24px 18px', textAlign: 'center' }}>
              <span className="font-sans" style={{ fontSize: 11.5, color: 'var(--color-terciario)' }}>
                Nenhum perfume com esse nome na fila.
              </span>
            </div>
          }
          rodape={
            <div style={{ padding: '13px 18px', borderTop: '1px solid rgba(255,255,255,.06)' }}>
              <span
                className="font-sans"
                style={{ fontSize: 10.5, lineHeight: 1.4, color: 'var(--color-terciario)' }}
              >
                {`${plural(perfumes.length, 'frasco a manusear', 'frascos a manusear')} · ${volume(perfumes.reduce((a, p) => a + p.mlAEnvasar, 0))} no total`}
              </span>
            </div>
          }
        />
      ) : (
        <Tabela
          colunas={colunasPedido}
          itens={pedidos}
          chaveDe={(p) => p.pedidoId}
          bandeiraDe={(p) => (p.bloqueios.length > 0 ? 'erro' : null)}
          vazio={
            <div style={{ padding: '24px 18px', textAlign: 'center' }}>
              <span className="font-sans" style={{ fontSize: 11.5, color: 'var(--color-terciario)' }}>
                Nenhum pedido com esse termo na fila.
              </span>
            </div>
          }
          rodape={
            <div style={{ padding: '13px 18px', borderTop: '1px solid rgba(255,255,255,.06)' }}>
              <span
                className="font-sans"
                style={{ fontSize: 10.5, lineHeight: 1.4, color: 'var(--color-terciario)' }}
              >
                {/* Ordem da fila é a ordem de chegada: quem pagou primeiro
                    espera menos, e a tela não precisa de campo de prioridade. */}
                {`Do mais antigo para o mais novo · ${plural(pedidos.length, 'pedido', 'pedidos')}`}
              </span>
            </div>
          }
        />
      )}
    </div>
  )
}
