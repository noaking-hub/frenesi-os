'use client'

import { useState } from 'react'

import { BotaoSecundario } from '@/components/erp/primitivos'
import { Tabela, type Coluna } from '@/components/erp/Tabela'
import { COR, FUNDO, type Tom } from '@/components/erp/tokens'
import type { ClienteCrm } from '@/data/fixtures'
import { brl, saldoDe } from '@/domain'
import type { SaldoCashback } from '@/domain'

const TOM_STATUS: Record<ClienteCrm['status'], Tom> = {
  VIP: 'ouro',
  Recorrente: 'ok',
  Novo: 'info',
  Inativo: 'neutro',
}

const FILTROS = ['Todos', 'VIP', 'Recorrente', 'Novo', 'Inativo'] as const

export function ClientesCliente({
  clientes,
  saldos,
}: {
  clientes: ClienteCrm[]
  saldos: SaldoCashback[]
}) {
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]>('Todos')

  // O cashback da tabela é o MESMO saldo da tela de Giftback — derivado de
  // gerado − usado, nunca uma coluna própria que pudesse divergir.
  const cashbackDe = (nome: string) => {
    const s = saldos.find((x) => x.cliente === nome)
    return s ? saldoDe(s) : 0
  }

  const termo = busca.trim().toLowerCase()
  const visiveis = clientes.filter((c) => {
    if (filtro !== 'Todos' && c.status !== filtro) return false
    if (!termo) return true
    return [c.nome, c.email, c.telefone, c.cidade].some((v) => v.toLowerCase().includes(termo))
  })

  const colunas: Coluna<ClienteCrm>[] = [
    {
      chave: 'cliente',
      titulo: 'Cliente',
      largura: 'minmax(0,1fr)',
      render: (c) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
          <span
            aria-hidden
            className="font-sans"
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: c.status === 'VIP' ? 'rgba(239,209,140,.18)' : c.status === 'Novo' ? 'rgba(108,140,176,.16)' : 'rgba(255,255,255,.06)',
              color: c.status === 'VIP' ? COR.ouro : c.status === 'Novo' ? COR.info : 'rgba(242,237,227,.6)',
              fontWeight: 700,
              fontSize: 10.5,
              lineHeight: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 'none',
            }}
          >
            {c.iniciais}
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
            <span
              className="font-sans"
              style={{
                fontWeight: 600,
                fontSize: 12.5,
                lineHeight: 1.25,
                color: 'var(--color-corrente)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {c.nome}
            </span>
            <span className="font-sans" style={{ fontSize: 10.5, lineHeight: 1.25, color: 'rgba(242,237,227,.4)' }}>
              {c.cidade}
            </span>
          </span>
        </span>
      ),
    },
    {
      chave: 'contato',
      titulo: 'Contato',
      largura: '176px',
      render: (c) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <span
            className="font-sans"
            style={{
              fontSize: 11,
              lineHeight: 1.3,
              color: 'rgba(242,237,227,.66)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {c.email}
          </span>
          <span className="font-mono" style={{ fontSize: 10.5, lineHeight: 1.3, color: 'rgba(242,237,227,.38)' }}>
            {c.telefone}
          </span>
        </span>
      ),
    },
    {
      chave: 'total',
      titulo: 'Total comprado',
      largura: '116px',
      alinhamento: 'right',
      render: (c) => (
        <span className="font-mono" style={{ fontWeight: 500, fontSize: 12.5, lineHeight: 1, color: 'var(--color-corrente)', whiteSpace: 'nowrap' }}>
          {brl(c.total)}
        </span>
      ),
    },
    {
      chave: 'pedidos',
      titulo: 'Ped.',
      largura: '56px',
      alinhamento: 'right',
      render: (c) => (
        <span className="font-mono" style={{ fontSize: 12, lineHeight: 1, color: 'rgba(242,237,227,.6)' }}>
          {c.pedidos}
        </span>
      ),
    },
    {
      chave: 'ticket',
      titulo: 'Ticket médio',
      largura: '104px',
      alinhamento: 'right',
      // Derivado na hora: total ÷ pedidos.
      render: (c) => (
        <span className="font-mono" style={{ fontSize: 12, lineHeight: 1, color: 'rgba(242,237,227,.7)', whiteSpace: 'nowrap' }}>
          {brl(c.total / c.pedidos)}
        </span>
      ),
    },
    {
      chave: 'ultima',
      titulo: 'Última compra',
      largura: '106px',
      alinhamento: 'right',
      render: (c) => (
        <span className="font-mono" style={{ fontSize: 11, lineHeight: 1, color: 'rgba(242,237,227,.5)' }}>
          {c.ultimaCompra}
        </span>
      ),
    },
    {
      chave: 'cashback',
      titulo: 'Cashback',
      largura: '104px',
      alinhamento: 'right',
      render: (c) => {
        const saldo = cashbackDe(c.nome)
        return (
          <span
            className="font-mono"
            style={{
              fontWeight: 500,
              fontSize: 12,
              lineHeight: 1,
              color: saldo ? COR.ouro : 'rgba(242,237,227,.35)',
              whiteSpace: 'nowrap',
            }}
          >
            {saldo ? brl(saldo) : '—'}
          </span>
        )
      },
    },
    {
      chave: 'status',
      titulo: 'Status',
      largura: '104px',
      render: (c) => (
        <span
          className="font-sans"
          style={{
            fontWeight: 600,
            fontSize: 10,
            lineHeight: 1,
            letterSpacing: '.05em',
            textTransform: 'uppercase',
            color: c.status === 'Inativo' ? 'rgba(242,237,227,.5)' : COR[TOM_STATUS[c.status]],
            background: FUNDO[TOM_STATUS[c.status]],
            borderRadius: 5,
            padding: '5px 8px',
            whiteSpace: 'nowrap',
          }}
        >
          {c.status}
        </span>
      ),
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <label
          className="focus-within:border-ouro/45"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            flex: 1,
            maxWidth: 520,
            height: 38,
            padding: '0 14px',
            border: '1px solid rgba(255,255,255,.09)',
            background: 'rgba(255,255,255,.03)',
            borderRadius: 9,
          }}
        >
          <span
            aria-hidden
            style={{ width: 11, height: 11, border: '1.4px solid rgba(242,237,227,.4)', borderRadius: '50%', flex: 'none' }}
          />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, e-mail, telefone ou cidade"
            className="font-sans"
            style={{ flex: 1, border: 0, outline: 0, background: 'transparent', color: 'var(--color-corrente)', fontSize: 12.5, lineHeight: 1 }}
          />
        </label>
        <div style={{ flex: 1 }} />
        <BotaoSecundario altura={38}>Exportar</BotaoSecundario>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
        {FILTROS.map((f) => {
          const contagem = f === 'Todos' ? clientes.length : clientes.filter((c) => c.status === f).length
          const ativo = filtro === f
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFiltro(f)}
              className="hover:border-ouro/40 font-sans"
              style={{
                height: 31,
                padding: '0 13px',
                border: `1px solid ${ativo ? 'rgba(239,209,140,.45)' : 'rgba(255,255,255,.09)'}`,
                background: ativo ? 'rgba(239,209,140,.09)' : 'transparent',
                color: ativo ? COR.ouro : 'rgba(242,237,227,.6)',
                fontWeight: 600,
                fontSize: 11,
                lineHeight: 1,
                borderRadius: 'var(--radius-pill)',
                cursor: 'pointer',
              }}
            >
              {`${f} · ${contagem}`}
            </button>
          )
        })}
      </div>

      <Tabela
        colunas={colunas}
        itens={visiveis}
        chaveDe={(c) => c.email}
        vazio={
          <div style={{ padding: '28px 18px', textAlign: 'center' }}>
            <span className="font-sans" style={{ fontSize: 11.5, color: 'var(--color-terciario)' }}>
              Nenhum cliente encontrado com esse filtro.
            </span>
          </div>
        }
      />
    </div>
  )
}
