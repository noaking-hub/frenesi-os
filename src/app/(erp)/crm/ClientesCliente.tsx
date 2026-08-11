'use client'

import { useMemo, useState } from 'react'

import { FaixaKpis, type Kpi } from '@/components/erp/Kpi'
import { Badge, BotaoSecundario, Rotulo, TituloSecao, Valor } from '@/components/erp/primitivos'
import { Tabela, type Coluna } from '@/components/erp/Tabela'
import { COR, FUNDO, type Tom } from '@/components/erp/tokens'
import type { PerfilCliente } from '@/data/perfis-clientes'
import { brl, nomeCurtoPerfume, plural } from '@/domain'
import type { StatusCliente } from '@/domain'

const TOM_STATUS: Record<StatusCliente, Tom> = {
  VIP: 'ouro',
  Recorrente: 'ok',
  Novo: 'info',
  'Em risco': 'atencao',
  Inativo: 'neutro',
}

const FILTROS = ['Todos', 'VIP', 'Recorrente', 'Novo', 'Em risco', 'Inativo'] as const
type Filtro = (typeof FILTROS)[number]

const ORDENS = ['Maior total', 'Compra recente', 'Mais pedidos'] as const
type Ordem = (typeof ORDENS)[number]

function dataBr(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
}

/**
 * Baixa a lista VISÍVEL — o operador filtra primeiro, exporta depois.
 * O ; como separador é o que o Excel brasileiro espera.
 */
