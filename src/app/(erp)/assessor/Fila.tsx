import Link from 'next/link'

import { BORDA, COR, FAIXA, FUNDO } from '@/components/erp/tokens'
import { Ico, type NomeIcone } from '@/components/erp/IconesUi'
import type { Prioridade, Severidade } from '@/domain'

/**
 * A fila de decisões, desenhada.
 *
 * Fica ACIMA da conversa e não dentro dela porque não depende de pergunta: o
 * que está vencido está vencido mesmo se ninguém abrir o chat. Um assistente
 * que só fala quando falam com ele não é gerente, é buscador.
 *
 * A ordem vem pronta de `prioridadesDe` e não é reordenada aqui. Componente
 * que reordena é componente que discorda do domínio.
 */

const TOM: Record<Severidade, { cor: string; fundo: string; borda: string; icone: NomeIcone; rotulo: string }> = {
  critico: { cor: COR.erro, fundo: FUNDO.erro, borda: BORDA.erro, icone: 'alerta', rotulo: 'Crítico' },
  alto: { cor: COR.atencao, fundo: FUNDO.atencao, borda: BORDA.atencao, icone: 'alerta', rotulo: 'Atenção' },
  medio: { cor: COR.info, fundo: FUNDO.info, borda: BORDA.info, icone: 'info', rotulo: 'Revisar' },
}

export function Fila({ itens, resumo }: { itens: Prioridade[]; resumo: string }) {
  if (itens.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '11px 14px',
          borderRadius: 12,
          background: FAIXA.ok,
          border: `1px solid ${BORDA.ok}`,
        }}
      >
        <span style={{ color: COR.ok, display: 'grid', placeItems: 'center' }}>
          <Ico n="check" tamanho={15} />
        </span>
        <span className="font-sans" style={{ fontSize: 12, color: 'rgba(242,237,227,.7)' }}>
          {resumo} Caixa, conciliação, estoque e lançamentos conferidos agora.
        </span>
      </div>
    )
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h2
          className="font-display"
          style={{ margin: 0, fontSize: 14.5, fontWeight: 600, color: 'var(--color-tinta)' }}
        >
          O que exige decisão
        </h2>
        <span className="font-sans" style={{ fontSize: 11.5, color: 'rgba(242,237,227,.42)' }}>
          {resumo} Apurado por regra do ERP, não pela IA.
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {itens.map((p) => {
          const t = TOM[p.severidade]
          return (
            <Link
              key={p.id}
              href={p.href}
              className="font-sans hover:brightness-125"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 11,
                padding: '11px 13px',
                borderRadius: 12,
                background: t.fundo,
                border: `1px solid ${t.borda}`,
                textDecoration: 'none',
                minWidth: 0,
              }}
            >
              <span style={{ color: t.cor, display: 'grid', placeItems: 'center', marginTop: 1 }}>
                <Ico n={t.icone} tamanho={15} />
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: 1 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-tinta)' }}>
                    {p.titulo}
                  </span>
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 600,
                      letterSpacing: '.08em',
                      textTransform: 'uppercase',
                      color: t.cor,
                    }}
                  >
                    {t.rotulo}
                  </span>
                </span>
                <span
                  style={{
                    fontSize: 11.5,
                    lineHeight: 1.45,
                    color: 'rgba(242,237,227,.62)',
                    textWrap: 'pretty',
                  }}
                >
                  {p.detalhe}
                </span>
              </span>
              <span
                style={{
                  flex: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  color: t.cor,
                  marginTop: 1,
                }}
              >
                {p.acao}
                <Ico n="chevron" tamanho={12} />
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
