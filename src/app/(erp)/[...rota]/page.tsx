import Link from 'next/link'

import { Rotulo, TituloSecao } from '@/components/erp/primitivos'
import { NAV } from '@/components/erp/navegacao'

/**
 * Placeholder das telas do handoff ainda não construídas.
 *
 * Diz honestamente o que falta em vez de fingir uma tela vazia, e aponta para
 * as telas do mesmo grupo que já existem.
 */
export default async function EmConstrucao({
  params,
}: {
  params: Promise<{ rota: string[] }>
}) {
  const { rota } = await params
  const href = `/${rota.join('/')}`

  const grupo = NAV.find((g) => g.telas?.some((t) => t.href === href))
  const tela = grupo?.telas?.find((t) => t.href === href)
  const irmasProntas = grupo?.telas?.filter((t) => t.pronta && t.href !== href) ?? []

  return (
    <div
      style={{
        background: '#0F0F10',
        border: '1px solid var(--color-borda)',
        borderRadius: 16,
        padding: '80px 40px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 14,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 26,
          height: 26,
          border: '1px solid rgba(239,209,140,.3)',
          transform: 'rotate(45deg)',
          marginBottom: 8,
        }}
      />
      <TituloSecao tamanho={17}>{tela?.label ?? 'Tela do handoff'}</TituloSecao>
      <span
        className="font-sans"
        style={{
          fontSize: 12,
          lineHeight: 1.6,
          color: 'var(--color-terciario)',
          maxWidth: 460,
          textAlign: 'center',
          textWrap: 'pretty',
        }}
      >
        Especificada no handoff e ainda não implementada. O modelo de domínio,
        os tokens e os componentes já estão prontos para ela.
      </span>

      {irmasProntas.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
            marginTop: 12,
          }}
        >
          <Rotulo>{`Já disponíveis em ${grupo?.label}`}</Rotulo>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            {irmasProntas.map((t) => (
              <Link
                key={t.id}
                href={t.href}
                className="font-sans hover:bg-[rgba(239,209,140,.13)]"
                style={{
                  padding: '8px 13px',
                  border: '1px solid rgba(239,209,140,.22)',
                  background: 'rgba(239,209,140,.05)',
                  color: 'var(--color-ouro)',
                  fontWeight: 600,
                  fontSize: 11,
                  borderRadius: 8,
                }}
              >
                {t.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
