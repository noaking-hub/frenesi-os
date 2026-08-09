'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

import { Barra, Rotulo, Valor } from '@/components/erp/primitivos'
import { CelulaDupla, Tabela, type Coluna } from '@/components/erp/Tabela'
import { COR, type Tom } from '@/components/erp/tokens'
import { plural, volume } from '@/domain'
import type { CoberturaBase } from '@/domain'

const TOM: Record<CoberturaBase['criticidade'], Tom> = {
  sem_carga: 'neutro',
  zero: 'erro',
  urgente: 'erro',
  atencao: 'atencao',
  parado: 'neutro',
  ok: 'ok',
}

type Filtro = 'todos' | 'com_estoque' | 'critico' | 'esgotado' | 'sem_carga'

const FILTROS: { id: Filtro; rotulo: string; cabe: (c: CoberturaBase) => boolean }[] = [
  { id: 'todos', rotulo: 'Todos', cabe: () => true },
  { id: 'com_estoque', rotulo: 'Com estoque', cabe: (c) => c.base.volumeMl > 0 },
  {
    id: 'critico',
    rotulo: 'Crítico',
    cabe: (c) => c.criticidade === 'urgente' || c.criticidade === 'atencao',
  },
  { id: 'esgotado', rotulo: 'Esgotado', cabe: (c) => c.criticidade === 'zero' },
  { id: 'sem_carga', rotulo: 'Sem carga', cabe: (c) => c.criticidade === 'sem_carga' },
]

type Ordem = 'acaba' | 'nome' | 'volume' | 'consumo'

const ORDENS: { id: Ordem; rotulo: string; compara: (a: CoberturaBase, b: CoberturaBase) => number }[] =
  [
    // O padrão é a urgência: quem acaba antes aparece antes. Base sem carga
    // não tem "acaba em", então vai para o fim em vez de fingir zero dias.
    {
      id: 'acaba',
      rotulo: 'Acaba antes',
      compara: (a, b) => {
        const peso = (c: CoberturaBase) => (c.criticidade === 'sem_carga' ? 1 : 0)
        return peso(a) - peso(b) || a.dias - b.dias
      },
    },
    { id: 'nome', rotulo: 'Nome', compara: (a, b) => a.base.nome.localeCompare(b.base.nome, 'pt-BR') },
    { id: 'volume', rotulo: 'Mais volume', compara: (a, b) => b.base.volumeMl - a.base.volumeMl },
    {
      id: 'consumo',
      rotulo: 'Mais vendido',
      compara: (a, b) => b.base.consumoDiarioMl - a.base.consumoDiarioMl,
    },
  ]

/** Quantas linhas por vez. 412 de uma vez é rolagem sem fim. */
const PAGINA = 50

/**
 * Perfumes base, com busca e filtro.
 *
 * A tela é leitura: quem move estoque é a compra, a produção e o inventário.
 * O que ela precisa fazer bem é achar UM perfume entre centenas — daí a busca
 * primeiro e o filtro logo ao lado.
 */
