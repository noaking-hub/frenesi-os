'use client'

import { useMemo, useState } from 'react'

import { Badge, TituloSecao } from '@/components/erp/primitivos'
import { Tabela, type Coluna } from '@/components/erp/Tabela'
import { COR, type Tom } from '@/components/erp/tokens'
import type { CupomYampi } from '@/data/yampi-crm'
import { plural } from '@/domain'

import { AcoesCupom, LoteCupons } from './GerirCupons'
import { NovoCupom } from './NovoCupom'

export type Situacao = 'Ativo' | 'Expirado' | 'Esgotado' | 'Pausado' | 'Agendado'
export type CupomComSituacao = CupomYampi & { situacao: Situacao }

const TOM_SITUACAO: Record<Situacao, Tom> = {
  Ativo: 'ok',
  Expirado: 'neutro',
  Esgotado: 'atencao',
  Pausado: 'neutro',
  Agendado: 'info',
}

const FILTROS = ['Todos', 'Ativos', 'Esgotados', 'Expirados', 'Pausados'] as const
type Filtro = (typeof FILTROS)[number]

const ALVO_DO_FILTRO: Record<Filtro, Situacao | null> = {
  Todos: null,
  Ativos: 'Ativo',
  Esgotados: 'Esgotado',
  Expirados: 'Expirado',
  Pausados: 'Pausado',
}

const ORDENS = ['Mais usados', 'Vigência', 'Código A→Z'] as const
type Ordem = (typeof ORDENS)[number]

function dataBr(iso: string | null): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
}

/**
 * A lista de cupons com busca, filtro por situação e ordenação.
 *
 * Cliente porque filtrar 200 códigos precisa responder na tecla, não numa
 * viagem ao servidor — a leitura da Yampi já aconteceu na página.
 */
