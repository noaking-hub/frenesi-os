/**
 * Navegação do ERP: 9 grupos, 30 telas — todas reais.
 *
 * O menu já foi a especificação completa, com telas de demonstração
 * esperando vez. Elas saíram: menu que promete o que não existe ensina o
 * operador a desconfiar do que existe. O que está aqui lê a operação.
 */

export interface Tela {
  id: string
  label: string
  href: string
  /** Já implementada de verdade (não é placeholder). */
  pronta?: boolean
  /**
   * Título e subtítulo do cabeçalho da tela.
   *
   * Moram aqui, e não em cada `page.tsx`, porque o cabeçalho é renderizado
   * UMA vez no topo — a página que desenhasse o próprio título produziria
   * dois, um embaixo do outro. Sem `titulo`, o `label` do menu serve.
   */
  titulo?: string
  subtitulo?: string
  icone?: string
}

export interface GrupoNav {
  id: string
  label: string
  href?: string
  pronta?: boolean
  titulo?: string
  subtitulo?: string
  icone?: string
  telas?: Tela[]
}

export const NAV: GrupoNav[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    href: '/',
    pronta: true,
    subtitulo: 'Central de decisão operacional e gerencial',
    icone: 'grade',
  },
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
      // Frasco, válvula e tampa: o decant não sai só com perfume.
      { id: 'insumos', label: 'Insumos', href: '/estoque/insumos', pronta: true },
    ],
  },
  // "Produção" virou "Envase": a tela não abre mais ordem nem baixa estoque
  // — ela diz o que fracionar agora, a partir dos pedidos já pagos.
  { id: 'envase', label: 'Envase', href: '/envase', pronta: true },
  {
    id: 'financeiro',
    label: 'Financeiro',
    telas: [
      // A landing do módulo é a Visão Financeira, não a lista de lançamentos:
      // quem abre o Financeiro quer saber quanto tem, quanto vai ter e o que
      // exige decisão hoje. Uma lista cronológica não responde nenhuma das três.
      {
        id: 'visao',
        label: 'Visão Financeira',
        href: '/financeiro',
        pronta: true,
        titulo: 'Dashboard Financeiro',
        subtitulo: 'Visão geral da saúde financeira do negócio',
        icone: 'cifrao',
      },
      {
        id: 'lancamentos',
        label: 'Lançamentos',
        href: '/financeiro/lancamentos',
        pronta: true,
        subtitulo: 'Contas a pagar e a receber da operação',
        icone: 'recibo',
      },
      {
        id: 'contas',
        label: 'Contas e Caixas',
        href: '/financeiro/contas',
        pronta: true,
        subtitulo: 'Saldo por conta bancária, carteira e caixa operacional',
        icone: 'banco',
      },
      {
        id: 'extrato',
        label: 'Extrato',
        href: '/financeiro/extrato',
        pronta: true,
        titulo: 'Extrato Inteligente',
        subtitulo: 'Importação, leitura e classificação dos movimentos bancários',
        icone: 'faisca',
      },
      {
        id: 'conciliacao',
        label: 'Conciliação',
        href: '/financeiro/conciliacao',
        pronta: true,
        titulo: 'Conciliação Bancária',
        subtitulo: 'Cada venda contra o extrato e as tarifas reais',
        icone: 'recibo',
      },
      {
        id: 'fluxo',
        label: 'Fluxo de Caixa',
        href: '/financeiro/fluxo-de-caixa',
        pronta: true,
        subtitulo: 'Realizado, comprometido e projetado',
        icone: 'linha',
      },
      {
        id: 'dre',
        label: 'DRE Gerencial',
        href: '/financeiro/dre',
        pronta: true,
        subtitulo: 'Resultado por competência e por regime gerencial',
        icone: 'balanca',
      },
      {
        id: 'categorias',
        label: 'Categorias',
        href: '/financeiro/categorias',
        pronta: true,
        subtitulo: 'Plano de contas gerencial do Financeiro',
        icone: 'etiqueta',
      },
    ],
  },
  {
    id: 'crm',
    label: 'CRM',
    telas: [
      { id: 'clientes', label: 'Clientes', href: '/crm', pronta: true },
      { id: 'carrinhos', label: 'Carrinhos abandonados', href: '/crm/carrinhos', pronta: true },
      { id: 'cashback', label: 'Cashback', href: '/crm/cashback', pronta: true },
      { id: 'giftback', label: 'Giftback · Aniversários', href: '/crm/giftback', pronta: true },
      { id: 'emails', label: 'E-mails da marca', href: '/crm/emails', pronta: true },
    ],
  },
  { id: 'promocoes', label: 'Cupons', href: '/promocoes', pronta: true },
  { id: 'relatorios', label: 'Relatórios', href: '/relatorios', pronta: true },
  {
    id: 'config',
    label: 'Configurações',
    telas: [
      { id: 'cfgpreco', label: 'Parâmetros de precificação', href: '/configuracoes/precificacao', pronta: true },
      { id: 'integracoes', label: 'Integrações', href: '/configuracoes/integracoes', pronta: true },
      { id: 'usuarios', label: 'Usuários', href: '/configuracoes/usuarios', pronta: true },
    ],
  },
]

export interface Cabecalho {
  modulo: string
  tela: string
  titulo: string
  subtitulo: string | null
  icone: string | null
}

/** Cabeçalho da tela — título, subtítulo e ícone — derivado da navegação. */
export function localizar(pathname: string): Cabecalho {
  for (const grupo of NAV) {
    if (grupo.href && rotaAtiva(pathname, grupo.href)) {
      return {
        modulo: grupo.label,
        tela: grupo.label,
        titulo: grupo.titulo ?? grupo.label,
        subtitulo: grupo.subtitulo ?? null,
        icone: grupo.icone ?? grupo.id,
      }
    }
    const tela = grupo.telas?.find((t) => rotaAtiva(pathname, t.href))
    if (tela) {
      return {
        modulo: grupo.label,
        tela: tela.label,
        titulo: tela.titulo ?? tela.label,
        subtitulo: tela.subtitulo ?? null,
        icone: tela.icone ?? null,
      }
    }
  }
  // Rota dinâmica que a navegação não lista: o detalhe de um perfume. A
  // igualdade exata acima nunca a encontraria — e "Módulo" no topo parece
  // tela quebrada.
  if (/^\/produtos\/[^/]+$/.test(pathname)) {
    return {
      modulo: 'Produtos',
      tela: 'Produto 360º',
      titulo: 'Produto 360º',
      subtitulo: 'Custo, preço, estoque e histórico de um perfume',
      icone: 'frasco',
    }
  }
  return { modulo: 'FRENESI ERP', tela: 'Módulo', titulo: 'Módulo', subtitulo: null, icone: null }
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
