import Link from 'next/link'

import { Losango } from '@/components/erp/primitivos'
import { COR, type Tom } from '@/components/erp/tokens'
import { EMPRESA } from '@/data/fixtures'
import { repositorio } from '@/data/repository'
import { plural } from '@/domain'

import { CAMPOS_PARAMETROS, diasParaVencer } from './campos'

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
  const repo = repositorio()
  const [usuarios, perfis, integracoes, notificacoes] = await Promise.all([
    repo.usuarios(),
    repo.perfis(),
    repo.integracoes(),
    repo.notificacoes(),
  ])

  const diasCertificado = diasParaVencer(EMPRESA.certificado.validade)
  const conectadas = integracoes.filter((i) => i.estado === 'Conectada').length
  const viaYampi = integracoes.filter((i) => i.estado === 'Via Yampi').length
  const pendentes = integracoes.filter((i) => i.estado === 'Domínio pendente').length
  const ativas = notificacoes.filter((n) => n.ativa).length
  const pausadas = notificacoes.length - ativas

  const cartoes: CartaoConfig[] = [
    {
      href: '/configuracoes/precificacao',
      titulo: 'Parâmetros de precificação',
      descricao: 'Taxas, custos fixos, perda técnica e margem alvo',
      nota: `${CAMPOS_PARAMETROS.length} parâmetros ativos`,
      tom: 'ok',
    },
    {
      href: '/configuracoes/usuarios',
      titulo: 'Usuários e permissões',
      descricao: 'Quem acessa o ERP e o que cada um pode fazer',
      nota: `${plural(usuarios.length, 'usuário', 'usuários')} · ${plural(perfis.length, 'perfil', 'perfis')}`,
      tom: 'ok',
    },
    {
      href: '/configuracoes/empresa',
      titulo: 'Dados da empresa',
      descricao: 'CNPJ, endereço fiscal, regime tributário e certificado',
      nota: `Certificado vence em ${plural(diasCertificado, 'dia', 'dias')}`,
      tom: diasCertificado <= 90 ? 'atencao' : 'ok',
    },
    {
      href: '/configuracoes/integracoes',
      titulo: 'Integrações',
      descricao: 'Shopify, Yampi, Judge.me, Klaviyo e WhatsApp',
      nota: `${conectadas} conectadas · ${viaYampi} via Yampi · ${pendentes} com pendência`,
      tom: pendentes ? 'atencao' : 'ok',
    },
    {
      href: '/configuracoes/notificacoes',
      titulo: 'Notificações',
      descricao: 'Alertas de estoque, esgotamento, devoluções e caixa',
      nota: `${plural(ativas, 'regra ativa', 'regras ativas')} · ${pausadas} pausadas`,
      tom: 'ok',
    },
    {
      href: '/configuracoes/logs',
      titulo: 'Logs e auditoria',
      descricao: 'Histórico de alterações por usuário e por registro',
      nota: 'Retenção de 180 dias',
      tom: 'ok',
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