export function PerfumesBaseCliente({ coberturas }: { coberturas: CoberturaBase[] }) {
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [ordem, setOrdem] = useState<Ordem>('acaba')
  const [mostrar, setMostrar] = useState(PAGINA)

  const termo = busca.trim().toLowerCase()

  const visiveis = useMemo(() => {
    const cabe = FILTROS.find((f) => f.id === filtro)!.cabe
    const compara = ORDENS.find((o) => o.id === ordem)!.compara
    return coberturas
      .filter((c) => cabe(c))
      .filter((c) => !termo || `${c.base.nome} ${c.base.marca}`.toLowerCase().includes(termo))
      .slice()
      .sort(compara)
  }, [coberturas, filtro, ordem, termo])

  const contagem = useMemo(
    () =>
      Object.fromEntries(
        FILTROS.map((f) => [f.id, coberturas.filter((c) => f.cabe(c)).length]),
      ) as Record<Filtro, number>,
    [coberturas],
  )

  const trocar = (aplicar: () => void) => {
    aplicar()
    setMostrar(PAGINA)
  }

  const colunas: Coluna<CoberturaBase>[] = [
    {
      chave: 'perfume',
      titulo: 'Perfume base',
      largura: 'minmax(0,1fr)',
      render: (c) => <CelulaDupla principal={c.base.nome} secundaria={c.base.marca} />,
    },
    {
      chave: 'disponivel',
      titulo: 'Disponível',
      largura: '118px',
      alinhamento: 'right',
      render: (c) => (
        <Valor tamanho={12.5} tom={TOM[c.criticidade]}>
          {volume(c.base.volumeMl)}
        </Valor>
      ),
    },
    {
      chave: 'consumo',
      titulo: 'Consumo 30d',
      largura: '118px',
      alinhamento: 'right',
      // Derivado do consumo diário, não um campo à parte.
      render: (c) => (
        <Valor tamanho={12} peso={400} tom="rgba(242,237,227,.65)">
          {volume(c.base.consumoDiarioMl * 30)}
        </Valor>
      ),
    },
    {
      chave: 'acaba',
      titulo: 'Acaba em',
      largura: '140px',
      render: (c) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end' }}>
          <Valor tamanho={11.5} tom={TOM[c.criticidade]}>
            {c.cobertura}
          </Valor>
          {/* 60 dias é a régua: o que passa disso enche a barra. */}
          {c.criticidade !== 'sem_carga' && (
            <span style={{ width: '100%' }}>
              <Barra pct={Math.min(100, (c.dias / 60) * 100)} tom={TOM[c.criticidade]} />
            </span>
          )}
        </span>
      ),
    },
    {
      chave: 'acao',
      titulo: 'Ação recomendada',
      largura: 'minmax(0,1fr)',
      render: (c) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            className="font-sans"
            style={{
              flex: 1,
              minWidth: 0,
              display: 'block',
              fontSize: 11.5,
              lineHeight: 1.3,
              color: 'var(--color-secundario)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {c.acao}
          </span>
          <Link
            href={c.criticidade === 'sem_carga' ? '/estoque/carga' : c.base.volumeMl === 0 ? '/estoque/lotes' : '/producao'}
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
              flex: 'none',
            }}
          >
            {c.cta}
          </Link>
        </span>
      ),
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <input
          value={busca}
          onChange={(e) => trocar(() => setBusca(e.target.value))}
          placeholder="Buscar perfume ou marca…"
          aria-label="Buscar perfume base"
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

        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {FILTROS.map((f) => {
            const ativo = filtro === f.id
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => trocar(() => setFiltro(f.id))}
                className="hover:border-ouro/40 font-sans"
                style={{
                  height: 36,
                  padding: '0 12px',
                  border: `1px solid ${ativo ? 'rgba(239,209,140,.45)' : 'rgba(255,255,255,.1)'}`,
                  background: ativo ? 'rgba(239,209,140,.09)' : 'transparent',
                  color: ativo ? COR.ouro : 'rgba(242,237,227,.6)',
                  fontWeight: 600,
                  fontSize: 10.5,
                  lineHeight: 1,
                  borderRadius: 8,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {`${f.rotulo} · ${contagem[f.id]}`}
              </button>
            )
          })}
        </span>

        <label style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Rotulo>Ordem</Rotulo>
          <select
            value={ordem}
            onChange={(e) => trocar(() => setOrdem(e.target.value as Ordem))}
            className="font-sans"
            style={{
              height: 36,
              padding: '0 9px',
              border: '1px solid rgba(255,255,255,.11)',
              background: 'rgba(255,255,255,.03)',
              borderRadius: 8,
              color: 'var(--color-corrente)',
              fontSize: 11.5,
              outline: 0,
            }}
          >
            {ORDENS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Tabela
        colunas={colunas}
        itens={visiveis.slice(0, mostrar)}
        chaveDe={(c) => c.base.id}
        bandeiraDe={(c) =>
          c.criticidade === 'zero' || c.criticidade === 'urgente'
            ? 'erro'
            : c.criticidade === 'atencao'
              ? 'atencao'
              : null
        }
        vazio={
          <div style={{ padding: '26px 18px', textAlign: 'center' }}>
            <span className="font-sans" style={{ fontSize: 11.5, color: 'var(--color-terciario)' }}>
              {termo
                ? `Nenhum perfume com “${busca.trim()}” neste filtro.`
                : 'Nenhum perfume neste filtro.'}
            </span>
          </div>
        }
      />

      {visiveis.length > mostrar && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={() => setMostrar((m) => m + PAGINA)}
            className="hover:border-ouro/40 font-sans"
            style={{
              height: 34,
              padding: '0 16px',
              border: '1px solid rgba(255,255,255,.1)',
              background: 'transparent',
              color: 'rgba(242,237,227,.66)',
              fontWeight: 600,
              fontSize: 11,
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            {`Mostrar mais ${Math.min(PAGINA, visiveis.length - mostrar)} · ${plural(visiveis.length - mostrar, 'restante', 'restantes')}`}
          </button>
        </div>
      )}
    </div>
  )
}
