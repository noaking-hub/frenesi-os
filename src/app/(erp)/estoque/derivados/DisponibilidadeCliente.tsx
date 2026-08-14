'use client'

import { useMemo, useState } from 'react'

import { Rotulo, Valor } from '@/components/erp/primitivos'
import { CelulaDupla, Tabela, type Coluna } from '@/components/erp/Tabela'
import { COR, type Tom } from '@/components/erp/tokens'
import { VARIANTES, brl, frascoDe, plural, volume } from '@/domain'
import type { LinhaDerivado } from '@/domain'

const TOM: Record<LinhaDerivado['estado'], Tom> = {
  'Tudo reservado': 'atencao',
  'Sem volume': 'erro',
  'Últimas unidades': 'atencao',
  'Sob demanda': 'info',
  Disponível: 'ok',
  'Sem carga': 'neutro',
}

type Filtro = 'todos' | 'vendavel' | 'ultimas' | 'sem_volume' | 'pronto' | 'sem_carga'

const FILTROS: { id: Filtro; rotulo: string; cabe: (d: LinhaDerivado) => boolean }[] = [
  { id: 'todos', rotulo: 'Todas', cabe: () => true },
  { id: 'vendavel', rotulo: 'Vendável', cabe: (d) => d.vendaveis > 0 },
  { id: 'ultimas', rotulo: 'Últimas unidades', cabe: (d) => d.estado === 'Últimas unidades' },
  { id: 'sem_volume', rotulo: 'Sem volume', cabe: (d) => d.estado === 'Sem volume' },
  { id: 'pronto', rotulo: 'Com estoque pronto', cabe: (d) => d.disponiveis > 0 },
  { id: 'sem_carga', rotulo: 'Fora do controle', cabe: (d) => d.estado === 'Sem carga' },
]

const PAGINA = 60

/**
 * Disponibilidade por variante.
 *
 * A Frenesi envasa sob demanda: o normal aqui é ZERO unidade pronta e
 * capacidade vinda do volume da base. A tela mostra as duas colunas separadas
 * porque elas são coisas diferentes — pronto é físico, capacidade é potencial
 * — e porque somá-las entre variantes seria mentira: os 100 ml que dão 20
 * unidades de 5 ml são os MESMOS que dariam 10 de 10 ml.
 */
