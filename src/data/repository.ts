import 'server-only'

import {
  INICIO_DA_OPERACAO,
  PARAMETROS_PADRAO,
  aferirItem,
  identificarFrete,
  iniciaisDe,
  montarEnvio,
  statusCliente,
  statusDevolucao,
  statusDoLancamento,
} from '@/domain'
import type { ClienteCrm, SolicitacaoErp } from './fixtures'
import type {
  CategoriaFinanceira,
  ContaBancaria,
  ContagemInventario,
  Envio,
  Lancamento,
  Ocorrencia,
  Repasse,
  Lote,
  Movimentacao,
  ParametrosPrecificacao,
  Pedido,
  PerfumeBase,
  ProdutoDerivado,
  ReceitaMensal,
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
  /** Base de rateio de custo mensal fixo (ADS): 30 dias de pedidos pagos. */
  receitaMensal(): Promise<ReceitaMensal>
  perfumesBase(): Promise<PerfumeBase[]>
  /** Inclui inativos — só o Catálogo precisa, para poder reativar. */
  perfumesBaseTodos(): Promise<PerfumeBase[]>
  produtosDerivados(): Promise<ProdutoDerivado[]>
  shopifyPublicado(): Promise<Record<string, number>>
  lotes(): Promise<Lote[]>
  pedidos(): Promise<Pedido[]>
  precoPraticado(): Promise<Record<string, Partial<Record<VarianteMl, number>>>>
  movimentacoes(): Promise<Movimentacao[]>
  inventario(): Promise<ContagemInventario[]>
  /** Contagem em andamento, se houver. `null` quando não há nenhuma aberta. */
  inventarioAberto(): Promise<{ id: string; competencia: string } | null>
  envios(): Promise<Envio[]>
  ocorrencias(): Promise<Ocorrencia[]>
  solicitacoes(): Promise<SolicitacaoErp[]>
  lancamentos(): Promise<Lancamento[]>
  contas(): Promise<ContaBancaria[]>
  repasses(): Promise<Repasse[]>
  categorias(): Promise<CategoriaFinanceira[]>
  clientes(): Promise<ClienteCrm[]>
}

