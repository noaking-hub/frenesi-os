import 'server-only'

import { PARAMETROS_PADRAO } from '@/domain'
import type {
  AutorizadoIa,
  AvaliacaoCupom,
  CarrinhoAbandonado,
  ClienteCrm,
  ComandoIa,
  EnvioContabil,
  Integracao,
  PerfilAcesso,
  RegistroAuditoria,
  RegraIa,
  RegraNotificacao,
  SolicitacaoErp,
  UsuarioErp,
} from './fixtures'
import type {
  CampanhaMkt,
  CategoriaFinanceira,
  ContaBancaria,
  CupomPromo,
  EtapaFluxo,
  FluxoEmail,
  FonteConcorrente,
  GiftbackEmitido,
  ItemVitrine,
  Kit,
  ContagemInventario,
  Envio,
  Lancamento,
  Ocorrencia,
  OrdemProducao,
  RegraCashback,
  Repasse,
  Lote,
  Movimentacao,
  ParametrosPrecificacao,
  Pedido,
  PerfumeBase,
  ProdutoDerivado,
  SaldoCashback,
  TicketAtendimento,
  TipoMovimentacao,
  VarianteMl,
} from '@/domain'

import * as fixtures from './fixtures'
import { supabaseConfigurado, supabaseServer } from './supabase'

/**
 * Única porta de entrada para dados. As telas nunca importam fixtures nem o
 * client do Supabase diretamente — assim trocar a origem não toca em nenhuma UI.
 */
export interface Repositorio {
  parametros(): Promise<ParametrosPrecificacao>
  perfumesBase(): Promise<PerfumeBase[]>
  produtosDerivados(): Promise<ProdutoDerivado[]>
  shopifyPublicado(): Promise<Record<string, number>>
  lotes(): Promise<Lote[]>
  pedidos(): Promise<Pedido[]>
  precoPraticado(): Promise<Record<string, Partial<Record<VarianteMl, number>>>>
  movimentacoes(): Promise<Movimentacao[]>
  inventario(): Promise<ContagemInventario[]>
  envios(): Promise<Envio[]>
  ocorrencias(): Promise<Ocorrencia[]>
  solicitacoes(): Promise<SolicitacaoErp[]>
  ordens(): Promise<OrdemProducao[]>
  lancamentos(): Promise<Lancamento[]>
  contas(): Promise<ContaBancaria[]>
  repasses(): Promise<Repasse[]>
  categorias(): Promise<CategoriaFinanceira[]>
  enviosContabeis(): Promise<EnvioContabil[]>
  concorrentesFontes(): Promise<FonteConcorrente[]>
  mercado(): Promise<Record<string, Partial<Record<VarianteMl, number[]>>>>
  kits(): Promise<Kit[]>
  usuarios(): Promise<UsuarioErp[]>
  perfis(): Promise<PerfilAcesso[]>
  integracoes(): Promise<Integracao[]>
  notificacoes(): Promise<RegraNotificacao[]>
  auditoria(): Promise<RegistroAuditoria[]>
  clientes(): Promise<ClienteCrm[]>
  carrinhos(): Promise<CarrinhoAbandonado[]>
  campanhasMkt(): Promise<CampanhaMkt[]>
  fluxos(): Promise<FluxoEmail[]>
  etapasFluxo(): Promise<Record<string, EtapaFluxo[]>>
  cupons(): Promise<CupomPromo[]>
  vitrine(): Promise<ItemVitrine[]>
  avaliacoesCupons(): Promise<AvaliacaoCupom[]>
  regrasCashback(): Promise<RegraCashback[]>
  saldosCashback(): Promise<SaldoCashback[]>
  giftbacks(): Promise<GiftbackEmitido[]>
  atendimento(): Promise<TicketAtendimento[]>
  iaRegras(): Promise<RegraIa[]>
  iaAutorizados(): Promise<AutorizadoIa[]>
  iaComandos(): Promise<ComandoIa[]>
}

