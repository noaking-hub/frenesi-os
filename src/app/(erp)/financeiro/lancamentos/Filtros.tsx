'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'

import { Etiqueta, Ico, TINTA } from '@/components/erp/ui'
import { ROTULO_SITUACAO_LANCAMENTO } from '@/domain'
import type { SituacaoLancamento } from '@/domain'

/**
 * Filtros que vivem na URL.
 *
 * O estado poderia morar num `useState` e a lista seria filtrada no cliente —
 * mas então o alerta "3 obrigações vencidas" do Dashboard não teria como
 * abrir a fila certa, e um filtro aplicado sumiria no F5. A URL é o estado;
 * este componente só a reescreve.
 */

const SITUACOES: SituacaoLancamento[] = [
  'vencido',
  'agendado',
  'parcial',
  'previsto',
  'liquidado',
  'cancelado',
]

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

export function BarraDeFiltros({
  categorias,
  contas,
  centros,
}: {
  categorias: { id: string; nome: string }[]
  contas: { id: string; nome: string }[]
  centros: { id: string; nome: string }[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const [texto, setTexto] = useState(params.get('q') ?? '')

  // Digitar não pode navegar a cada tecla: cada navegação é uma ida ao
  // servidor, e o cursor saltaria. 350 ms é o intervalo entre "parou de
  // digitar" e "quer o resultado".
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

  const ativos = [
    'situacao',
    'tipo',
    'categoria',
    'conta',
    'centro',
    'q',
    'de',
    'ate',
    'recorrente',
    'venc',
  ].filter((k) => params.get(k)).length

  return (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: '15px 16px',
        border: '1px solid rgba(255,255,255,.065)',
        borderRadius: 14,
        background: 'linear-gradient(168deg, #15141608, #0E0E0F)',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))',
          gap: 11,
        }}
      >
        {/* Período pelo DIA DO MOVIMENTO. Antes filtrava por vencimento, e
            como quase nada tem vencimento, escolher qualquer data esvaziava a
            tela — o filtro parecia quebrado e na verdade estava obedecendo.
            de hoje, e o mockup a coloca como primeiro filtro da barra. */}
        <Campo rotulo="Movimento de">
          <input
            type="date"
            value={params.get('de') ?? ''}
            onChange={(e) => trocar('de', e.target.value)}
            className="font-mono"
            style={{ ...CAMPO, colorScheme: 'dark' }}
          />
        </Campo>

        <Campo rotulo="Até">
          <input
            type="date"
            value={params.get('ate') ?? ''}
            onChange={(e) => trocar('ate', e.target.value)}
            className="font-mono"
            style={{ ...CAMPO, colorScheme: 'dark' }}
          />
        </Campo>

        <Campo rotulo="Status">
          <Selecao
            valor={params.get('situacao') ?? ''}
            aoTrocar={(v) => trocar('situacao', v)}
            vazio="Todos"
            opcoes={SITUACOES.map((s) => ({ valor: s, rotulo: ROTULO_SITUACAO_LANCAMENTO[s] }))}
          />
        </Campo>

        <Campo rotulo="Tipo">
          <Selecao
            valor={params.get('tipo') ?? ''}
            aoTrocar={(v) => trocar('tipo', v)}
            vazio="Todos"
            opcoes={[
              { valor: 'entrada', rotulo: 'A receber' },
              { valor: 'saida', rotulo: 'A pagar' },
            ]}
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

        <Campo rotulo="Categoria">
          <Selecao
            valor={params.get('categoria') ?? ''}
            aoTrocar={(v) => trocar('categoria', v)}
            vazio="Todas"
            // "Sem categoria" primeiro na lista: é a fila que precisa de
            // trabalho — quase cem linhas do extrato que a DRE não classifica
            // enquanto ninguém disser o que elas são.
            opcoes={[
              { valor: 'sem', rotulo: 'Sem categoria' },
              ...categorias.map((c) => ({ valor: c.id, rotulo: c.nome })),
            ]}
          />
        </Campo>

        <Campo rotulo="Vencimento">
          <Selecao
            valor={params.get('venc') ?? ''}
            aoTrocar={(v) => trocar('venc', v)}
            vazio="Todos"
            opcoes={[{ valor: 'sem', rotulo: 'Sem data de vencimento' }]}
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

        <Campo rotulo="Recorrente">
          <Selecao
            valor={params.get('recorrente') ?? ''}
            aoTrocar={(v) => trocar('recorrente', v)}
            vazio="Todos"
            opcoes={[
              { valor: 'sim', rotulo: 'Só recorrentes' },
              { valor: 'nao', rotulo: 'Só avulsos' },
            ]}
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
            minWidth: 240,
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
            placeholder="Buscar descrição, favorecido ou documento…"
            aria-label="Buscar lançamento"
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
    </section>
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
      className="font-sans"
      style={{
        ...CAMPO,
        // Filtro aplicado ganha borda dourada: sem isso, quem volta à tela não
        // sabe por que a lista está curta.
        border: valor ? `1px solid ${TINTA.ouro}55` : CAMPO.border,
        color: valor ? TINTA.ouro : CAMPO.color,
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
