/**
 * Navegação do ERP: 12 grupos, 44 telas.
 *
 * `href` é a rota real. Telas ainda não construídas apontam para a rota
 * marcada e caem no placeholder — o menu é a especificação completa,
 * não só o que já existe.
 */

export interface Tela {
  id: string
  label: string
  href: string
  /** Já implementada de verdade (não é placeholder). */
  pronta?: boolean
}

export interface GrupoNav {
  id: string
  label: string
  href?: string
  pronta?: boolean
  telas?: Tela[]
}

export const NAV: GrupoNav[] = [
  { id: 'dashboard', label: 'Dashboard', href: '/', pronta: true },
  {
    id: 'pedidos',
    label: 'Pedidos',
    telas: [
      { id: 'pedidos', label: 'Todos os pedidos', href: '/pedidos', pronta: true },
      { id: 'envios', label: 'Rastreamento e entregas', href: '/pedidos/envios', pronta: true },
      { id: 'devolucoes', label: 'Devoluções', href: '/pedidos/devolucoes', pronta: true },
      { id: 'ocorrencias', label: 'Ocorrências de entrega', href: '/pedidos/ocorrencias', pronta: true },
    ],
  },
  {
    id: 'produtos',
    label: 'Produtos',
    telas: [
      { id: 'catalogo', label: 'Catálogo', href: '/produtos' },
      { id: 'precificacao', label: 'Precificação', href: '/produtos/precificacao', pronta: true },
      { id: 'concorrentes', label: 'Concorrentes', href: '/produtos/concorrentes' },
      { id: 'kits', label: 'Kits e combos', href: '/produtos/kits' },
    ],
  },
  {
    id: 'estoque',
    label: 'Estoque',
    telas: [
      { id: 'base', label: 'Perfumes base', href: '/estoque', pronta: true },
      { id: 'derivados', label: 'Produtos derivados', href: '/estoque/derivados', pronta: true },
      { id: 'movimentacoes', label: 'Movimentações', href: '/estoque/movimentacoes', pronta: true },
      { id: 'lotes', label: 'Lotes e perda real', href: '/estoque/lotes', pronta: true },
      { id: 'sync', label: 'Sincronia Shopify', href: '/estoque/sincronia', pronta: true },
      { id: 'inventario', label: 'Inventário', href: '/estoque/inventario', pronta: true },
    ],
  },
  { id: 'producao', label: 'Produção', href: '/producao', pronta: true },
  {
    id: 'financeiro',
    label: 'Financeiro',
    telas: [
      { id: 'lancamentos', label: 'Lançamentos', href: '/financeiro/lancamentos' },
      { id: 'contas', label: 'Contas', href: '/financeiro/contas' },
      { id: 'conciliacao', label: 'Conciliação', href: '/financeiro' },
      { id: 'dre', label: 'DRE', href: '/financeiro/dre' },
      { id: 'categorias', label: 'Categorias', href: '/financeiro/categorias' },
      { id: 'contabil', label: 'Integração contábil', href: '/financeiro/contabil' },
    ],
  },
  {
    id: 'crm',
    label: 'CRM',
    telas: [
      { id: 'clientes', label: 'Clientes', href: '/crm' },
      { id: 'carrinhos', label: 'Carrinhos abandonados', href: '/crm/carrinhos' },
      { id: 'campanhas', label: 'Campanhas', href: '/crm/campanhas' },
      { id: 'giftback', label: 'Giftback e cashback', href: '/crm/giftback' },
      { id: 'emails', label: 'E-mails e fluxos', href: '/crm/emails' },
    ],
  },
  {
    id: 'promocoes',
    label: 'Promoções',
    telas: [
      { id: 'cupons', label: 'Cupons e campanhas', href: '/promocoes' },
      { id: 'ofertas', label: 'Rodízio de ofertas', href: '/promocoes/ofertas' },
      { id: 'avaliacoes', label: 'Cupons de avaliação', href: '/promocoes/avaliacoes' },
      { id: 'giftback-p', label: 'Giftback e cashback', href: '/crm/giftback' },
    ],
  },
  { id: 'atendimento', label: 'Atendimento', href: '/atendimento' },
  {
    id: 'ia',
    label: 'Meu Assessor IA',
    telas: [
      { id: 'conversas', label: 'Conversas', href: '/assessor' },
      { id: 'iaemail', label: 'Criar e-mail com IA', href: '/assessor/email' },
      { id: 'iaregras', label: 'Regras e limites', href: '/assessor/regras' },
      { id: 'iaautorizados', label: 'Usuários autorizados', href: '/assessor/autorizados' },
      { id: 'ialogs', label: 'Logs de comandos', href: '/assessor/logs' },
    ],
  },
  { id: 'relatorios', label: 'Relatórios', href: '/relatorios' },
  {
    id: 'config',
    label: 'Configurações',
    telas: [
      { id: 'cfg', label: 'Visão geral', href: '/configuracoes' },
      { id: 'cfgpreco', label: 'Parâmetros de precificação', href: '/configuracoes/precificacao' },
      { id: 'usuarios', label: 'Usuários e permissões', href: '/configuracoes/usuarios' },
      { id: 'empresa', label: 'Dados da empresa', href: '/configuracoes/empresa' },
      { id: 'integracoes', label: 'Integrações', href: '/configuracoes/integracoes' },
      { id: 'notificacoes', label: 'Notificações', href: '/configuracoes/notificacoes' },
      { id: 'logs', label: 'Logs e auditoria', href: '/configuracoes/logs' },
    ],
  },
]

/** Breadcrumb `módulo · tela` e título, derivados da própria navegação. */
export function localizar(pathname: string): { modulo: string; tela: string } {
  for (const grupo of NAV) {
    if (grupo.href && rotaAtiva(pathname, grupo.href)) {
      return { modulo: grupo.label, tela: grupo.label }
    }
    const tela = grupo.telas?.find((t) => rotaAtiva(pathname, t.href))
    if (tela) return { modulo: grupo.label, tela: tela.label }
  }
  return { modulo: 'FRENESI ERP', tela: 'Módulo' }
}

/**
 * Rota ativa por igualdade exata. Prefixo daria falso positivo — `/estoque`
 * marcaria `/estoque/lotes` como ativo também.
 */
export function rotaAtiva(pathname: string, href: string): boolean {
  return pathname === href
}

export function grupoAberto(pathname: string, grupo: GrupoNav): boolean {
  return Boolean(grupo.telas?.some((t) => rotaAtiva(pathname, t.href)))
}
