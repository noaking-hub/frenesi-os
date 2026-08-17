import Link from 'next/link'

import { TituloSecao } from '@/components/erp/primitivos'
import { RELATORIOS } from '@/data/relatorios'
import { GRUPOS } from '@/domain'

/**
 * O catálogo — a porta do módulo.
 *
 * Cada cartão mostra a PERGUNTA que o relatório responde, não o nome dele.
 * "Clientes por cidade" diz pouco; "em que cidades estão os clientes que
 * compram, e quanto cada uma vale" diz se é isso que a pessoa procura. Foi o
 * que faltava na tela antiga, que listava nomes de relatório e obrigava a
 * abrir cada um para descobrir o que era.
 */
export function CatalogoDeRelatorios() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <TituloSecao tamanho={15}>Relatórios específicos</TituloSecao>
        <span className="font-sans" style={{ fontSize: 11.5, color: 'var(--color-terciario)' }}>
          {RELATORIOS.length} recortes prontos, todos com filtro por data e download em planilha
        </span>
      </div>

      {GRUPOS.map((grupo) => {
        const doGrupo = RELATORIOS.filter((r) => r.grupo === grupo)
        if (doGrupo.length === 0) return null
        return (
          <div key={grupo} style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <span
              className="font-sans"
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '.14em',
                textTransform: 'uppercase',
                color: 'var(--color-ouro)',
              }}
            >
              {grupo}
            </span>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(268px, 1fr))',
                gap: 10,
              }}
            >
              {doGrupo.map((r) => (
                <Link
                  key={r.id}
                  href={`/relatorios/${r.id}`}
                  className="hover:border-ouro/40"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    padding: '14px 16px',
                    background: 'var(--color-mesa)',
                    border: '1px solid var(--color-borda)',
                    borderRadius: 'var(--radius-card)',
                    textDecoration: 'none',
                  }}
                >
                  <span
                    className="font-display"
                    style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-tinta)' }}
                  >
                    {r.titulo}
                  </span>
                  <span
                    className="font-sans"
                    style={{
                      fontSize: 11,
                      lineHeight: 1.5,
                      color: 'var(--color-terciario)',
                      textWrap: 'pretty',
                    }}
                  >
                    {r.responde}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
