import { Rotulo } from './primitivos'
import { COR, type Tom } from './tokens'

export interface Kpi {
  label: string
  valor: string
  /**
   * O hint SEMPRE explica ou qualifica o valor — nunca é decorativo, e nunca
   * descreve outro evento. É derivado da mesma fonte que o valor.
   */
  hint: string
  tom?: Tom
  /**
   * Quando o número aponta para uma fila de trabalho, o cartão vira botão e
   * leva até ela. Sem isso o operador lê "3 em atraso" e ainda precisa
   * descobrir sozinho quais são os três.
   */
  aoClicar?: () => void
  ativo?: boolean
}

export function CardKpi({ kpi }: { kpi: Kpi }) {
  const estilo = {
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 7,
    minWidth: 0,
    textAlign: 'left' as const,
    ...(kpi.ativo ? { borderColor: 'rgba(239,209,140,.45)' } : null),
  }

  const conteudo = (
    <>
      <Rotulo>{kpi.label}</Rotulo>
      <span
        className="font-mono"
        style={{
          fontWeight: 500,
          fontSize: 20,
          lineHeight: 1,
          color: kpi.tom ? COR[kpi.tom] : 'var(--color-tinta)',
        }}
      >
        {kpi.valor}
      </span>
      <span
        className="font-sans"
        style={{
          fontWeight: 400,
          fontSize: 10,
          lineHeight: 1.35,
          color: 'var(--color-terciario)',
          textWrap: 'pretty',
        }}
      >
        {kpi.hint}
      </span>
    </>
  )

  if (kpi.aoClicar) {
    return (
      <button
        type="button"
        onClick={kpi.aoClicar}
        aria-pressed={kpi.ativo ?? false}
        className="card-erp hover:border-ouro/40"
        style={{ ...estilo, cursor: 'pointer' }}
      >
        {conteudo}
      </button>
    )
  }

  return (
    <div className="card-erp hover:border-ouro/25" style={estilo}>
      {conteudo}
    </div>
  )
}

/** Faixa de 3 a 5 cards no topo da tela. */
export function FaixaKpis({ kpis }: { kpis: Kpi[] }) {
  return (
    <div
      style={{
        display: 'grid',
        // auto-fit: em notebook os cartões quebram em duas linhas em vez de
        // espremer seis colunas até o número não caber.
        gridTemplateColumns: `repeat(auto-fit, minmax(196px, 1fr))`,
        gap: 13,
      }}
    >
      {kpis.map((k) => (
        <CardKpi key={k.label} kpi={k} />
      ))}
    </div>
  )
}
