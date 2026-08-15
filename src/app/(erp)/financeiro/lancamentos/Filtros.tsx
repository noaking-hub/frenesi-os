'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'

import { Rotulo } from '@/components/erp/primitivos'
import { COR } from '@/components/erp/tokens'
import { ROTULO_SITUACAO_LANCAMENTO } from '@/domain'
import type { SituacaoLancamento } from '@/domain'

/**
 * Filtros que vivem na URL.
 *
 * O estado poderia morar num `useState` e a lista seria filtrada no cliente —
 * mas então o alerta "3 obrigações vencidas" da Visão Financeira não teria
 * como abrir a fila certa, e um filtro aplicado sumiria no F5. A URL é o
 * estado; o componente só a reescreve.
 */

const SITUACOES: SituacaoLancamento[] = [
  'vencido',
  'agendado',
  'parcial',
  'previsto',
  'liquidado',
  'cancelado',
]

const CAMPO = {
  height: 32,
  padding: '0 10px',
  border: '1px solid rgba(255,255,255,.11)',
  background: 'rgba(255,255,255,.03)',
  borderRadius: 8,
  color: 'var(--color-corrente)',
  fontSize: 11.5,
  lineHeight: 1,
  outline: 0,
  maxWidth: '100%',
} as const

export function BarraDeFiltros({
  categorias,
  contas,
  centros,
  acao,
}: {
  categorias: { id: string; nome: string }[]
  contas: { id: string; nome: string }[]
  centros: { id: string; nome: string }[]
  acao?: ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const [texto, setTexto] = useState(params.get('q') ?? '')

  // Digitar não pode navegar a cada tecla: cada navegação é um round-trip ao
  // servidor, e o cursor saltaria. 350 ms é o tempo entre "parou de digitar"
  // e "quer o resultado".
  useEffect(() => {
    const atual = params.get('q') ?? ''
    if (texto === atual) return
    const t = setTimeout(() => trocar('q', texto), 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto])

  function trocar(chave: string, valor: string) {
    const novo = new URLSearchParams(params.toString())
    if (valor) novo.set(chave, valor)
    else novo.delete(chave)
    const qs = novo.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  const ativos = ['situacao', 'tipo', 'categoria', 'conta', 'centro', 'q'].filter((k) =>
    params.get(k),
  ).length

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 10,
        flexWrap: 'wrap',
        padding: '13px 15px',
        border: '1px solid var(--color-borda-sutil)',
        borderRadius: 'var(--radius-card)',
        background: 'var(--color-superficie)',
      }}
    >
      <Campo rotulo="Buscar">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Descrição, favorecido ou documento"
          style={{ ...CAMPO, width: 240 }}
        />
      </Campo>

      <Campo rotulo="Situação">
        <Selecao
          valor={params.get('situacao') ?? ''}
          aoTrocar={(v) => trocar('situacao', v)}
          vazio="Todas"
          opcoes={SITUACOES.map((s) => ({ valor: s, rotulo: ROTULO_SITUACAO_LANCAMENTO[s] }))}
        />
      </Campo>

      <Campo rotulo="Tipo">
        <Selecao
          valor={params.get('tipo') ?? ''}
          aoTrocar={(v) => trocar('tipo', v)}
          vazio="Entradas e saídas"
          opcoes={[
            { valor: 'entrada', rotulo: 'A receber' },
            { valor: 'saida', rotulo: 'A pagar' },
          ]}
        />
      </Campo>

      <Campo rotulo="Categoria">
        <Selecao
          valor={params.get('categoria') ?? ''}
          aoTrocar={(v) => trocar('categoria', v)}
          vazio="Todas"
          opcoes={categorias.map((c) => ({ valor: c.id, rotulo: c.nome }))}
        />
      </Campo>

      <Campo rotulo="Conta">
        <Selecao
          valor={params.get('conta') ?? ''}
          aoTrocar={(v) => trocar('conta', v)}
          vazio="Todas"
          opcoes={contas.map((c) => ({ valor: c.id, rotulo: c.nome }))}
        />
      </Campo>

      {centros.length > 0 && (
        <Campo rotulo="Centro de custo">
          <Selecao
            valor={params.get('centro') ?? ''}
            aoTrocar={(v) => trocar('centro', v)}
            vazio="Todos"
            opcoes={centros.map((c) => ({ valor: c.id, rotulo: c.nome }))}
          />
        </Campo>
      )}

      {ativos > 0 && (
        <button
          type="button"
          onClick={() => {
            setTexto('')
            router.replace(pathname, { scroll: false })
          }}
          className="font-sans hover:text-ouro"
          style={{
            height: 32,
            padding: '0 10px',
            border: 0,
            background: 'transparent',
            color: COR.ouro,
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {`Limpar ${ativos} filtro${ativos > 1 ? 's' : ''}`}
        </button>
      )}

      <div style={{ flex: 1 }} />
      {acao}
    </div>
  )
}

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <Rotulo>{rotulo}</Rotulo>
      {children}
    </label>
  )
}

function Selecao({
  valor,
  aoTrocar,
  opcoes,
  vazio,
}: {
  valor: string
  aoTrocar: (v: string) => void
  opcoes: { valor: string; rotulo: string }[]
  vazio: string
}) {
  return (
    <select
      value={valor}
      onChange={(e) => aoTrocar(e.target.value)}
      style={{
        ...CAMPO,
        width: 168,
        border: valor ? '1px solid rgba(239,209,140,.4)' : CAMPO.border,
      }}
    >
      <option value="">{vazio}</option>
      {opcoes.map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.rotulo}
        </option>
      ))}
    </select>
  )
}