const repositorioFixtures: Repositorio = {
  async parametros() {
    return PARAMETROS_PADRAO
  },
  async receitaMensal() {
    // A fixture não tem data em ISO, e inventar um recorte de 30 dias aqui
    // daria número de demonstração com cara de apurado. Vale o conjunto todo.
    const pagos = fixtures.PEDIDOS.filter((p) => p.pagamento === 'pago')
    return {
      pedidos: pagos.length,
      receitaProdutos: pagos.reduce((a, p) => a + p.valor - p.frete, 0),
    }
  },
  async perfumesBase() {
    return fixtures.PERFUMES_BASE
  },
  async perfumesBaseTodos() {
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
  async inventarioAberto() {
    return { id: 'INV-0726', competencia: '26/07/2026' }
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
  async clientes() {
    return fixtures.CLIENTES
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

const CAMPOS_BASE =
  'id, nome, marca, genero, genero_manual, custo_por_ml, volume_ml, reservado_ml, ' +
  'consumo_diario_ml, imagem_url, ativo, shopify_product_id, shopify_handle'

/** Forma da linha de `perfumes_base`, conferida contra `supabase/migrations`. */
interface LinhaPerfumeBase {
  id: string
  nome: string
  marca: string
  genero: string | null
  genero_manual: boolean | null
  custo_por_ml: number | string
  volume_ml: number | string
  reservado_ml: number | string | null
  consumo_diario_ml: number | string
  imagem_url: string | null
  ativo: boolean | null
  shopify_product_id: string | null
  shopify_handle: string | null
}

/**
 * Bases que já entraram no livro de movimentações.
 *
 * É o que separa "esgotada" de "o ERP não sabe" — e precisa ser derivado, não
 * inferido do custo: cadastrar preço sem declarar volume não pode fazer a
 * sincronia zerar o produto na loja.
 */
async function lerBasesSobControle(): Promise<Set<string>> {
  const linhas = await tudoDe<{ base_id: string }>('bases_sob_controle', (de, ate) =>
    supabaseServer()
      .from('bases_sob_controle')
      .select('base_id')
      .range(de, ate) as unknown as PromiseLike<{
      data: { base_id: string }[] | null
      error: unknown
    }>,
  )
  return new Set(linhas.map((l) => l.base_id))
}

async function lerPerfumesBase({ apenasAtivos }: { apenasAtivos: boolean }) {
  const controladas = await lerBasesSobControle()
  const data = await tudoDe<LinhaPerfumeBase>('perfumes_base', (de, ate) => {
    const consulta = supabaseServer().from('perfumes_base').select(CAMPOS_BASE)
    return (apenasAtivos ? consulta.eq('ativo', true) : consulta)
      .order('nome')
      .range(de, ate) as unknown as PromiseLike<{
      data: LinhaPerfumeBase[] | null
      error: unknown
    }>
  })
  return data.map((b): PerfumeBase => ({
    id: b.id,
    nome: b.nome,
    marca: b.marca,
    genero: (b.genero as PerfumeBase['genero']) ?? undefined,
    generoManual: b.genero_manual ?? false,
    custoPorMl: Number(b.custo_por_ml),
    volumeMl: Number(b.volume_ml),
    reservadoMl: Number(b.reservado_ml ?? 0),
    consumoDiarioMl: Number(b.consumo_diario_ml),
    imagemUrl: b.imagem_url ?? undefined,
    ativo: b.ativo ?? true,
    sobControle: controladas.has(b.id),
    shopifyProductId: b.shopify_product_id,
    shopifyHandle: b.shopify_handle,
  }))
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
      // Vigências de antes do detalhamento têm só o total: ele entra como
      // frasco até o operador abrir o valor item a item.
      frasco: Number(data.frasco ?? 0) || Number(data.insumos ?? 0),
      valvula: Number(data.valvula ?? 0),
      tampa: Number(data.tampa ?? 0),
      etiqueta: Number(data.etiqueta ?? 0),
      caixa: Number(data.caixa ?? 0),
      plasticoBolha: Number(data.plastico_bolha ?? 0),
      sacolaAntifraude: Number(data.sacola_antifraude ?? 0),
      freteSubsidio: Number(data.frete_subsidio),
      antifraude: Number(data.antifraude),
      perdaPct: Number(data.perda_pct),
      margemAlvo: Number(data.margem_alvo),
      adsMensal: data.ads_mensal === null ? null : Number(data.ads_mensal),
      descontoPixPct: Number(data.desconto_pix_pct ?? 0),
      fatiaPixPct: Number(data.fatia_pix_pct ?? 0),
    }
  },

  async receitaMensal() {
    const { data, error } = await supabaseServer().from('receita_mensal').select('*').maybeSingle()
    if (error) throw error
    return {
      pedidos: Number(data?.pedidos ?? 0),
      receitaProdutos: Number(data?.receita_produtos ?? 0),
    }
  },

  async perfumesBase() {
    return lerPerfumesBase({ apenasAtivos: true })
  },

  async perfumesBaseTodos() {
    return lerPerfumesBase({ apenasAtivos: false })
  },

  async produtosDerivados() {
    const data = await tudoDe('produtos_derivados', (de, ate) =>
      supabaseServer()
        .from('produtos_derivados')
        .select('base_id, variante, envasadas, reservadas, preco_praticado, sku, shopify_variant_id')
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
      sku: (d.sku as string | null) ?? null,
      shopifyVariantId: (d.shopify_variant_id as string | null) ?? null,
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
        'id, base_id, fornecedor, volume_ml, custo_total, entrada_em, encerrado_em, ' +
          'perfumes_base(nome), lote_saidas(id, ocorrida_em, ordem_id, ml, unidades, variante, motivo)',
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
        custoTotal: Number(l.custo_total) || undefined,
        entrada: l.entrada_em,
        encerradoEm: l.encerrado_em,
        saidas: saidas.map((s) => ({
          id: s.id ?? null,
          data: s.ocorrida_em,
          ref: s.ordem_id,
          ml: Number(s.ml),
          unidades: s.unidades,
          variante: (s.variante as VarianteMl | null) ?? null,
          motivo: s.motivo,
        })),
      }
    })
  },

  async pedidos() {
    const { data, error } = await supabaseServer()
      .from('pedidos')
      .select(
        'id, canal, valor, frete, cashback, pagamento, envio, comprado_em, entregue_em, ' +
          'destino, cep, logradouro, peso, dimensoes, gateway, rastreio, situacao, ' +
          'servico_frete, rastreio_url, rastreio_lido_em, entrega_local, ' +
          'producao_em, enviado_shopify_em, estoque_baixado_em, estoque_baixado_ml, ' +
          'shopify_numero, entrega_shopify_em, prazo_entrega_dias, entrega_prevista_em, ' +
          'clientes(nome, email, cpf, telefone), pedido_itens(descricao, variante, preco, base_id)',
      )
      .order('comprado_em', { ascending: false })
    if (error) throw error
    const dia = 24 * 60 * 60 * 1000
    const linhas = (data ?? []) as unknown as LinhaPedido[]

    // A foto de cada item vem do catálogo. O caminho titular é o base_id que
    // a importação casou por SKU; os itens anteriores ao casamento ficam sem
    // ele, e para esses o nome do perfume dentro da descrição é a rede — a
    // descrição da Yampi é "Nome do Perfume (Decant) 5ml", que contém o nome
    // do catálogo por inteiro.
    const { data: bases } = await supabaseServer()
      .from('perfumes_base')
      .select('id, nome, imagem_url')
      .not('imagem_url', 'is', null)
    const imagemPorId = new Map<string, string>()
    const porNome: { nome: string; url: string }[] = []
    for (const b of (bases ?? []) as { id: string; nome: string; imagem_url: string }[]) {
      imagemPorId.set(b.id, b.imagem_url)
      porNome.push({ nome: b.nome.toLowerCase(), url: b.imagem_url })
    }
    // Nomes mais longos primeiro: "Sauvage Elixir" precisa vencer "Sauvage".
    porNome.sort((a, b) => b.nome.length - a.nome.length)
    const imagemDe = (baseId: string | null, descricao: string): string | null => {
      if (baseId) {
        const direta = imagemPorId.get(baseId)
        if (direta) return direta
      }
      const alvo = descricao.toLowerCase()
      return porNome.find((c) => alvo.includes(c.nome))?.url ?? null
    }
    return linhas.map((p): Pedido => {
      const cliente = p.clientes
      const itens = p.pedido_itens ?? []
      return {
        id: p.id,
        cliente: cliente?.nome ?? '—',
        email: cliente?.email ?? '',
        cpf: (cliente?.cpf ?? '').replace(/\D/g, ''),
        telefone: cliente?.telefone ?? '',
        // Mesmo motivo de Movimentações: timestamptz cru estoura a coluna e
        // aparece truncado como "2026-08-09T04".
        data: dataCurta(p.comprado_em),
        canal: capitalizaCanal(p.canal),
        valor: Number(p.valor),
        frete: Number(p.frete),
        cashback: Number(p.cashback),
        pagamento: p.pagamento,
        envio: rotuloEnvio(p.envio),
        // O prazo de devolução corre da entrega REAL. Enquanto a varredura
        // não repõe o escaneamento da transportadora, a data prometida serve
        // de relógio reserva — ela é ≥ a entrega de fato, então o cliente
        // nunca perde prazo porque o nosso dado estava faltando.
        diasDesdeEntrega: (() => {
          const base =
            p.entregue_em ?? (p.situacao === 'entregue' ? p.entrega_prevista_em : null)
          return base ? Math.floor((Date.now() - new Date(base).getTime()) / dia) : null
        })(),
        entregueEm: p.entregue_em,
        destino: p.destino ?? '',
        cep: p.cep ?? '',
        rua: p.logradouro ?? '',
        peso: p.peso ?? '',
        dimensoes: p.dimensoes ?? '',
        gateway: identificarFrete(p.servico_frete, p.rastreio).gateway,
        rastreio: p.rastreio,
        // A tela do mockup mostra transportadora e rastreio na LINHA, sem
        // abrir o pedido. Resolver aqui evita que cada tela repita a regra —
        // e ela não é trivial: o rótulo do Melhor Envio não é nome de empresa.
        situacao: (p.situacao ?? 'pago') as Pedido['situacao'],
        transportadora: (() => {
          const nome = identificarFrete(p.servico_frete, p.rastreio).transportadora
          return nome === 'Não informada' ? null : nome
        })(),
        servicoFrete: p.servico_frete,
        rastreioUrl: p.rastreio_url,
        rastreioLidoEm: p.rastreio_lido_em,
        entregaLocal: Boolean(p.entrega_local),
        compradoEm: p.comprado_em,
        producaoEm: p.producao_em,
        enviadoShopifyEm: p.enviado_shopify_em,
        shopifyNumero: p.shopify_numero,
        entregaShopifyEm: p.entrega_shopify_em,
        prazoEntregaDias: p.prazo_entrega_dias === null ? null : Number(p.prazo_entrega_dias),
        entregaPrevistaEm: p.entrega_prevista_em,
        estoqueBaixadoEm: p.estoque_baixado_em,
        estoqueBaixadoMl: p.estoque_baixado_ml === null ? null : Number(p.estoque_baixado_ml),
        itens: itens.map((i) => ({
          perfume: i.descricao,
          marca: '',
          variante: (i.variante ?? 5) as VarianteMl,
          preco: Number(i.preco),
          imagem: imagemDe(i.base_id, i.descricao),
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
          'responsavel, saldo_ml, saldo_anterior_ml, reserva_ml, saldo_reservado_ml, ' +
          'pedido_id, perfumes_base(nome)',
      )
      .order('ocorrida_em', { ascending: false })
      // O ledger cresce rápido com reserva e liberação por pedido: 600 linhas
      // cobrem semanas de operação sem estourar a leitura.
      .limit(600)
    if (error) throw error
    const linhas = (data ?? []) as unknown as LinhaMovimentacao[]
    return linhas.map(
      (m): Movimentacao => ({
        id: m.id,
        baseId: m.base_id,
        perfume: m.perfumes_base?.nome ?? m.base_id,
        tipo: m.tipo,
        // Vem `timestamptz` cru do Postgres; a coluna tem 104px e a tabela
        // não quebra linha — sem formatar, a data invade a coluna do tipo.
        data: dataCurta(m.ocorrida_em),
        volumeMl: Number(m.volume_ml),
        liquidoMl: m.liquido_ml === null ? null : Number(m.liquido_ml),
        ref: m.ref ?? '',
        motivo: m.descricao,
        responsavel: m.responsavel ?? '—',
        saldoMl: m.saldo_ml === null ? null : Number(m.saldo_ml),
        saldoAnteriorMl: m.saldo_anterior_ml === null || m.saldo_anterior_ml === undefined
          ? null
          : Number(m.saldo_anterior_ml),
        reservaMl: m.reserva_ml === null || m.reserva_ml === undefined ? null : Number(m.reserva_ml),
        saldoReservadoMl:
          m.saldo_reservado_ml === null || m.saldo_reservado_ml === undefined
            ? null
            : Number(m.saldo_reservado_ml),
        pedidoId: m.pedido_id ?? null,
      }),
    )
  },

  async inventarioAberto() {
    const { data, error } = await supabaseServer()
      .from('inventarios')
      .select('id, competencia')
      .is('fechado_em', null)
      .order('competencia', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    return data ? { id: data.id as string, competencia: data.competencia as string } : null
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

    // A apuração vem da view: é ela que soma o que se moveu DEPOIS do
    // congelamento. Ler a contagem crua faria a tela comparar o contado com
    // um saldo antigo e inventar divergência a cada venda do dia.
    const { data, error } = await supabaseServer()
      .from('inventario_apuracao')
      .select('base_id, perfume, sistema_ml, movimentos_ml, contado_ml, responsavel, contado_em')
      .eq('inventario_id', aberto.id)
    if (error) throw error
    const linhas = (data ?? []) as unknown as LinhaInventarioDb[]
    return linhas.map(
      (i): ContagemInventario => ({
        baseId: i.base_id,
        perfume: i.perfume ?? i.base_id,
        sistemaMl: Number(i.sistema_ml),
        movimentosMl: Number(i.movimentos_ml ?? 0),
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
  /**
   * Envios derivados dos pedidos.
   *
   * Não há tabela de rastreamento porque não há de onde preenchê-la: a Yampi
   * devolve o código e a confirmação de entrega, nunca o histórico de
   * escaneamentos da transportadora. O que o ERP sabe são os marcos — compra
   * paga, código emitido, envio espelhado, entrega confirmada — e é isso que
   * o domínio monta.
   */
  async envios() {
    const { data, error } = await supabaseServer()
      .from('pedidos')
      .select(
        'id, destino, pagamento, envio, comprado_em, entregue_em, gateway, servico_frete, ' +
          'rastreio, enviado_shopify_em, entrega_shopify_em, clientes(nome)',
      )
      .order('comprado_em', { ascending: false })
      .limit(500)
    if (error) throw error

    const linhas = (data ?? []) as unknown as {
      id: string
      destino: string | null
      pagamento: string
      envio: string
      comprado_em: string
      entregue_em: string | null
      gateway: string | null
      servico_frete: string | null
      rastreio: string | null
      enviado_shopify_em: string | null
      entrega_shopify_em: string | null
      clientes: { nome: string } | null
    }[]

    return linhas.map((p) => {
      const frete = identificarFrete(p.servico_frete, p.rastreio)
      return montarEnvio({
        id: p.id,
        cliente: p.clientes?.nome ?? 'Cliente sem cadastro',
        destino: p.destino ?? '—',
        transportadora: frete.transportadora,
        gateway: frete.gateway,
        rastreio: p.rastreio ?? '',
        envio: rotuloEnvio(p.envio),
        pago: p.pagamento === 'pago',
        compradoEm: p.comprado_em,
        entregueEm: p.entregue_em,
        enviadoShopifyEm: p.enviado_shopify_em,
        entregaShopifyEm: p.entrega_shopify_em,
      })
    })
  },
  /**
   * Ocorrências com o pedido e o cliente juntos.
   *
   * `dias` e `prazo` são calculados na leitura: gravar "faltam 3 dias" numa
   * coluna criaria um número que envelhece sozinho à meia-noite.
   */
  async ocorrencias() {
    const { data, error } = await supabaseServer()
      .from('ocorrencias')
      .select(
        'id, pedido_id, tipo, estado, aberta_em, prazo, acao, ' +
          'pedidos(valor, destino, gateway, servico_frete, rastreio, clientes(nome))',
      )
      .order('aberta_em', { ascending: false })
      .limit(300)
    if (error) throw error

    const linhas = (data ?? []) as unknown as {
      id: string
      pedido_id: string
      tipo: string
      estado: string
      aberta_em: string
      prazo: string | null
      acao: string
      pedidos: {
        valor: number | string
        destino: string | null
        gateway: string | null
        servico_frete: string | null
        rastreio: string | null
        clientes: { nome: string } | null
      } | null
    }[]

    const dia = 24 * 60 * 60 * 1000
    const hoje = Date.now()

    return linhas.map((o): Ocorrencia => ({
      id: o.id,
      pedidoId: o.pedido_id,
      cliente: o.pedidos?.clientes?.nome ?? 'Cliente sem cadastro',
      destino: o.pedidos?.destino ?? '—',
      ...identificarFrete(o.pedidos?.servico_frete ?? null, o.pedidos?.rastreio ?? null),
      rastreio: o.pedidos?.rastreio ?? '',
      tipo: o.tipo as Ocorrencia['tipo'],
      dias: Math.max(0, Math.floor((hoje - Date.parse(o.aberta_em)) / dia)),
      // Positivo = dias que ainda restam; negativo = dias além do combinado.
      prazo: o.prazo ? Math.round((Date.parse(`${o.prazo}T12:00:00Z`) - hoje) / dia) : 0,
      abertura: new Date(o.aberta_em).toLocaleDateString('pt-BR'),
      estado: o.estado as Ocorrencia['estado'],
      acao: o.acao,
      valor: Number(o.pedidos?.valor ?? 0),
    }))
  },
  /**
   * Devoluções abertas no portal.
   *
   * `itens` do ERP é a CONFERÊNCIA — o volume medido quando o pacote chega —,
   * não a escolha do cliente. Antes de o pacote chegar a lista é vazia, e a
   * triagem diz que ainda não há o que decidir. Usar a escolha do cliente como
   * se fosse medição faria a triagem aprovar pelo que ele disse.
   */
  async solicitacoes() {
    const { data, error } = await supabaseServer()
      .from('solicitacoes_devolucao')
      .select(
        'protocolo, pedido_id, tipo, motivo, comentario, itens, fotos, status, aberta_em, ' +
          'reverso, lacre, conferencia, foto_nivel, foto_lacre, ' +
          'resolucao, reembolso_valor, reembolso_forma, reembolso_em, comprovante_reembolso, troca_pedido_id, ' +
          'pedidos(valor, destino, gateway, rastreio, entregue_em, entrega_prevista_em, situacao, clientes(nome, email, telefone, cpf))',
      )
      .order('aberta_em', { ascending: false })
      .limit(200)
    if (error) throw error

    const linhas = (data ?? []) as unknown as LinhaSolicitacao[]
    const dia = 24 * 60 * 60 * 1000

    // Fotos e comprovantes vivem num bucket privado: a ficha os exibe por URL
    // assinada de vida curta, geradas num lote só — uma chamada por leitura.
    const caminhos = linhas.flatMap(
      (s) => [s.foto_nivel, s.foto_lacre, s.comprovante_reembolso].filter(Boolean) as string[],
    )
    const urlAssinada = new Map<string, string>()
    if (caminhos.length) {
      const { data: assinadas } = await supabaseServer()
        .storage.from('devolucoes')
        .createSignedUrls(caminhos, 60 * 60)
      for (const a of assinadas ?? []) {
        if (a.path && a.signedUrl) urlAssinada.set(a.path, a.signedUrl)
      }
    }

    return linhas.map((s): SolicitacaoErp => {
      const cliente = s.pedidos?.clientes
      // Mesmo relógio reserva de `pedidos()`: sem a entrega real, vale a
      // prometida — nunca menos prazo para o cliente por dado nosso faltando.
      const entregue =
        s.pedidos?.entregue_em ??
        (s.pedidos?.situacao === 'entregue' ? s.pedidos?.entrega_prevista_em : null)
      const diasDesdeEntrega = entregue
        ? Math.floor((Date.now() - Date.parse(entregue)) / dia)
        : null
      const prazo = statusDevolucao(diasDesdeEntrega)
      const cpf = (cliente?.cpf ?? '').replace(/\D/g, '')

      return {
        id: s.protocolo,
        pedidoId: s.pedido_id,
        cliente: cliente?.nome ?? 'Cliente sem cadastro',
        destino: s.pedidos?.destino ?? '—',
        // Documento mascarado: a tela de triagem não precisa do CPF inteiro,
        // e o que não aparece não vaza em print de tela.
        identificacao: cpf ? `CPF ${cpf.slice(0, 3)}.***.***-${cpf.slice(-2)}` : '—',
        email: cliente?.email ?? '',
        telefone: cliente?.telefone ?? '',
        abertura: new Date(s.aberta_em).toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        }),
        abertaEmIso: s.aberta_em,
        tipo: s.tipo,
        motivo: s.motivo,
        comentario: s.comentario,
        valor: Number(s.pedidos?.valor ?? 0),
        prazo: prazo.mensagem,
        prazoOk: prazo.elegivel,
        status: s.status,
        gateway: s.pedidos?.gateway === 'frenet' ? 'Frenet' : 'Melhor Envio',
        etiquetaIda: s.pedidos?.rastreio ?? '',
        reverso: s.reverso,
        lacre: s.lacre,
        fotos: [
          s.fotos?.nivel ? 'Volume no frasco (confirmada)' : '',
          s.fotos?.lacre ? 'Lacre / recrave (confirmada)' : '',
        ].filter(Boolean),
        fotosArquivos: [
          s.foto_nivel && urlAssinada.get(s.foto_nivel)
            ? { rotulo: 'Nível do líquido', url: urlAssinada.get(s.foto_nivel)! }
            : null,
          s.foto_lacre && urlAssinada.get(s.foto_lacre)
            ? { rotulo: 'Lacre / dano', url: urlAssinada.get(s.foto_lacre)! }
            : null,
        ].filter(Boolean) as { rotulo: string; url: string }[],
        resolucao: s.resolucao,
        reembolsoValor: s.reembolso_valor === null ? null : Number(s.reembolso_valor),
        reembolsoForma: s.reembolso_forma,
        reembolsoEm: s.reembolso_em,
        comprovanteUrl: s.comprovante_reembolso
          ? (urlAssinada.get(s.comprovante_reembolso) ?? null)
          : null,
        trocaPedidoId: s.troca_pedido_id,
        itens: (s.conferencia ?? []).map((i) =>
          aferirItem(i.perfume, i.variante, Number(i.medido_ml), i.observacao ?? ''),
        ),
        itensSolicitados: s.itens ?? [],
      }
    })
  },

  async lancamentos() {
    const { data, error } = await supabaseServer()
      .from('lancamentos')
      .select(
        'id, ocorrido_em, descricao, categoria, conta_id, tipo, valor, recebido, ' +
          'baixado_em, vence_em, recorrente, recorrencia, serie_id, origem, ' +
          'contas_bancarias(nome)',
      )
      .order('ocorrido_em', { ascending: false })
      .limit(500)
    if (error) throw error
    const linhas = (data ?? []) as unknown as LinhaLancamento[]
    const hoje = new Date().toISOString().slice(0, 10)
    return linhas.map(
      (l): Lancamento => ({
        id: l.id,
        data: dataBr(l.ocorrido_em),
        descricao: l.descricao,
        categoria: l.categoria ?? 'Sem categoria',
        conta: l.contas_bancarias?.nome ?? '—',
        tipo: l.tipo,
        valor: Number(l.valor),
        recebido: Number(l.recebido ?? 0),
        // O status não é campo: é a leitura do recebido contra o total e o
        // vencimento. Um enum gravado envelheceria sozinho à meia-noite do
        // vencimento, sem ninguém ter tocado no lançamento.
        status: statusDoLancamento(
          {
            tipo: l.tipo,
            valor: Number(l.valor),
            recebido: Number(l.recebido ?? 0),
            venceEm: l.vence_em,
          },
          hoje,
        ),
        recorrente: l.recorrente,
        recorrencia: l.recorrencia ?? null,
        serieId: l.serie_id ?? null,
        categoriaId: l.categoria ?? '',
        contaId: l.conta_id ?? '',
        ocorridoEm: l.ocorrido_em,
        venceEm: l.vence_em,
        origem: l.origem,
      }),
    )
  },

  async contas() {
    const { data, error } = await supabaseServer()
      .from('contas_saldo')
      .select('*')
      .eq('ativa', true)
      .order('principal', { ascending: false })
      .order('nome')
    if (error) throw error
    return (data ?? []).map(
      (c): ContaBancaria => ({
        id: c.id as string,
        nome: c.nome as string,
        tipo: c.tipo as string,
        banco: c.banco as string,
        saldo: Number(c.saldo),
        entradasMes: Number(c.entradas_mes),
        saidasMes: Number(c.saidas_mes),
        uso: (c.uso as string) || '—',
        principal: Boolean(c.principal),
        saldoInformado: c.saldo_informado === null ? null : Number(c.saldo_informado),
        saldoInformadoEm: (c.saldo_informado_em as string) ?? null,
      }),
    )
  },

  async repasses() {
    const { data, error } = await supabaseServer()
      .from('repasses')
      .select(
        'pedido_id, origem, taxa_pct, taxa_real, meio, recebido, ' +
          'pedidos!inner(valor, pagamento, comprado_em)',
      )
      .order('comprado_em', { ascending: false, referencedTable: 'pedidos' })
      .limit(1000)
    if (error) throw error
    const linhas = (data ?? []) as unknown as LinhaRepasse[]
    return linhas.map((r): Repasse => {
      const compradoEm = String(r.pedidos.comprado_em ?? '').slice(0, 10)
      return {
        pedidoId: r.pedido_id,
        // A origem gravada carregava o status do pedido na época da previsão
        // ("Yampi · Divergente"), que colidia com o status da conciliação na
        // mesma tabela. O meio real do gateway diz mais.
        origem: [r.origem.split(' · ')[0] || 'Yampi', r.meio].filter(Boolean).join(' · '),
        esperado: Number(r.pedidos.valor),
        taxaPct: Number(r.taxa_pct),
        taxaReal: r.taxa_real === null || r.taxa_real === undefined ? null : Number(r.taxa_real),
        meio: r.meio ?? null,
        recebido: r.recebido === null ? null : Number(r.recebido),
        pagamentoConfirmado: r.pedidos.pagamento === 'pago',
        compradoEm,
        foraDaJanela: Boolean(compradoEm && compradoEm < INICIO_DA_OPERACAO),
      }
    })
  },

  async categorias() {
    const sb = supabaseServer()
    const [{ data: cats, error: erroCats }, { data: lancs, error: erroLancs }] = await Promise.all([
      sb.from('categorias_financeiras').select('nome, natureza').eq('ativa', true).order('nome'),
      sb.from('lancamentos').select('categoria, valor').not('baixado_em', 'is', null),
    ])
    if (erroCats) throw erroCats
    if (erroLancs) throw erroLancs

    // O total da categoria é a soma dos lançamentos, não um campo — assim
    // classificar um lançamento já muda o relatório, sem passo de apuração.
    const soma = new Map<string, { valor: number; qtd: number }>()
    for (const l of lancs ?? []) {
      const chave = (l.categoria as string | null) ?? ''
      const atual = soma.get(chave) ?? { valor: 0, qtd: 0 }
      soma.set(chave, { valor: atual.valor + Number(l.valor), qtd: atual.qtd + 1 })
    }

    return (cats ?? []).map((c): CategoriaFinanceira => {
      const s = soma.get(c.nome as string) ?? { valor: 0, qtd: 0 }
      return {
        nome: c.nome as string,
        natureza: c.natureza as CategoriaFinanceira['natureza'],
        valorMes: s.valor,
        lancamentos: s.qtd,
      }
    })
  },


  /**
   * O cliente do CRM é DERIVADO dos pedidos, não uma tabela paralela.
   *
   * Total, número de compras, última compra e status saem do que a pessoa
   * fez. Uma tabela com esses campos precisaria ser recalculada a cada venda
   * e divergiria do extrato no primeiro esquecimento.
   */
  async clientes() {
    const sb = supabaseServer()
    const { data, error } = await sb
      .from('pedidos')
      .select('valor, comprado_em, pagamento, destino, clientes(nome, email, telefone)')
      .not('cliente_id', 'is', null)
      .limit(2000)
    if (error) throw error

    const linhas = (data ?? []) as unknown as {
      valor: number | string
      comprado_em: string
      pagamento: string
      destino: string | null
      clientes: { nome: string; email: string; telefone: string | null } | null
    }[]

    const porEmail = new Map<
      string,
      {
        nome: string
        telefone: string
        cidade: string
        total: number
        pedidos: number
        ultima: number
      }
    >()
    for (const l of linhas) {
      const c = l.clientes
      if (!c) continue
      const atual = porEmail.get(c.email) ?? {
        nome: c.nome,
        telefone: c.telefone ?? '',
        cidade: '',
        total: 0,
        pedidos: 0,
        ultima: 0,
      }
      const quando = new Date(l.comprado_em).getTime()
      porEmail.set(c.email, {
        nome: c.nome,
        telefone: c.telefone ?? atual.telefone,
        // A cidade vem do pedido mais recente — é para onde a pessoa recebe hoje.
        cidade: quando >= atual.ultima ? (l.destino ?? atual.cidade) : atual.cidade,
        // Pedido não pago não é compra: contá-lo inflaria o VIP com carrinho
        // que nunca virou dinheiro.
        total: atual.total + (l.pagamento === 'pago' ? Number(l.valor) : 0),
        pedidos: atual.pedidos + (l.pagamento === 'pago' ? 1 : 0),
        ultima: Math.max(atual.ultima, quando),
      })
    }

    const agora = Date.now()
    const dia = 24 * 60 * 60 * 1000
    return (
      [...porEmail.entries()]
        // Quem nunca teve pedido PAGO não é cliente — é visitante com cadastro.
        // Sem este corte, um pedido estornado colocava a pessoa na lista com
        // R$ 0,00 comprados, como se fosse compradora.
        .filter(([, c]) => c.pedidos > 0)
    )
      .map(([email, c]): ClienteCrm => {
        const dias = c.ultima ? Math.floor((agora - c.ultima) / dia) : null
        return {
          nome: c.nome,
          cidade: c.cidade || '—',
          iniciais: iniciaisDe(c.nome),
          email,
          telefone: c.telefone,
          total: c.total,
          pedidos: c.pedidos,
          ultimaCompra: c.ultima ? dataCurta(new Date(c.ultima).toISOString()) : '—',
          status: statusCliente(c.total, c.pedidos, dias),
        }
      })
      .sort((a, b) => b.total - a.total)
  },
}

/**
 * Formas das linhas com embed, espelhando `supabase/migrations`.
 * Substituíveis pelos tipos gerados (`supabase gen types typescript`).
 */
interface LinhaLancamento {
  id: string
  ocorrido_em: string
  descricao: string
  categoria: string | null
  conta_id: string | null
  tipo: 'entrada' | 'saida'
  valor: number | string
  recebido: number | string | null
  baixado_em: string | null
  vence_em: string | null
  recorrente: boolean
  recorrencia: string | null
  serie_id: string | null
  origem: string
  contas_bancarias: { nome: string } | null
}

interface LinhaRepasse {
  taxa_real: number | string | null
  meio: string | null
  pedido_id: string
  origem: string
  taxa_pct: number | string
  recebido: number | string | null
  pedidos: { valor: number | string; pagamento: string; comprado_em: string | null }
}


/** `2026-08-09` → `09/08/2026`, como as telas de financeiro mostram. */
function dataBr(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-')
  return d ? `${d}/${m}/${a}` : iso
}

/** `2026-08-09T14:22:00Z` → `09/08 14:22`, que é como as telas mostram. */
function dataCurta(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  // Sempre no fuso da operação: no deploy o servidor roda em UTC, e usar a
  // hora local dele mostraria todo pedido 3 horas adiantado.
  return d
    .toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    })
    .replace(',', '')
}


interface LinhaLote {
  id: string
  base_id: string
  fornecedor: string
  volume_ml: number | string
  custo_total: number | string | null
  entrada_em: string
  encerrado_em: string | null
  perfumes_base: { nome: string } | null
  lote_saidas: {
    id: string
    ocorrida_em: string
    ordem_id: string | null
    ml: number | string
    unidades: number | null
    variante: number | null
    motivo: string | null
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
  situacao: string | null
  servico_frete: string | null
  rastreio_url: string | null
  rastreio_lido_em: string | null
  entrega_local: boolean | null
  producao_em: string | null
  enviado_shopify_em: string | null
  shopify_numero: string | null
  entrega_shopify_em: string | null
  prazo_entrega_dias: number | null
  entrega_prevista_em: string | null
  estoque_baixado_em: string | null
  estoque_baixado_ml: number | string | null
  clientes: { nome: string; email: string; cpf: string | null; telefone: string } | null
  pedido_itens: {
    descricao: string
    variante: number | null
    preco: number | string
    base_id: string | null
  }[]
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
  saldo_anterior_ml: number | string | null
  reserva_ml: number | string | null
  saldo_reservado_ml: number | string | null
  pedido_id: string | null
  perfumes_base: { nome: string } | null
}

/** Forma da linha de `inventario_apuracao`, a view que soma os movimentos. */
interface LinhaInventarioDb {
  base_id: string
  perfume: string | null
  sistema_ml: number | string
  movimentos_ml: number | string | null
  contado_ml: number | string | null
  responsavel: string | null
  contado_em: string | null
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

interface LinhaSolicitacao {
  protocolo: string
  pedido_id: string
  tipo: SolicitacaoErp['tipo']
  motivo: string
  comentario: string
  itens: string[]
  fotos: { nivel?: boolean; lacre?: boolean } | null
  status: SolicitacaoErp['status']
  aberta_em: string
  reverso: string
  lacre: SolicitacaoErp['lacre']
  conferencia: { perfume: string; variante: VarianteMl; medido_ml: number | string; observacao?: string }[]
  foto_nivel: string | null
  foto_lacre: string | null
  resolucao: string | null
  reembolso_valor: number | string | null
  reembolso_forma: 'pix' | 'estorno-cartao' | null
  reembolso_em: string | null
  comprovante_reembolso: string | null
  troca_pedido_id: string | null
  pedidos: {
    valor: number | string
    destino: string | null
    gateway: string | null
    rastreio: string | null
    entregue_em: string | null
    entrega_prevista_em: string | null
    situacao: string | null
    clientes: { nome: string; email: string; telefone: string; cpf: string } | null
  } | null
}

export function repositorio(): Repositorio {
  return supabaseConfigurado() ? repositorioSupabase : repositorioFixtures
}

/** Origem dos dados, para o rodapé da sidebar dizer a verdade. */
export function origemDados(): 'supabase' | 'fixtures' {
  return supabaseConfigurado() ? 'supabase' : 'fixtures'
}
