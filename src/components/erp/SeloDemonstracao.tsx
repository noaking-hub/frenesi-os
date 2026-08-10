'use client'

import { usePathname } from 'next/navigation'

/**
 * Módulos que ainda não têm tabela no Supabase e leem fixtures mesmo com o
 * banco ligado.
 *
 * A chave é o prefixo da rota; o valor, o que falta para a tela virar
 * operação. Enquanto isso, ela precisa dizer que os números são inventados —
 * um ERP que mostra número falso com cara de verdadeiro é pior que um ERP
 * incompleto, porque a decisão errada parece fundamentada.
 *
 * Apagar uma linha daqui é o último passo de ligar o módulo de verdade.
 */
const EM_DEMONSTRACAO: { prefixo: string; falta: string }[] = [
  { prefixo: '/pedidos/envios', falta: 'a tabela de eventos de rastreamento' },
  { prefixo: '/pedidos/ocorrencias', falta: 'a tabela de ocorrências de entrega' },
  { prefixo: '/pedidos/devolucoes', falta: 'a triagem de devolução ligada ao portal' },
  { prefixo: '/crm/carrinhos', falta: 'a importação de carrinhos abandonados da Yampi' },
  { prefixo: '/crm/campanhas', falta: 'a tabela de campanhas de marketing' },
  { prefixo: '/crm/emails', falta: 'a tabela de fluxos de e-mail' },
  { prefixo: '/crm/giftback', falta: 'as tabelas de cashback e giftback' },
  { prefixo: '/promocoes', falta: 'as tabelas de cupons e da vitrine' },
  { prefixo: '/atendimento', falta: 'a tabela de tickets' },
  { prefixo: '/assessor', falta: 'as tabelas de regras e autorizações do assessor' },
  { prefixo: '/relatorios', falta: 'as tabelas dos módulos que ele resume' },
  { prefixo: '/produtos/kits', falta: 'a tabela de kits' },
  { prefixo: '/configuracoes/usuarios', falta: 'a tabela de usuários e perfis' },
  { prefixo: '/configuracoes/integracoes', falta: 'o registro de integrações' },
  { prefixo: '/configuracoes/logs', falta: 'a trilha de auditoria' },
]

/**
 * Só aparece quando o banco ESTÁ ligado: sem Supabase a aplicação inteira é
 * demonstração, e o rodapé da barra lateral já diz isso.
 */
export function SeloDemonstracao({ sincronizado }: { sincronizado: boolean }) {
  const rota = usePathname()
  if (!sincronizado || !rota) return null

  // O prefixo mais específico ganha: /produtos/kits antes de /produtos.
  const modulo = EM_DEMONSTRACAO.filter(
    (m) => rota === m.prefixo || rota.startsWith(`${m.prefixo}/`),
  ).sort((a, b) => b.prefixo.length - a.prefixo.length)[0]
  if (!modulo) return null

  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        marginBottom: 18,
        padding: '12px 15px',
        borderRadius: 12,
        background: 'rgba(224,168,74,.07)',
        border: '1px solid rgba(224,168,74,.28)',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 7,
          height: 7,
          marginTop: 5,
          flex: 'none',
          borderRadius: 2,
          background: 'var(--color-atencao)',
          transform: 'rotate(45deg)',
        }}
      />
      <span
        className="font-sans"
        style={{
          fontSize: 11.5,
          lineHeight: 1.5,
          color: 'var(--color-secundario)',
          textWrap: 'pretty',
        }}
      >
        <strong style={{ fontWeight: 600, color: 'var(--color-atencao)' }}>
          Números de demonstração.
        </strong>{' '}
        {`Esta tela ainda não lê o seu banco — falta ${modulo.falta}. O que aparece aqui é exemplo, não a sua operação: não use para decidir.`}
      </span>
    </div>
  )
}