const repositorioFixtures: Repositorio = {
  async parametros() {
    return PARAMETROS_PADRAO
  },
  async perfumesBase() {
    return fixtures.PERFUMES_BASE
  },
  async produtosDerivados() {
    return fixtures.PRODUTOS_DERIVADOS
  },
  async shopifyPublicado() {
    return fixtures.SHOPIFY_PUBLICADO
  },
  async lotes() {
    return fixtures.LOTES
  },
  async pedidos() {
    return fixtures.PEDIDOS
  },
  async precoPraticado() {
    return fixtures.PRECO_PRATICADO
  },
  async movimentacoes() {
    return fixtures.MOVIMENTACOES
  },
  async inventario() {
    return fixtures.INVENTARIO
  },
  async envios() {
    return fixtures.ENVIOS
  },
  async ocorrencias() {
    return fixtures.OCORRENCIAS
  },
  async solicitacoes() {
    return fixtures.SOLICITACOES
  },
  async ordens() {
    return fixtures.ORDENS
  },
  async lancamentos() {
    return fixtures.LANCAMENTOS
  },
  async contas() {
    return fixtures.CONTAS
  },
  async repasses() {
    return fixtures.REPASSES
  },
  async categorias() {
    return fixtures.CATEGORIAS
  },
  async enviosContabeis() {
    return fixtures.ENVIOS_CONTABEIS
  },
  async concorrentesFontes() {
    return fixtures.CONCORRENTES_FONTES
  },
  async mercado() {
    return fixtures.MERCADO
  },
  async kits() {
    return fixtures.KITS
  },
  async usuarios() {
    return fixtures.USUARIOS
  },
  async perfis() {
    return fixtures.PERFIS
  },
  async integracoes() {
    return fixtures.INTEGRACOES
  },
  async notificacoes() {
    return fixtures.NOTIFICACOES
  },
  async auditoria() {
    return fixtures.LOGS_AUDITORIA
  },
  async clientes() {
    return fixtures.CLIENTES
  },
  async carrinhos() {
    return fixtures.CARRINHOS
  },
  async campanhasMkt() {
    return fixtures.CAMPANHAS_MKT
  },
  async fluxos() {
    return fixtures.FLUXOS
  },
  async etapasFluxo() {
    return fixtures.ETAPAS_FLUXO
  },
  async cupons() {
    return fixtures.CUPONS
  },
  async vitrine() {
    return fixtures.VITRINE
  },
  async avaliacoesCupons() {
    return fixtures.AVALIACOES_CUPONS
  },
  async regrasCashback() {
    return fixtures.REGRAS_CASHBACK
  },
  async saldosCashback() {
    return fixtures.SALDOS_CASHBACK
  },
  async giftbacks() {
    return fixtures.GIFTBACKS
  },
  async atendimento() {
    return fixtures.ATENDIMENTO
  },
  async iaRegras() {
    return fixtures.IA_REGRAS
  },
  async iaAutorizados() {
    return fixtures.IA_AUTORIZADOS
  },
  async iaComandos() {
    return fixtures.IA_COMANDOS
  },
}

/**
 * O PostgREST devolve no máximo 1.000 linhas por requisição — com 2.000+
 * variantes, uma leitura sem paginação enxergaria metade do catálogo e as
 * telas mostrariam dados truncados sem avisar. Este helper pagina até o fim.
 */
async function tudoDe<T>(
  tabela: string,
  pagina: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const TAMANHO = 1000
  const linhas: T[] = []
  for (let de = 0; ; de += TAMANHO) {
    const { data, error } = await pagina(de, de + TAMANHO - 1)
    if (error) throw error
    const parte = data ?? []
    linhas.push(...parte)
    if (parte.length < TAMANHO) break
    if (de > 100_000) throw new Error(`Paginação de ${tabela} passou de 100 mil linhas`)
  }
  return linhas
}

