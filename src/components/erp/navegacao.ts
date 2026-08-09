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
      { id: 'catalogo', label: 'Catálogo', href: '/produtos', pronta: true },
      { id: 'precificacao', label: 'Precificação', href: '/produtos/precificacao', pronta: true },
      { id: 'concorrentes', label: 'Concorrentes', href: '/produtos/concorrentes', pronta: true },
      { id: 'kits', label: 'Kits e combos', href: '/produtos/kits', pronta: true },
    ],
  },
  {
    id: 'estoque',
    label: 'Estoque',
    telas: [
      { id: 'base', label: 'Perfumes base', href: '/estoque', pronta: true },
      { id: 'carga', label: 'Carga inicial', href: '/estoque/carga', pronta: true },
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
      { id: 'lancamentos', label: 'Lançamentos', href: '/financeiro/lancamentos', pronta: true },
      { id: 'contas', label: 'Contas', href: '/financeiro/contas', pronta: true },
      { id: 'conciliacao', label: 'Conciliação', href: '/financeiro', pronta: true },
      { id: 'dre', label: 'DRE', href: '/financeiro/dre', pronta: true },
      { id: 'categorias', label: 'Categorias', href: '/financeiro/categorias', pronta: true },
      { id: 'contabil', label: 'Integração contábil', href: '/financeiro/contabil', pronta: true },
    ],
  },
  {
    id: 'crm',
    label: 'CRM',
    telas: [
      { id: 'clientes', label: 'Clientes', href: '/crm', pronta: true },
      { id: 'carrinhos', label: 'Carrinhos abandonados', href: '/crm/carrinhos', pronta: true },
      { id: 'campanhas', label: 'Campanhas', href: '/crm/campanhas', pronta: true },
      { id: 'giftback', label: 'Giftback e cashback', href: '/crm/giftback', pronta: true },
      { id: 'emails', label: 'E-mails e fluxos', href: '/crm/emails', pronta: true },
    ],
  },
  {
    id: 'promocoes',
    label: 'Promoções',
    telas: [
      { id: 'cupons', label: 'Cupons e campanhas', href: '/promocoes', pronta: true },
      { id: 'ofertas', label: 'Rodízio de ofertas', href: '/promocoes/ofertas', pronta: true },
      { id: 'avaliacoes', label: 'Cupons de avaliação', href: '/promocoes/avaliacoes', pronta: true },
      { id: 'giftback-p', label: 'Giftback e cashback', href: '/crm/giftback', pronta: true },
    ],
  },
  { id: 'atendimento', label: 'Atendimento', href: '/atendimento', pronta: true },
  {
    id: 'ia',
    label: 'Meu Assessor IA',
    telas: [
      { id: 'conversas', label: 'Conversas', href: '/assessor', pronta: true },
      { id: 'iaemail', label: 'Criar e-mail com IA', href: '/assessor/email', pronta: true },
      { id: 'iaregras', label: 'Regras e limites', href: '/assessor/regras', pronta: true },
      { id: 'iaautorizados', label: 'Usuários autorizados', href: '/assessor/autorizados', pronta: true },
      { id: 'ialogs', label: 'Logs de comandos', href: '/assessor/logs', pronta: true },
    ],
  },
  { id: 'relatorios', label: 'Relatórios', href: '/relatorios', pronta: true },
  {
    id: 'config',
    label: 'Configurações',
    telas: [
      { id: 'cfg', label: 'Visão geral', href: '/configuracoes', pronta: true },
      { id: 'cfgpreco', label: 'Parâmetros de precificação', href: '/configuracoes/precificacao', pronta: true },
      { id: 'usuarios', label: 'Usuários e permissões', href: '/configuracoes/usuarios', pronta: true },
      { id: 'empresa', label: 'Dados da empresa', href: '/configuracoes/empresa', pronta: true },
      { id: 'integracoes', label: 'Integrações', href: '/configuracoes/integracoes', pronta: true },
      { id: 'notificacoes', label: 'Notificações', href: '/configuracoes/notificacoes', pronta: true },
      { id: 'logs', label: 'Logs e auditoria', href: '/configuracoes/logs', pronta: true },
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