export function ListaCupons({ cupons }: { cupons: CupomComSituacao[] }) {
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('Todos')
  const [ordem, setOrdem] = useState<Ordem>('Mais usados')

  const termo = busca.trim().toLowerCase()
  const visiveis = useMemo(() => {
    const alvo = ALVO_DO_FILTRO[filtro]
    return cupons
      .filter((c) => (alvo ? c.situacao === alvo : true))
      .filter(
        (c) =>
          !termo ||
          [c.codigo, c.descricao ?? '', c.regra].some((v) => v.toLowerCase().includes(termo)),
      )
      .sort((a, b) => {
        if (ordem === 'Código A→Z') return a.codigo.localeCompare(b.codigo, 'pt-BR')
        if (ordem === 'Vigência') {
          // Sem prazo vai para o fim: quem expira antes precisa aparecer antes.
          const fa = a.expiraEm ? new Date(a.expiraEm).getTime() : Infinity
          const fb = b.expiraEm ? new Date(b.expiraEm).getTime() : Infinity
          return fa - fb
        }
        return b.usos - a.usos
      })
  }, [cupons, filtro, termo, ordem])

  const colunas: Coluna<CupomComSituacao>[] = [
    {
      chave: 'cupom',
      titulo: 'Cupom',
      largura: '170px',
      render: (c) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <span className="font-mono" style={{ fontWeight: 500, fontSize: 12, lineHeight: 1.25, color: 'var(--color-ouro)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {c.codigo}
          </span>
          {c.descricao && (
            <span className="font-sans" style={{ fontSize: 10, lineHeight: 1.3, color: 'rgba(242,237,227,.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {c.descricao}
            </span>
          )}
        </span>
      ),
    },
    {
      chave: 'regra',
      titulo: 'Regra',
      largura: 'minmax(0,1fr)',
      render: (c) => (
        <span className="font-sans" style={{ fontWeight: 500, fontSize: 12, lineHeight: 1.3, color: 'var(--color-corrente)' }}>
          {c.regra}
        </span>
      ),
    },
    {
      chave: 'usos',
      titulo: 'Usos',
      largura: '132px',
      alinhamento: 'right',
      render: (c) => {
        const pctUsos = c.limite ? Math.min(100, Math.round((c.usos / c.limite) * 100)) : null
        return (
          <span style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span className="font-mono" style={{ fontSize: 11, lineHeight: 1.25, color: 'rgba(242,237,227,.7)', whiteSpace: 'nowrap' }}>
              {c.limite ? `${c.usos} / ${c.limite}` : plural(c.usos, 'uso', 'usos')}
            </span>
            {pctUsos !== null && (
              <span style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,.06)', overflow: 'hidden', display: 'block' }}>
                <span
                  style={{
                    display: 'block',
                    height: '100%',
                    width: `${pctUsos}%`,
                    background: pctUsos > 80 ? COR.atencao : 'rgba(239,209,140,.55)',
                    borderRadius: 2,
                  }}
                />
              </span>
            )}
          </span>
        )
      },
    },
    {
      chave: 'vigencia',
      titulo: 'Vigência',
      largura: '150px',
      render: (c) => {
        const inicio = dataBr(c.comecaEm)
        const fim = dataBr(c.expiraEm)
        return (
          <span className="font-mono" style={{ fontSize: 11.5, lineHeight: 1, color: 'var(--color-corrente)', whiteSpace: 'nowrap' }}>
            {inicio && fim ? `${inicio} → ${fim}` : fim ? `até ${fim}` : inicio ? `desde ${inicio}` : 'Sem prazo'}
          </span>
        )
      },
    },
    {
      chave: 'situacao',
      titulo: 'Situação',
      largura: '96px',
      render: (c) => <Badge tom={TOM_SITUACAO[c.situacao]}>{c.situacao}</Badge>,
    },
    {
      chave: 'acoes',
      titulo: 'Ações',
      largura: '108px',
      render: (c) => <AcoesCupom cupom={c} />,
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
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <TituloSecao tamanho={16}>Cupons do checkout</TituloSecao>
        <span className="font-sans" style={{ fontSize: 10.5, lineHeight: 1.4, color: 'var(--color-terciario)' }}>
          Lidos ao vivo da Yampi — o que está aqui é o que o checkout aceita agora
        </span>
        <div style={{ flex: 1 }} />
        <LoteCupons />
        <NovoCupom />
      </div>

      <label
        className="focus-within:border-ouro/45"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          maxWidth: 480,
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
          placeholder="Buscar por código, descrição ou regra"
          className="font-sans"
          style={{ flex: 1, border: 0, outline: 0, background: 'transparent', color: 'var(--color-corrente)', fontSize: 12.5, lineHeight: 1 }}
        />
      </label>

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
        {FILTROS.map((f) => {
          const alvo = ALVO_DO_FILTRO[f]
          const contagem = alvo ? cupons.filter((c) => c.situacao === alvo).length : cupons.length
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFiltro(f)}
              className="hover:border-ouro/40 font-sans"
              style={chip(filtro === f)}
            >
              {`${f} · ${contagem}`}
            </button>
          )
        })}
        <div style={{ flex: 1 }} />
        {ORDENS.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => setOrdem(o)}
            className="hover:border-ouro/40 font-sans"
            style={chip(ordem === o)}
          >
            {o}
          </button>
        ))}
      </div>

      <Tabela
        colunas={colunas}
        itens={visiveis}
        chaveDe={(c) => c.codigo}
        bandeiraDe={(c) => (c.situacao === 'Esgotado' ? 'atencao' : null)}
        vazio={
          <div style={{ padding: '28px 18px', textAlign: 'center' }}>
            <span className="font-sans" style={{ fontSize: 11.5, color: 'var(--color-terciario)' }}>
              Nenhum cupom nesse recorte — troque o filtro ou limpe a busca.
            </span>
          </div>
        }
      />

      <span className="font-sans" style={{ fontSize: 10.5, color: 'var(--color-terciario)' }}>
        {`${visiveis.length} de ${plural(cupons.length, 'cupom', 'cupons')} · filtro ${filtro} · ordenado por ${ordem.toLowerCase()}`}
      </span>
    </div>
  )
}