const repositorioSupabase: Repositorio = {
  async parametros() {
    const { data, error } = await supabaseServer()
      .from('parametros_precificacao')
      .select('*')
      .order('vigente_desde', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    if (!data) return PARAMETROS_PADRAO
    return {
      intermediadorPct: Number(data.intermediador_pct),
      intermediadorFixo: Number(data.intermediador_fixo),
      checkoutPct: Number(data.checkout_pct),
      impostoPct: Number(data.imposto_pct),
      adsPct: Number(data.ads_pct),
      insumos: Number(data.insumos),
      freteSubsidio: Number(data.frete_subsidio),
      antifraude: Number(data.antifraude),
      perdaPct: Number(data.perda_pct),
      margemAlvo: Number(data.margem_alvo),
    }
  },

  async perfumesBase() {
    const data = await tudoDe('perfumes_base', (de, ate) =>
      supabaseServer()
        .from('perfumes_base')
        .select('id, nome, marca, genero, custo_por_ml, volume_ml, consumo_diario_ml, imagem_url')
        .eq('ativo', true)
        .order('id')
        .range(de, ate),
    )
    return data.map((b) => ({
      id: b.id,
      nome: b.nome,
      marca: b.marca,
      genero: b.genero ?? undefined,
      custoPorMl: Number(b.custo_por_ml),
      volumeMl: Number(b.volume_ml),
      consumoDiarioMl: Number(b.consumo_diario_ml),
      imagemUrl: b.imagem_url ?? undefined,
    }))
  },

  async produtosDerivados() {
    const data = await tudoDe('produtos_derivados', (de, ate) =>
      supabaseServer()
        .from('produtos_derivados')
        .select('base_id, variante, envasadas, reservadas, preco_praticado')
        .order('base_id')
        .order('variante')
        .range(de, ate),
    )
    return data.map((d) => ({
      baseId: d.base_id,
      variante: d.variante as VarianteMl,
      envasadas: d.envasadas,
      reservadas: d.reservadas,
      precoPraticado: Number(d.preco_praticado ?? 0),
    }))
  },

  async shopifyPublicado() {
    const data = await tudoDe('shopify_publicado', (de, ate) =>
      supabaseServer()
        .from('shopify_publicado')
        .select('base_id, variante, publicado')
        .order('base_id')
        .order('variante')
        .range(de, ate),
    )
    return Object.fromEntries(data.map((p) => [`${p.base_id}|${p.variante}`, p.publicado]))
  },

  async lotes() {
    const { data, error } = await supabaseServer()
      .from('lotes')
      .select(
        'id, base_id, fornecedor, volume_ml, entrada_em, encerrado_em, ' +
          'perfumes_base(nome), lote_saidas(ocorrida_em, ordem_id, unidades, variante)',
      )
      .order('entrada_em', { ascending: false })
    if (error) throw error
    // O client sem tipos gerados não infere selects com embed; a forma da linha
    // é declarada aqui e conferida contra `supabase/migrations`.
    const linhas = (data ?? []) as unknown as LinhaLote[]
    return linhas.map((l): Lote => {
      const base = l.perfumes_base
      const saidas = l.lote_saidas ?? []
      return {
        id: l.id,
        baseId: l.base_id,
        perfume: base?.nome ?? l.base_id,
        fornecedor: l.fornecedor,
        volumeMl: Number(l.volume_ml),
        entrada: l.entrada_em,
        encerradoEm: l.encerrado_em,
        saidas: saidas.map((s) => ({
          data: s.ocorrida_em,
          ref: s.ordem_id,
          unidades: s.unidades,
          variante: s.variante as VarianteMl,
        })),
      }
    })
  },

  async pedidos() {
    const { data, error } = await supabaseServer()
      .from('pedidos')
      .select(
        'id, canal, valor, frete, cashback, pagamento, envio, comprado_em, entregue_em, ' +
          'destino, cep, logradouro, peso, dimensoes, gateway, rastreio, ' +
          'clientes(nome, email, cpf, telefone), pedido_itens(descricao, variante, preco)',
      )
      .order('comprado_em', { ascending: false })
    if (error) throw error
    const dia = 24 * 60 * 60 * 1000
    const linhas = (data ?? []) as unknown as LinhaPedido[]
    return linhas.map((p): Pedido => {
      const cliente = p.clientes
      const itens = p.pedido_itens ?? []
      return {
        id: p.id,
        cliente: cliente?.nome ?? '—',
        email: cliente?.email ?? '',
        cpf: (cliente?.cpf ?? '').replace(/\D/g, ''),
        telefone: cliente?.telefone ?? '',
        data: p.comprado_em,
        canal: capitalizaCanal(p.canal),
        valor: Number(p.valor),
        frete: Number(p.frete),
        cashback: Number(p.cashback),
        pagamento: p.pagamento,
        envio: rotuloEnvio(p.envio),
        // O prazo de devolução só começa a correr na marcação de entrega.
        diasDesdeEntrega: p.entregue_em
          ? Math.floor((Date.now() - new Date(p.entregue_em).getTime()) / dia)
          : null,
        entregueEm: p.entregue_em,
        destino: p.destino ?? '',
        cep: p.cep ?? '',
        rua: p.logradouro ?? '',
        peso: p.peso ?? '',
        dimensoes: p.dimensoes ?? '',
        gateway: p.gateway === 'frenet' ? 'Frenet' : 'Melhor Envio',
        rastreio: p.rastreio,
        itens: itens.map((i) => ({
          perfume: i.descricao,
          marca: '',
          variante: (i.variante ?? 5) as VarianteMl,
          preco: Number(i.preco),
        })),
      }
    })
  },

  async precoPraticado() {
    const derivados = await repositorioSupabase.produtosDerivados()
    const mapa: Record<string, Partial<Record<VarianteMl, number>>> = {}
    for (const d of derivados) {
      if (!d.precoPraticado) continue
      mapa[d.baseId] = { ...mapa[d.baseId], [d.variante]: d.precoPraticado }
    }
    return mapa
  },

  async movimentacoes() {
    const { data, error } = await supabaseServer()
      .from('movimentacoes')
      .select(
        'id, base_id, tipo, ocorrida_em, volume_ml, liquido_ml, ref, descricao, ' +
          'responsavel, saldo_ml, perfumes_base(nome)',
      )
      .order('ocorrida_em', { ascending: false })
      .limit(200)
    if (error) throw error
    const linhas = (data ?? []) as unknown as LinhaMovimentacao[]
    return linhas.map(
      (m): Movimentacao => ({
        id: m.id,
        baseId: m.base_id,
        perfume: m.perfumes_base?.nome ?? m.base_id,
        tipo: m.tipo,
        data: m.ocorrida_em,
        volumeMl: Number(m.volume_ml),
        liquidoMl: m.liquido_ml === null ? null : Number(m.liquido_ml),
        ref: m.ref ?? '',
        motivo: m.descricao,
        responsavel: m.responsavel ?? '—',
        saldoMl: Number(m.saldo_ml ?? 0),
      }),
    )
  },

  async inventario() {
    // A contagem em andamento é a que ainda não foi fechada.
    const { data: aberto, error: erroAberto } = await supabaseServer()
      .from('inventarios')
      .select('id')
      .is('fechado_em', null)
      .order('competencia', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (erroAberto) throw erroAberto
    if (!aberto) return []

    const { data, error } = await supabaseServer()
      .from('inventario_contagens')
      .select('base_id, sistema_ml, contado_ml, responsavel, contado_em, perfumes_base(nome)')
      .eq('inventario_id', aberto.id)
    if (error) throw error
    const linhas = (data ?? []) as unknown as LinhaInventarioDb[]
    return linhas.map(
      (i): ContagemInventario => ({
        baseId: i.base_id,
        perfume: i.perfumes_base?.nome ?? i.base_id,
        sistemaMl: Number(i.sistema_ml),
        contadoMl: i.contado_ml === null ? null : Number(i.contado_ml),
        responsavel: i.responsavel,
        quando: i.contado_em,
      }),
    )
  },

  // Rastreamento, ocorrências e a triagem de devolução ainda não têm tabelas
  // próprias — o schema cobre `devolucoes`, mas não o extrato de eventos nem a
  // aferição de volume. Até lá estas três leem os fixtures, mesmo com o
  // Supabase configurado, em vez de fingir uma consulta que não existe.
  envios: repositorioFixtures.envios,
  ocorrencias: repositorioFixtures.ocorrencias,
  solicitacoes: repositorioFixtures.solicitacoes,
  ordens: repositorioFixtures.ordens,
  // O financeiro ainda não tem tabelas próprias no Supabase; cai nos fixtures
  // até a migration existir, sem fingir consulta.
  lancamentos: repositorioFixtures.lancamentos,
  contas: repositorioFixtures.contas,
  repasses: repositorioFixtures.repasses,
  categorias: repositorioFixtures.categorias,
  enviosContabeis: repositorioFixtures.enviosContabeis,
  concorrentesFontes: repositorioFixtures.concorrentesFontes,
  mercado: repositorioFixtures.mercado,
  kits: repositorioFixtures.kits,
  usuarios: repositorioFixtures.usuarios,
  perfis: repositorioFixtures.perfis,
  integracoes: repositorioFixtures.integracoes,
  notificacoes: repositorioFixtures.notificacoes,
  auditoria: repositorioFixtures.auditoria,
  // CRM, promoções, atendimento e Assessor IA também aguardam migrations.
  clientes: repositorioFixtures.clientes,
  carrinhos: repositorioFixtures.carrinhos,
  campanhasMkt: repositorioFixtures.campanhasMkt,
  fluxos: repositorioFixtures.fluxos,
  etapasFluxo: repositorioFixtures.etapasFluxo,
  cupons: repositorioFixtures.cupons,
  vitrine: repositorioFixtures.vitrine,
  avaliacoesCupons: repositorioFixtures.avaliacoesCupons,
  regrasCashback: repositorioFixtures.regrasCashback,
  saldosCashback: repositorioFixtures.saldosCashback,
  giftbacks: repositorioFixtures.giftbacks,
  atendimento: repositorioFixtures.atendimento,
  iaRegras: repositorioFixtures.iaRegras,
  iaAutorizados: repositorioFixtures.iaAutorizados,
  iaComandos: repositorioFixtures.iaComandos,
}

/**
 * Formas das linhas com embed, espelhando `supabase/migrations`.
 * Substituíveis pelos tipos gerados (`supabase gen types typescript`).
 */
interface LinhaLote {
  id: string
  base_id: string
  fornecedor: string
  volume_ml: number | string
  entrada_em: string
  encerrado_em: string | null
  perfumes_base: { nome: string } | null
  lote_saidas: {
    ocorrida_em: string
    ordem_id: string
    unidades: number
    variante: number
  }[]
}

interface LinhaPedido {
  id: string
  canal: string
  valor: number | string
  frete: number | string
  cashback: number | string
  pagamento: Pedido['pagamento']
  envio: string
  comprado_em: string
  entregue_em: string | null
  destino: string | null
  cep: string | null
  logradouro: string | null
  peso: string | null
  dimensoes: string | null
  gateway: string | null
  rastreio: string | null
  clientes: { nome: string; email: string; cpf: string | null; telefone: string } | null
  pedido_itens: { descricao: string; variante: number | null; preco: number | string }[]
}

interface LinhaMovimentacao {
  id: string
  base_id: string
  tipo: TipoMovimentacao
  ocorrida_em: string
  volume_ml: number | string
  liquido_ml: number | string | null
  ref: string | null
  descricao: string
  responsavel: string | null
  saldo_ml: number | string | null
  perfumes_base: { nome: string } | null
}

interface LinhaInventarioDb {
  base_id: string
  sistema_ml: number | string
  contado_ml: number | string | null
  responsavel: string | null
  contado_em: string | null
  perfumes_base: { nome: string } | null
}

function capitalizaCanal(canal: string): Pedido['canal'] {
  const mapa: Record<string, Pedido['canal']> = {
    shopify: 'Shopify',
    yampi: 'Yampi',
    whatsapp: 'WhatsApp',
    instagram: 'Instagram',
  }
  return mapa[canal] ?? 'Shopify'
}

function rotuloEnvio(envio: string): Pedido['envio'] {
  const mapa: Record<string, Pedido['envio']> = {
    nao_iniciado: 'Não iniciado',
    aguardando_envio: 'Aguardando envio',
    enviado: 'Enviado',
    entregue: 'Entregue',
    retido: 'Retido',
    atrasado: 'Atrasado',
  }
  return mapa[envio] ?? 'Não iniciado'
}

export function repositorio(): Repositorio {
  return supabaseConfigurado() ? repositorioSupabase : repositorioFixtures
}

/** Origem dos dados, para o rodapé da sidebar dizer a verdade. */
export function origemDados(): 'supabase' | 'fixtures' {
  return supabaseConfigurado() ? 'supabase' : 'fixtures'
}
