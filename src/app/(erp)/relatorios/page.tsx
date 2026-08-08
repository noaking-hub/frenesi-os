import { Ponto, TituloSecao } from '@/components/erp/primitivos'
import { COR, FUNDO, type Tom } from '@/components/erp/tokens'
import { CANAIS_JULHO, CURVA_ABC, RELATORIOS_LISTA } from '@/data/fixtures'
import { repositorio } from '@/data/repository'
import { brl, num, pct } from '@/domain'

/**
 * A classe ABC não vem marcada: deriva da participação acumulada —
 * A até 80%, B até 95%, C o resto.
 */
function classeDe(acumulado: number): 'A' | 'B' | 'C' {
  if (acumulado <= 80) return 'A'
  if (acumulado <= 95.5) return 'B'
  return 'C'
}

const TOM_CLASSE: Record<'A' | 'B' | 'C', Tom> = { A: 'ouro', B: 'info', C: 'neutro' }

export default async function Relatorios() {
  const parametros = await repositorio().parametros()
  const receitaTotal = CANAIS_JULHO.reduce((a, c) => a + c.receita, 0)
  const pedidosTotal = CANAIS_JULHO.reduce((a, c) => a + c.pedidos, 0)

  let acumulado = 0
  const abc = CURVA_ABC.map((linha) => {
    acumulado = Math.round((acumulado + linha.partPct) * 10) / 10
    return { ...linha, acumulado, classe: classeDe(acumulado) }
  })
  const classeA = abc.filter((l) => l.classe === 'A')
  const acumuladoA = classeA[classeA.length - 1]?.acumulado ?? 0
  // O protótipo dizia que a classe C vale menos que a diferença entre o 1º e o
  // 2º — derivando, é falso (4,7 vs 2,5 p.p.). A frase abaixo sai dos dados.
  const somaC = Math.round(abc.filter((l) => l.classe === 'C').reduce((a, l) => a + l.partPct, 0) * 10) / 10
  const lider = abc[0]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 13 }}>
        {RELATORIOS_LISTA.map((r) => (
          <button
            key={r.titulo}
            type="button"
            className="hover:border-ouro/30"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              padding: '16px 17px',
              border: '1px solid var(--color-borda)',
              background: 'linear-gradient(170deg,#16151A,#101011)',
              borderRadius: 13,
              textAlign: 'left',
              cursor: 'pointer',
              transition: 'border-color .16s',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%' }}>
              <span
                className="font-sans"
                style={{ fontSize: 9.5, lineHeight: 1, letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(239,209,140,.55)' }}
              >
                {r.area}
              </span>
              <span style={{ flex: 1 }} />
              <Ponto tom={r.atencao ? 'atencao' : 'ok'} />
            </span>
            <span className="font-display" style={{ fontWeight: 600, fontSize: 13.5, lineHeight: 1.3, color: 'var(--color-tinta)' }}>
              {r.titulo}
            </span>
            <span className="font-sans" style={{ fontSize: 10.5, lineHeight: 1.5, color: 'rgba(242,237,227,.48)', textWrap: 'pretty' }}>
              {r.descricao}
            </span>
            <span
              className="font-sans"
              style={{ fontWeight: 500, fontSize: 10, lineHeight: 1.3, color: r.atencao ? COR.atencao : COR.ok }}
            >
              {r.atencao ? 'Requer atenção' : 'Atualizado hoje'}
            </span>
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
        <section
          style={{
            background: 'var(--color-mesa)',
            border: '1px solid var(--color-borda)',
            borderRadius: 'var(--radius-card)',
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
            <TituloSecao tamanho={14.5}>Vendas por canal · julho</TituloSecao>
            <div style={{ flex: 1 }} />
            <span className="font-sans" style={{ fontSize: 10, lineHeight: 1, color: 'rgba(242,237,227,.35)' }}>
              {`${pedidosTotal} pedidos · receita bruta`}
            </span>
          </div>
          <div
            className="font-sans"
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0,1fr) 68px 116px 96px 76px',
              gap: 11,
              padding: '10px 18px',
              background: 'var(--color-cabecalho)',
              borderBottom: '1px solid var(--color-borda)',
              fontWeight: 600,
              fontSize: 9,
              lineHeight: 1,
              letterSpacing: '.11em',
              textTransform: 'uppercase',
              color: 'var(--color-terciario)',
            }}
          >
            <span>Canal</span>
            <span style={{ textAlign: 'right' }}>Ped.</span>
            <span style={{ textAlign: 'right' }}>Receita</span>
            <span style={{ textAlign: 'right' }}>Ticket</span>
            <span style={{ textAlign: 'right' }}>Margem</span>
          </div>
          {CANAIS_JULHO.map((c) => (
            <div
              key={c.canal}
              className="hover:bg-[rgba(239,209,140,.035)]"
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0,1fr) 68px 116px 96px 76px',
                gap: 11,
                alignItems: 'center',
                padding: '12px 18px',
                borderTop: '1px solid var(--color-borda-sutil)',
              }}
            >
              <span style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
                <span className="font-sans" style={{ fontWeight: 600, fontSize: 12, lineHeight: 1.25, color: 'var(--color-corrente)' }}>
                  {c.canal}
                </span>
                <span style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,.06)', overflow: 'hidden', display: 'block' }}>
                  <span
                    style={{
                      display: 'block',
                      height: '100%',
                      width: `${Math.round((c.receita / receitaTotal) * 100)}%`,
                      background: 'rgba(239,209,140,.55)',
                      borderRadius: 2,
                    }}
                  />
                </span>
              </span>
              <span className="font-mono" style={{ fontSize: 11.5, lineHeight: 1, color: 'rgba(242,237,227,.6)', textAlign: 'right' }}>
                {c.pedidos}
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
                <span className="font-mono" style={{ fontWeight: 500, fontSize: 12, lineHeight: 1, color: 'var(--color-corrente)', whiteSpace: 'nowrap' }}>
                  {brl(c.receita)}
                </span>
                <span className="font-sans" style={{ fontSize: 9.5, lineHeight: 1, color: 'rgba(242,237,227,.35)' }}>
                  {`${num(Math.round((c.receita / receitaTotal) * 1000) / 10)}%`}
                </span>
              </span>
              <span className="font-mono" style={{ fontSize: 11.5, lineHeight: 1, color: 'rgba(242,237,227,.6)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                {/* Ticket derivado: receita ÷ pedidos do próprio canal. */}
                {brl(Math.round((c.receita / c.pedidos) * 10) / 10)}
              </span>
              <span
                className="font-mono"
                style={{
                  fontWeight: 500,
                  fontSize: 11.5,
                  lineHeight: 1,
                  color:
                    c.margem >= parametros.margemAlvo - 0.5
                      ? COR.ok
                      : c.margem >= parametros.margemAlvo - 5
                        ? COR.atencao
                        : COR.erro,
                  textAlign: 'right',
                }}
              >
                {pct(c.margem)}
              </span>
            </div>
          ))}
        </section>

        <section
          style={{
            background: 'var(--color-mesa)',
            border: '1px solid var(--color-borda)',
            borderRadius: 'var(--radius-card)',
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
            <TituloSecao tamanho={14.5}>Curva ABC de produtos</TituloSecao>
            <div style={{ flex: 1 }} />
            <span className="font-sans" style={{ fontSize: 10, lineHeight: 1, color: 'rgba(242,237,227,.35)' }}>
              participação acumulada
            </span>
          </div>
          {abc.map((l) => (
            <div
              key={l.produto}
              className="hover:bg-[rgba(239,209,140,.035)]"
              style={{
                display: 'grid',
                gridTemplateColumns: '26px minmax(0,1fr) 124px 68px 72px',
                gap: 11,
                alignItems: 'center',
                padding: '11px 18px',
                borderTop: '1px solid var(--color-borda-sutil)',
              }}
            >
              <span
                className="font-sans"
                style={{
                  justifySelf: 'start',
                  fontWeight: 700,
                  fontSize: 10,
                  lineHeight: 1,
                  color: l.classe === 'C' ? 'rgba(242,237,227,.4)' : COR[TOM_CLASSE[l.classe]],
                  background: FUNDO[TOM_CLASSE[l.classe]],
                  borderRadius: 5,
                  padding: '5px 7px',
                }}
              >
                {l.classe}
              </span>
              <span
                className="font-sans"
                style={{
                  fontWeight: 500,
                  fontSize: 12,
                  lineHeight: 1.25,
                  color: 'var(--color-corrente)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {l.produto}
              </span>
              <span style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,.06)', overflow: 'hidden', display: 'block' }}>
                <span
                  style={{
                    display: 'block',
                    height: '100%',
                    width: `${Math.min(100, Math.round(l.partPct * 4))}%`,
                    background: l.classe === 'C' ? 'rgba(242,237,227,.35)' : COR[TOM_CLASSE[l.classe]],
                    borderRadius: 3,
                  }}
                />
              </span>
              <span className="font-mono" style={{ fontWeight: 500, fontSize: 11.5, lineHeight: 1, color: 'var(--color-corrente)', textAlign: 'right' }}>
                {pct(l.partPct)}
              </span>
              <span className="font-mono" style={{ fontSize: 11, lineHeight: 1, color: 'rgba(242,237,227,.45)', textAlign: 'right' }}>
                {pct(l.acumulado)}
              </span>
            </div>
          ))}
          <div style={{ padding: '13px 18px', borderTop: '1px solid rgba(255,255,255,.06)' }}>
            <span className="font-sans" style={{ fontSize: 11, lineHeight: 1.5, color: 'rgba(242,237,227,.45)', textWrap: 'pretty' }}>
              {/* O resumo sai da própria curva, não de um texto fixo. */}
              {`${classeA.length} perfumes respondem por ${num(acumuladoA)}% do faturamento. A classe C inteira soma ${num(somaC)}% — menos de um quinto do que ${lider.produto} vende sozinho.`}
            </span>
          </div>
        </section>
      </div>
    </div>
  )
}