function exportarCsv(clientes: PerfilCliente[]) {
  const escapa = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  const linhas = [
    [
      'Nome', 'E-mail', 'Telefone', 'Cidade', 'Total comprado', 'Pedidos', 'Ticket médio',
      'Primeira compra', 'Última compra', 'Dias sem comprar', 'Segmento', 'Favorito',
    ],
    ...clientes.map((c) => [
      c.nome,
      c.email,
      c.telefone,
      c.cidade,
      String(c.total.toFixed(2)).replace('.', ','),
      c.pedidos,
      String(c.ticket.toFixed(2)).replace('.', ','),
      dataBr(c.primeiraCompra),
      dataBr(c.ultimaCompra),
      c.diasDesdeUltima ?? '',
      c.status,
      c.favoritos[0]?.nome ?? '',
    ]),
  ]
  const csv = linhas.map((l) => l.map(escapa).join(';')).join('\r\n')
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `clientes-frenesi-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * A tela de clientes que responde as perguntas de quem opera: quem são os
 * melhores, quem está sumindo, o que cada um compra — e um clique para
 * puxar conversa no WhatsApp com esse contexto na mão.
 */
export function ClientesCliente({ perfis }: { perfis: PerfilCliente[] }) {
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('Todos')
  const [ordem, setOrdem] = useState<Ordem>('Maior total')
  const [selecionado, setSelecionado] = useState<string | null>(null)

  const termo = busca.trim().toLowerCase()
  const visiveis = useMemo(
    () =>
      perfis
        .filter((c) => (filtro === 'Todos' ? true : c.status === filtro))
        .filter(
          (c) =>
            !termo ||
            [c.nome, c.email, c.telefone, c.cidade, ...c.favoritos.map((f) => f.nome)].some((v) =>
              v.toLowerCase().includes(termo),
            ),
        )
        .sort((a, b) => {
          if (ordem === 'Compra recente') {
            return (
              (b.ultimaCompra ? new Date(b.ultimaCompra).getTime() : 0) -
              (a.ultimaCompra ? new Date(a.ultimaCompra).getTime() : 0)
            )
          }
          if (ordem === 'Mais pedidos') return b.pedidos - a.pedidos || b.total - a.total
          return b.total - a.total
        }),
    [perfis, filtro, termo, ordem],
  )

  const perfilSel = perfis.find((c) => c.email === selecionado) ?? null

  const totalGeral = perfis.reduce((a, c) => a + c.total, 0)
  const pedidosGeral = perfis.reduce((a, c) => a + c.pedidos, 0)
  const recorrentes = perfis.filter((c) => c.pedidos >= 2).length
  const novos30 = perfis.filter(
    (c) => c.primeiraCompra && Date.now() - new Date(c.primeiraCompra).getTime() <= 30 * 24 * 60 * 60 * 1000,
  ).length
  const reconquistar = perfis.filter((c) => c.status === 'Em risco' || c.status === 'Inativo')
  const vips = perfis.filter((c) => c.status === 'VIP')

  const kpis: Kpi[] = [
    {
      label: 'Clientes com compra',
      valor: String(perfis.length),
      hint: `${plural(pedidosGeral, 'pedido pago', 'pedidos pagos')} · ${brl(totalGeral)}`,
      tom: 'ouro',
    },
    {
      label: 'Novos em 30 dias',
      valor: String(novos30),
      hint: 'Primeira compra no período',
    },
    {
      label: 'Voltaram a comprar',
      valor: perfis.length ? `${Math.round((recorrentes / perfis.length) * 100)}%` : '—',
      hint: `${plural(recorrentes, 'cliente recorrente', 'clientes recorrentes')}`,
      tom: 'ok',
    },
    {
      label: 'Ticket médio',
      valor: pedidosGeral ? brl(totalGeral / pedidosGeral) : '—',
      hint: 'Por pedido pago',
    },
    {
      label: 'Para reconquistar',
      valor: String(reconquistar.length),
      hint: reconquistar.length
        ? `${brl(reconquistar.reduce((a, c) => a + c.total, 0))} já comprados por eles`
        : 'Ninguém sumido — base quente',
      tom: reconquistar.length ? 'atencao' : 'ok',
    },
  ]

  const colunas: Coluna<PerfilCliente>[] = [
    {
      chave: 'cliente',
      titulo: 'Cliente',
      largura: 'minmax(150px,1fr)',
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
            <span
              className="font-sans"
              style={{
                fontSize: 10.5,
                lineHeight: 1.25,
                color: 'rgba(242,237,227,.4)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {c.cidade}
            </span>
          </span>
        </span>
      ),
    },
    {
      chave: 'favorito',
      titulo: 'Mais comprado',
      largura: 'minmax(120px,1fr)',
      render: (c) => {
        if (!c.favoritos[0]) {
          return (
            <span className="font-sans" style={{ fontSize: 10, color: 'rgba(242,237,227,.3)' }}>
              sem itens no histórico
            </span>
          )
        }
        // O que oferecer na próxima conversa: o favorito e o que mais a
        // pessoa já levou — nomes curtos, do jeito que se fala.
        const outros = c.favoritos.slice(1).map((f) => nomeCurtoPerfume(f.nome))
        return (
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
            <span
              className="font-sans"
              style={{
                fontSize: 11.5,
                lineHeight: 1.3,
                color: 'rgba(242,237,227,.75)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {nomeCurtoPerfume(c.favoritos[0].nome)}
              {c.favoritos[0].vezes > 1 && (
                <span className="font-mono" style={{ fontSize: 9.5, color: 'rgba(239,209,140,.55)' }}>
                  {`  ${c.favoritos[0].vezes}×`}
                </span>
              )}
            </span>
            {outros.length > 0 && (
              <span
                className="font-sans"
                style={{
                  fontSize: 10,
                  lineHeight: 1.25,
                  color: 'rgba(242,237,227,.38)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {`também: ${outros.join(' · ')}`}
              </span>
            )}
          </span>
        )
      },
    },
    {
      chave: 'total',
      titulo: 'Total',
      largura: '100px',
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
      largura: '52px',
      alinhamento: 'right',
      render: (c) => (
        <span className="font-mono" style={{ fontSize: 12, lineHeight: 1, color: 'rgba(242,237,227,.6)' }}>
          {c.pedidos}
        </span>
      ),
    },
    {
      chave: 'ticket',
      titulo: 'Ticket',
      largura: '92px',
      alinhamento: 'right',
      render: (c) => (
        <span className="font-mono" style={{ fontSize: 12, lineHeight: 1, color: 'rgba(242,237,227,.7)', whiteSpace: 'nowrap' }}>
          {brl(c.ticket)}
        </span>
      ),
    },
    {
      chave: 'ultima',
      titulo: 'Última compra',
      largura: '108px',
      alinhamento: 'right',
      render: (c) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
          <span className="font-mono" style={{ fontSize: 11, lineHeight: 1, color: 'rgba(242,237,227,.6)' }}>
            {dataBr(c.ultimaCompra)}
          </span>
          {c.diasDesdeUltima !== null && (
            <span
              className="font-sans"
              style={{
                fontSize: 9.5,
                lineHeight: 1.25,
                color: c.diasDesdeUltima > 45 ? COR.atencao : 'rgba(242,237,227,.35)',
                whiteSpace: 'nowrap',
              }}
            >
              {c.diasDesdeUltima === 0 ? 'hoje' : `há ${plural(c.diasDesdeUltima, 'dia', 'dias')}`}
            </span>
          )}
        </span>
      ),
    },
    {
      chave: 'status',
      titulo: 'Segmento',
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

  const chip = (ativo: boolean): React.CSSProperties => ({
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
    whiteSpace: 'nowrap',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FaixaKpis kpis={kpis} />

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
            placeholder="Buscar por nome, e-mail, telefone, cidade ou perfume comprado"
            className="font-sans"
            style={{ flex: 1, border: 0, outline: 0, background: 'transparent', color: 'var(--color-corrente)', fontSize: 12.5, lineHeight: 1 }}
          />
        </label>
        <div style={{ flex: 1 }} />
        <BotaoSecundario altura={38} onClick={() => exportarCsv(visiveis)}>
          Exportar CSV
        </BotaoSecundario>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
        {FILTROS.map((f) => {
          const contagem = f === 'Todos' ? perfis.length : perfis.filter((c) => c.status === f).length
          return (
            <button key={f} type="button" onClick={() => setFiltro(f)} className="hover:border-ouro/40 font-sans" style={chip(filtro === f)}>
              {`${f} · ${contagem}`}
            </button>
          )
        })}
        <div style={{ flex: 1 }} />
        {ORDENS.map((o) => (
          <button key={o} type="button" onClick={() => setOrdem(o)} className="hover:border-ouro/40 font-sans" style={chip(ordem === o)}>
            {o}
          </button>
        ))}
      </div>

      <div
        className="empilha-1180"
        style={{
          display: 'grid',
          gridTemplateColumns: perfilSel ? 'minmax(0,1fr) 332px' : 'minmax(0,1fr)',
          gap: 16,
          alignItems: 'start',
        }}
      >
        <Tabela
          colunas={colunas}
          itens={visiveis}
          chaveDe={(c) => c.email}
          aoClicar={(c) => setSelecionado((atual) => (atual === c.email ? null : c.email))}
          selecionadoDe={(c) => c.email === selecionado}
          bandeiraDe={(c) => (c.status === 'Em risco' ? 'atencao' : null)}
          vazio={
            <div style={{ padding: '28px 18px', textAlign: 'center' }}>
              <span className="font-sans" style={{ fontSize: 11.5, color: 'var(--color-terciario)' }}>
                Nenhum cliente nesse recorte — troque o filtro ou limpe a busca.
              </span>
            </div>
          }
          rodape={
            <div style={{ padding: '12px 18px', borderTop: '1px solid rgba(255,255,255,.06)' }}>
              <span className="font-sans" style={{ fontSize: 10.5, color: 'var(--color-terciario)' }}>
                {`${visiveis.length} de ${plural(perfis.length, 'cliente', 'clientes')} · clique num cliente para abrir o perfil`}
              </span>
            </div>
          }
        />

        {perfilSel && <PainelCliente perfil={perfilSel} aoFechar={() => setSelecionado(null)} />}
      </div>
    </div>
  )
}

/** Perfil de um cliente: números, favoritos, histórico e o botão de conversa. */
function PainelCliente({ perfil, aoFechar }: { perfil: PerfilCliente; aoFechar: () => void }) {
  const [copiado, setCopiado] = useState(false)
  const primeiroNome = perfil.nome.trim().split(/\s+/)[0] ?? ''

  const linhas = [
    { label: 'Total comprado', valor: brl(perfil.total), tom: COR.ouro },
    { label: 'Pedidos pagos', valor: String(perfil.pedidos), tom: 'var(--color-corrente)' },
    { label: 'Ticket médio', valor: brl(perfil.ticket), tom: 'var(--color-corrente)' },
    { label: 'Cliente desde', valor: dataBr(perfil.primeiraCompra), tom: 'var(--color-corrente)' },
    {
      label: 'Última compra',
      valor:
        perfil.diasDesdeUltima === null
          ? dataBr(perfil.ultimaCompra)
          : `${dataBr(perfil.ultimaCompra)} · há ${plural(perfil.diasDesdeUltima, 'dia', 'dias')}`,
      tom: perfil.diasDesdeUltima !== null && perfil.diasDesdeUltima > 45 ? COR.atencao : 'var(--color-corrente)',
    },
  ]

  const copiarEmail = async () => {
    try {
      await navigator.clipboard.writeText(perfil.email)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1800)
    } catch {
      /* clipboard bloqueado: o e-mail continua visível para copiar à mão */
    }
  }

  return (
    <section
      className="card-ouro"
      style={{ borderRadius: 16, padding: '18px 19px', display: 'flex', flexDirection: 'column', gap: 14 }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <span
          aria-hidden
          className="font-sans"
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: 'rgba(239,209,140,.16)',
            color: COR.ouro,
            fontWeight: 700,
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 'none',
          }}
        >
          {perfil.iniciais}
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minWidth: 0 }}>
          <TituloSecao tamanho={14.5}>{perfil.nome}</TituloSecao>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            <Badge tom={TOM_STATUS[perfil.status]}>{perfil.status}</Badge>
            <span className="font-sans" style={{ fontSize: 10.5, color: 'var(--color-terciario)' }}>
              {perfil.cidade}
            </span>
          </span>
        </span>
        <button
          type="button"
          onClick={aoFechar}
          aria-label="Fechar perfil"
          className="font-sans hover:brightness-150"
          style={{ border: 0, background: 'transparent', color: 'rgba(242,237,227,.4)', fontSize: 14, cursor: 'pointer', padding: 2 }}
        >
          ×
        </button>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          background: 'rgba(255,255,255,.05)',
          borderRadius: 10,
          overflow: 'hidden',
        }}
      >
        {linhas.map((r) => (
          <span
            key={r.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              padding: '10px 13px',
              background: 'var(--color-painel)',
            }}
          >
            <span className="font-sans" style={{ fontSize: 11, lineHeight: 1.35, color: 'var(--color-secundario)' }}>
              {r.label}
            </span>
            <Valor tamanho={12} tom={r.tom}>
              {r.valor}
            </Valor>
          </span>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        {perfil.whatsapp && (
          <a
            href={`https://wa.me/${perfil.whatsapp}?text=${encodeURIComponent(`Oi ${primeiroNome}, tudo bem? Aqui é da FRENESI 🖤`)}`}
            target="_blank"
            rel="noreferrer"
            className="font-sans hover:brightness-110"
            style={{
              flex: 1,
              height: 34,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(126,166,131,.45)',
              background: 'rgba(126,166,131,.12)',
              color: COR.ok,
              fontWeight: 700,
              fontSize: 11,
              borderRadius: 8,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            Chamar no WhatsApp
          </a>
        )}
        <button
          type="button"
          onClick={copiarEmail}
          className="font-sans hover:border-ouro/40"
          style={{
            flex: 1,
            height: 34,
            border: '1px solid rgba(255,255,255,.14)',
            background: 'rgba(255,255,255,.04)',
            color: copiado ? COR.ok : 'var(--color-corrente)',
            fontWeight: 600,
            fontSize: 11,
            borderRadius: 8,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {copiado ? 'E-mail copiado ✓' : 'Copiar e-mail'}
        </button>
      </div>

      <span className="font-mono" style={{ fontSize: 10, lineHeight: 1.5, color: 'rgba(242,237,227,.4)', wordBreak: 'break-all' }}>
        {perfil.email}
        {perfil.telefone ? ` · ${perfil.telefone}` : ''}
      </span>

      {perfil.favoritos.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <Rotulo>O que mais compra</Rotulo>
          {perfil.favoritos.map((f) => (
            <span key={f.nome} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
              <span
                className="font-sans"
                style={{ fontSize: 11, lineHeight: 1.4, color: 'var(--color-secundario)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {f.nome}
              </span>
              <Valor tamanho={11} tom="ouro">{`${f.vezes}×`}</Valor>
            </span>
          ))}
        </div>
      )}

      {perfil.compras.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Rotulo>{`Histórico · ${plural(perfil.compras.length, 'pedido', 'pedidos')}`}</Rotulo>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, maxHeight: 250, overflowY: 'auto', paddingRight: 4 }}>
            {perfil.compras.map((compra) => (
              <span
                key={compra.pedidoId}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  padding: '9px 11px',
                  borderRadius: 9,
                  background: 'rgba(255,255,255,.028)',
                  border: '1px solid rgba(255,255,255,.06)',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                  <span className="font-mono" style={{ fontSize: 10, color: 'rgba(242,237,227,.45)' }}>
                    {`${dataBr(compra.quando)} · ${compra.pedidoId}`}
                  </span>
                  <Valor tamanho={11.5}>{brl(compra.valor)}</Valor>
                </span>
                {compra.itens.length > 0 && (
                  <span className="font-sans" style={{ fontSize: 10.5, lineHeight: 1.45, color: 'rgba(242,237,227,.55)', textWrap: 'pretty' }}>
                    {compra.itens.join(' · ')}
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
