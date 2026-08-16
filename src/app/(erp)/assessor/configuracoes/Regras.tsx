import { Etiqueta, Num, TINTA, Vazio } from '@/components/erp/ui'
import type { RegraDeClassificacao } from '@/domain'

/**
 * As regras aprovadas, como lista legível.
 *
 * Regra pausada aparece — apagada, mas presente. Some da automação e continua
 * no histórico: saber que uma regra existiu explica classificações antigas que
 * de outro modo pareceriam arbitrárias.
 */
export function Regras({ regras }: { regras: RegraDeClassificacao[] }) {
  if (regras.length === 0) {
    return (
      <Vazio
        texto="Nenhuma regra ainda. Peça ao Gerente: “sempre categorize Melhor Envio como Frete”."
        icone="lista"
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {regras.map((r) => (
        <div
          key={r.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '9px 11px',
            borderRadius: 9,
            background: 'rgba(255,255,255,.02)',
            border: '1px solid rgba(255,255,255,.05)',
            opacity: r.ativa ? 1 : 0.45,
            flexWrap: 'wrap',
          }}
        >
          <span
            className="font-mono"
            style={{ fontSize: 11.5, color: 'var(--color-tinta)', minWidth: 0 }}
          >
            “{r.padrao}”
          </span>
          <span style={{ color: 'rgba(242,237,227,.3)' }}>→</span>
          <span className="font-sans" style={{ fontSize: 12, color: TINTA.ouro }}>
            {r.categoria}
          </span>
          <div style={{ flex: 1, minWidth: 4 }} />
          {r.tipo && (
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Etiqueta>Sentido</Etiqueta>
              <span className="font-sans" style={{ fontSize: 11, color: 'rgba(242,237,227,.6)' }}>
                {r.tipo}
              </span>
            </span>
          )}
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Etiqueta>Prioridade</Etiqueta>
            <Num tamanho={11}>{String(r.prioridade)}</Num>
          </span>
          <span
            className="font-sans"
            style={{
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: '.09em',
              textTransform: 'uppercase',
              color: r.ativa ? TINTA.ok : 'rgba(242,237,227,.35)',
            }}
          >
            {r.ativa ? 'ativa' : 'pausada'}
          </span>
        </div>
      ))}
    </div>
  )
}