export function DisponibilidadeCliente({ linhas }: { linhas: LinhaDerivado[] }) {
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [variante, setVariante] = useState<number | 'todas'>('todas')
  const [mostrar, setMostrar] = useState(PAGINA)

  const termo = busca.trim().toLowerCase()

  const visiveis = useMemo(() => {
    const cabe = FILTROS.find((f) => f.id === filtro)!.cabe
    return linhas
      .filter((d) => cabe(d))
      .filter((d) => variante === 'todas' || d.variante === variante)
      .filter((d) => !termo || `${d.perfume} ${d.marca}`.toLowerCase().includes(termo))
  }, [linhas, filtro, variante, termo])

  const contagem = useMemo(
    () =>
      Object.fromEntries(FILTROS.map((f) => [f.id, linhas.filter((d) => f.cabe(d)).length])) as Record<
        Filtro,
        number
      >,
    [linhas],
  )

  const trocar = (aplicar: () => void) => {
    aplicar()
    setMostrar(PAGINA)
  }

  const colunas: Coluna<LinhaDerivado>[] = [
    {
      chave: 'perfume',
      titulo: 'Perfume',
      largura: 'minmax(0,1fr)',
      render: (d) => <CelulaDupla principal={d.perfume} secundaria={d.marca} />,
    },
    {
      chave: 'variante',
      titulo: 'Variante',
      largura: '112px',
      render: (d) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span
            className="font-sans"
            style={{ fontWeight: 500, fontSize: 12, lineHeight: 1.25, color: 'var(--color-corrente)' }}
          >
            {`${d.variante} ml`}
          </span>
          <span
            className="font-sans"
            style={{ fontSize: 9.5, lineHeight: 1.25, color: 'rgba(242,237,227,.35)', whiteSpace: 'nowrap' }}
          >
            {`frasco ${frascoDe(d.variante)} ml`}
          </span>
        </span>
      ),
    },
    {
      chave: 'prontas',
      titulo: 'Prontas',
      largura: '88px',
      alinhamento: 'right',
      render: (d) => (
        <Valor tamanho={12} peso={400} tom={d.disponiveis ? 'ok' : 'rgba(242,237,227,.28)'}>
          {d.disponiveis || '—'}
        </Valor>
      ),
    },
    {
      chave: 'capacidade',
      titulo: 'Capacidade',
      largura: '112px',
      alinhamento: 'right',
      render: (d) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
          <Valor tamanho={12.5} tom={d.capacidade ? 'var(--color-corrente)' : 'rgba(242,237,227,.28)'}>
            {d.capacidade || '—'}
          </Valor>
          {d.capacidade > 0 && (
            <span className="font-sans" style={{ fontSize: 9, color: 'rgba(242,237,227,.3)' }}>
              do volume da base
            </span>
          )}
        </span>
      ),
    },
    {
      chave: 'vendaveis',
      titulo: 'Vendável hoje',
      largura: '112px',
      alinhamento: 'right',
      render: (d) => (
        <Valor tamanho={12.5} tom={TOM[d.estado]}>
          {d.vendaveis}
        </Valor>
      ),
    },
    {
      chave: 'pendentes',
      titulo: 'Demanda pendente',
      largura: '124px',
      alinhamento: 'right',
      // Reserva além do que existe pronto NÃO vira estoque negativo: vira
      // pendência de produção, que é o que ela é de verdade.
      render: (d) =>
        d.pendentes > 0 ? (
          <Valor tamanho={12} tom="erro">
            {d.pendentes}
          </Valor>
        ) : (
          <Valor tamanho={12} peso={400} tom="rgba(242,237,227,.28)">
            —
          </Valor>
        ),
    },
    {
      chave: 'preco',
      titulo: 'Preço',
      largura: '116px',
      alinhamento: 'right',
      render: (d) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
          <Valor tamanho={12}>{d.precoPraticado > 0 ? brl(d.precoPraticado) : '—'}</Valor>
          {d.disponiveis > 0 && (
            <span
              className="font-mono"
              style={{ fontSize: 9.5, lineHeight: 1.25, color: 'rgba(242,237,227,.32)', whiteSpace: 'nowrap' }}
            >
              {`pronto ${brl(d.valorTotal)}`}
            </span>
          )}
        </span>
      ),
    },
    {
      chave: 'estado',
      titulo: 'Estado',
      largura: '132px',
      render: (d) => (
        <span
          className="font-sans"
          style={{
            fontWeight: 600,
            fontSize: 10,
            lineHeight: 1,
            letterSpacing: '.05em',
            textTransform: 'uppercase',
            color: COR[TOM[d.estado]],
            border: `1px solid ${COR[TOM[d.estado]]}`,
            borderRadius: 'var(--radius-pill)',
            padding: '4px 8px',
            whiteSpace: 'nowrap',
          }}
        >
          {d.estado}
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
          aria-label="Buscar perfume"
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
            if (contagem[f.id] === 0 && f.id !== 'todos' && !ativo) return null
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
          <Rotulo>Variante</Rotulo>
          <select
            value={String(variante)}
            onChange={(e) =>
              trocar(() => setVariante(e.target.value === 'todas' ? 'todas' : Number(e.target.value)))
            }
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
            <option value="todas">Todas</option>
            {VARIANTES.map((v) => (
              <option key={v} value={v}>
                {`${v} ml`}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Tabela
        colunas={colunas}
        itens={visiveis.slice(0, mostrar)}
        chaveDe={(d) => `${d.baseId}-${d.variante}`}
        bandeiraDe={(d) =>
          d.pendentes > 0 ? 'erro' : d.estado === 'Últimas unidades' ? 'atencao' : null
        }
        vazio={
          <div style={{ padding: '26px 18px', textAlign: 'center' }}>
            <span className="font-sans" style={{ fontSize: 11.5, color: 'var(--color-terciario)' }}>
              Nenhuma variante neste filtro.
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
              className="font-sans"
              style={{ fontSize: 11, lineHeight: 1.4, color: 'var(--color-terciario)' }}
            >
              {`Mostrando ${Math.min(mostrar, visiveis.length)} de ${plural(visiveis.length, 'variante', 'variantes')}`}
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

/** Só as variantes que a base sustenta hoje — usado no aviso do topo. */
export function contarVendaveis(linhas: LinhaDerivado[]): number {
  return linhas.filter((l) => l.vendaveis > 0).length
}
