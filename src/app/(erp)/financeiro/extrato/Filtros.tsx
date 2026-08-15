'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'

import { Etiqueta, Ico, TINTA } from '@/components/erp/ui'

/**
 * Filtros da fila de tratamento, guardados na URL.
 *
 * Na URL e não em estado de cliente porque toda classificação revalida a
 * árvore: um filtro em `useState` sumiria a cada linha tratada, e o link com
 * a fila aberta não poderia ser mandado para outra pessoa.
 */

const CAMPO: React.CSSProperties = {
  height: 34,
  width: '100%',
  padding: '0 11px',
  border: '1px solid rgba(255,255,255,.08)',
  background: 'rgba(255,255,255,.025)',
  borderRadius: 9,
  color: 'rgba(242,237,227,.88)',
  fontSize: 12,
  lineHeight: 1,
  outline: 0,
}

export function FiltrosExtrato({ contas }: { contas: { id: string; nome: string }[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const [texto, setTexto] = useState(params.get('busca') ?? '')

  // Digitar não pode navegar a cada tecla: cada navegação é uma ida ao
  // servidor, e o cursor saltaria. 350 ms é o intervalo entre "parou de
  // digitar" e "quer o resultado".
  useEffect(() => {
    const atual = params.get('busca') ?? ''
    if (texto === atual) return
    const t = setTimeout(() => trocar('busca', texto), 350)
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

  const ativos = ['situacao', 'conta', 'de', 'ate', 'tipo', 'busca'].filter((k) =>
    params.get(k),
  ).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 11,
        }}
      >
        <Campo rotulo="Mostrar">
          <Selecao
            valor={params.get('situacao') ?? ''}
            aoTrocar={(v) => trocar('situacao', v)}
            opcoes={[
              { valor: '', rotulo: 'Precisam de você' },
              { valor: 'todas', rotulo: 'Todas as linhas' },
            ]}
            // "Precisam de você" é o padrão da tela, não um filtro aplicado:
            // pintá-lo de ouro diria que a lista está recortada quando ela
            // está no recorte natural.
            neutraQuandoVazio
          />
        </Campo>

        <Campo rotulo="Conta">
          <Selecao
            valor={params.get('conta') ?? ''}
            aoTrocar={(v) => trocar('conta', v)}
            opcoes={[
              { valor: '', rotulo: 'Todas as contas' },
              ...contas.map((c) => ({ valor: c.id, rotulo: c.nome })),
            ]}
            neutraQuandoVazio
          />
        </Campo>

        <Campo rotulo="De">
          <input
            type="date"
            value={params.get('de') ?? ''}
            onChange={(e) => trocar('de', e.target.value)}
            aria-label="Início do período"
            className="font-sans"
            style={{ ...CAMPO, colorScheme: 'dark' }}
          />
        </Campo>

        <Campo rotulo="Até">
          <input
            type="date"
            value={params.get('ate') ?? ''}
            onChange={(e) => trocar('ate', e.target.value)}
            aria-label="Fim do período"
            className="font-sans"
            style={{ ...CAMPO, colorScheme: 'dark' }}
          />
        </Campo>

        <Campo rotulo="Direção">
          <Selecao
            valor={params.get('tipo') ?? ''}
            aoTrocar={(v) => trocar('tipo', v)}
            opcoes={[
              { valor: '', rotulo: 'Todas' },
              { valor: 'entrada', rotulo: 'Entradas' },
              { valor: 'saida', rotulo: 'Saídas' },
            ]}
            neutraQuandoVazio
          />
        </Campo>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 11, flexWrap: 'wrap' }}>
        <label
          className="focus-within:border-ouro/40"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            flex: 1,
            minWidth: 220,
            height: 34,
            padding: '0 11px',
            border: '1px solid rgba(255,255,255,.08)',
            background: 'rgba(255,255,255,.025)',
            borderRadius: 9,
          }}
        >
          <span style={{ color: 'rgba(242,237,227,.34)' }}>
            <Ico n="busca" tamanho={14} />
          </span>
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar descrição, contraparte, documento ou pedido…"
            aria-label="Buscar movimento"
            className="font-sans"
            style={{
              flex: 1,
              border: 0,
              outline: 0,
              background: 'transparent',
              color: 'rgba(242,237,227,.88)',
              fontSize: 12,
            }}
          />
        </label>

        {ativos > 0 && (
          <button
            type="button"
            onClick={() => {
              setTexto('')
              router.replace(pathname, { scroll: false })
            }}
            className="font-sans hover:brightness-125"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              height: 34,
              padding: '0 12px',
              border: `1px solid ${TINTA.ouro}44`,
              background: 'rgba(233,197,131,.08)',
              borderRadius: 9,
              color: TINTA.ouro,
              fontSize: 11.5,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <Ico n="x" tamanho={13} />
            {`Limpar ${ativos} ${ativos > 1 ? 'filtros' : 'filtro'}`}
          </button>
        )}
      </div>
    </div>
  )
}

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0 }}>
      <Etiqueta>{rotulo}</Etiqueta>
      {children}
    </label>
  )
}

function Selecao({
  valor,
  aoTrocar,
  opcoes,
  neutraQuandoVazio,
}: {
  valor: string
  aoTrocar: (v: string) => void
  opcoes: { valor: string; rotulo: string }[]
  neutraQuandoVazio?: boolean
}) {
  const aplicado = Boolean(valor) || !neutraQuandoVazio
  return (
    <select
      value={valor}
      onChange={(e) => aoTrocar(e.target.value)}
      className="font-sans"
      style={{
        ...CAMPO,
        // Filtro aplicado ganha borda dourada: sem isso, quem volta à tela
        // não sabe por que a lista está curta.
        border: valor ? `1px solid ${TINTA.ouro}55` : CAMPO.border,
        color: valor && aplicado ? TINTA.ouro : CAMPO.color,
      }}
    >
      {opcoes.map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.rotulo}
        </option>
      ))}
    </select>
  )
}
