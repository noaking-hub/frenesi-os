import Link from 'next/link'

import { Losango } from '@/components/erp/primitivos'
import { COR, type Tom } from '@/components/erp/tokens'
import { mercadoPagoConfigurado } from '@/data/mercadopago'
import { shopifyConfigurada } from '@/data/shopify'
import { yampiConfigurada } from '@/data/yampi'

import { CAMPOS_PARAMETROS } from './campos'

interface CartaoConfig {
  href: string
  titulo: string
  descricao: string
  nota: string
  tom: Tom
}

/**
 * Hub de Configurações: cada cartão resume o estado real da sua tela.
 * As notas são derivadas dos mesmos dados que as telas mostram — o hub
 * nunca diz "tudo certo" enquanto a tela interna acusa pendência.
 */
export default async function ConfiguracoesHub() {
  const conexoes = [
    ['Shopify', shopifyConfigurada()],
    ['Yampi', yampiConfigurada()],
    ['Mercado Pago', mercadoPagoConfigurado()],
  ] as const
  const configuradas = conexoes.filter(([, ok]) => ok)
  const faltando = conexoes.filter(([, ok]) => !ok).map(([nome]) => nome)

  const cartoes: CartaoConfig[] = [
    {
      href: '/configuracoes/precificacao',
      titulo: 'Parâmetros de precificação',
      descricao: 'Taxas, custos fixos, perda técnica e margem alvo',
      nota: `${CAMPOS_PARAMETROS.length} parâmetros ativos`,
      tom: 'ok',
    },
    {
      href: '/configuracoes/integracoes',
      titulo: 'Integrações',
      descricao: 'Credenciais e diagnóstico de Shopify, Yampi e Mercado Pago',
      nota: faltando.length
        ? `${configuradas.length} de 3 configuradas · falta ${faltando.join(' e ')}`
        : '3 de 3 configuradas',
      tom: faltando.length ? 'atencao' : 'ok',
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 1080 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 14 }}>
        {cartoes.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="hover:border-ouro/30"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 9,
              padding: '18px 19px',
              border: '1px solid var(--color-borda)',
              background: 'linear-gradient(170deg,#16151A,#101011)',
              borderRadius: 'var(--radius-card)',
              textDecoration: 'none',
              transition: 'border-color .16s',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Losango tom={c.tom} />
              <span
                className="font-display"
                style={{
                  fontWeight: 600,
                  fontSize: 14,
                  lineHeight: 1.25,
                  color: 'var(--color-tinta)',
                  flex: 1,
                  minWidth: 0,
                }}
              >
                {c.titulo}
              </span>
              <span
                className="font-sans"
                aria-hidden
                style={{ fontSize: 13, lineHeight: 1, color: 'rgba(242,237,227,.3)' }}
              >
                →
              </span>
            </span>
            <span
              className="font-sans"
              style={{ fontSize: 11.5, lineHeight: 1.5, color: 'rgba(242,237,227,.55)', textWrap: 'pretty' }}
            >
              {c.descricao}
            </span>
            <span
              className="font-sans"
              style={{ fontWeight: 500, fontSize: 10.5, lineHeight: 1.3, color: COR[c.tom] }}
            >
              {c.nota}
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
