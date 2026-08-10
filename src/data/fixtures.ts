/**
 * Dados fictícios do handoff (CNPJ, endereço, clientes, custos e preços são
 * inventados). Servem para as telas renderizarem antes do Supabase estar
 * populado — a migration em `supabase/migrations` é o schema de verdade.
 *
 * Nada aqui é KPI pré-calculado: são só os fatos. Toda grandeza mostrada na
 * tela é derivada destes registros pelas funções de `src/domain`.
 */

import { aferirItem } from '@/domain'
import type {
  CampanhaMkt,
  CategoriaFinanceira,
  CupomPromo,
  EtapaFluxo,
  FluxoEmail,
  FonteConcorrente,
  GiftbackEmitido,
  ItemVitrine,
  Kit,
  ContaBancaria,
  ContagemInventario,
  EstadoLacre,
  Envio,
  ItemAferido,
  Lancamento,
  Lote,
  Movimentacao,
  Ocorrencia,
  OrdemProducao,
  Pedido,
  PerfumeBase,
  ProdutoDerivado,
  RegraCashback,
  Repasse,
  SaldoCashback,
  StatusSolicitacao,
  TicketAtendimento,
  TipoSolicitacao,
  VarianteMl,
} from '@/domain'

export const PERFUMES_BASE: PerfumeBase[] = [
  { id: 'bac', nome: 'Baccarat Rouge 540', marca: 'Maison Francis', genero: 'Unissex', custoPorMl: 3.1, volumeMl: 640, consumoDiarioMl: 51 },
  { id: 'blu', nome: 'Bleu de Chanel', marca: 'Chanel', genero: 'Masculino', custoPorMl: 2.9, volumeMl: 760, consumoDiarioMl: 14 },
  { id: 'sau', nome: 'Sauvage Elixir', marca: 'Dior', genero: 'Masculino', custoPorMl: 2.6, volumeMl: 1180, consumoDiarioMl: 30 },
  { id: 'erb', nome: 'Erba Pura', marca: 'Xerjoff', genero: 'Unissex', custoPorMl: 3.95, volumeMl: 520, consumoDiarioMl: 25 },
  { id: 'ave', nome: 'Aventus', marca: 'Creed', genero: 'Masculino', custoPorMl: 4.15, volumeMl: 410, consumoDiarioMl: 11 },
  { id: 'del', nome: 'Delina', marca: 'Parfums de Marly', genero: 'Feminino', custoPorMl: 3.8, volumeMl: 90, consumoDiarioMl: 22 },
  { id: 'oud', nome: 'Oud Wood', marca: 'Tom Ford', genero: 'Masculino', custoPorMl: 4.4, volumeMl: 0, consumoDiarioMl: 6 },
  { id: 'gg', nome: 'Good Girl', marca: 'Carolina Herrera', genero: 'Feminino', custoPorMl: 2.45, volumeMl: 340, consumoDiarioMl: 3 },
]

export const PRODUTOS_DERIVADOS: ProdutoDerivado[] = [
  { baseId: 'bac', variante: 5, envasadas: 8, reservadas: 3, precoPraticado: 79.9 },
  { baseId: 'bac', variante: 10, envasadas: 4, reservadas: 1, precoPraticado: 139.9 },
  { baseId: 'sau', variante: 5, envasadas: 14, reservadas: 5, precoPraticado: 54.9 },
  { baseId: 'sau', variante: 15, envasadas: 6, reservadas: 2, precoPraticado: 148.9 },
  { baseId: 'erb', variante: 5, envasadas: 7, reservadas: 1, precoPraticado: 86.9 },
  { baseId: 'erb', variante: 10, envasadas: 3, reservadas: 0, precoPraticado: 154.9 },
  { baseId: 'ave', variante: 10, envasadas: 5, reservadas: 2, precoPraticado: 164.9 },
  { baseId: 'ave', variante: 3, envasadas: 9, reservadas: 0, precoPraticado: 42.9 },
  { baseId: 'blu', variante: 10, envasadas: 6, reservadas: 1, precoPraticado: 118.9 },
  { baseId: 'blu', variante: 3, envasadas: 12, reservadas: 3, precoPraticado: 38.9 },
  { baseId: 'del', variante: 5, envasadas: 2, reservadas: 2, precoPraticado: 62.9 },
  { baseId: 'gg', variante: 5, envasadas: 4, reservadas: 0, precoPraticado: 58.9 },
]

/**
 * O que está publicado na Shopify hoje. Ausente = 20, porque o cliente sempre
 * preenche o teto e decrementa à mão a partir dali.
 */
export const SHOPIFY_PUBLICADO: Record<string, number> = {
  'del|15': 20,
  'del|10': 20,
  'gg|10': 12,
  'oud|5': 20,
  'bac|15': 8,
}

/** Preços praticados hoje na vitrine, por base e variante. */
export const PRECO_PRATICADO: Record<string, Partial<Record<VarianteMl, number>>> = {
  bac: { 5: 79.9, 10: 139.9 },
  oud: { 5: 94.9, 10: 169.9 },
  del: { 5: 62.9, 10: 149.9 },
  sau: { 5: 54.9, 10: 104.9 },
  erb: { 5: 86.9, 10: 154.9 },
  ave: { 5: 89.9, 10: 164.9 },
  blu: { 5: 74.9, 10: 118.9 },
  gg: { 5: 58.9, 10: 104.9 },
}

/** Fontes de coleta de preço dos concorrentes. */
export const CONCORRENTES_FONTES: FonteConcorrente[] = [
  { id: 'a', nome: 'Decants do Bruno', dominio: 'decantsdobruno.com.br', coleta: 'nuvemshop', status: 'lida', quando: 'hoje 06:12', itensLidos: 148, erro: null },
  { id: 'b', nome: 'Essência Rara', dominio: 'essenciararaperfumes.com', coleta: 'nuvemshop', status: 'lida', quando: 'hoje 06:14', itensLidos: 212, erro: null },
  { id: 'c', nome: 'Frações Nobres', dominio: 'fracoesnobres.com.br', coleta: 'nuvemshop', status: 'parcial', quando: 'hoje 06:18', itensLidos: 63, erro: null },
  { id: 'd', nome: 'Perfume Lab', dominio: 'perfumelab.store', coleta: 'manual', status: 'bloqueada', quando: 'ontem 22:40', itensLidos: 0, erro: 'a loja recusou a leitura (403)' },
]

/** Preços coletados dos concorrentes, por base e variante (5 e 10 ml). */
export const MERCADO: Record<string, Partial<Record<VarianteMl, number[]>>> = {
  bac: { 5: [69.9, 74.9, 72.0], 10: [124.9, 132.0, 128.9] },
  oud: { 5: [84.9, 89.9, 87.5], 10: [158.0, 164.9, 159.9] },
  del: { 5: [74.9, 79.9, 76.0], 10: [136.0, 142.9, 139.0] },
  sau: { 5: [56.9, 59.9, 58.0], 10: [102.9, 109.0, 105.0] },
  erb: { 5: [78.9, 82.0, 80.5], 10: [144.0, 149.9, 146.0] },
  ave: { 5: [82.9, 86.0, 84.0], 10: [152.9, 158.0, 154.9] },
  blu: { 5: [69.9, 72.9, 71.0], 10: [112.9, 119.0, 115.9] },
  gg: { 5: [54.9, 57.9, 56.0], 10: [98.9, 103.0, 100.9] },
}

/**
 * Kits. A disponibilidade NÃO é um campo: deriva do estoque das bases que
 * compõem cada kit (ver `avaliarKit`). Itens sem base (estojo) não bloqueiam.
 */
export const KITS: Kit[] = [
  {
    id: 'kit-amadeirados', nome: 'Kit descoberta · Amadeirados', tag: 'Entrada',
    itens: [
      { baseId: 'bac', label: 'Baccarat Rouge 540 3 ml' },
      { baseId: 'ave', label: 'Aventus 3 ml' },
      { baseId: 'oud', label: 'Oud Wood 3 ml' },
    ],
    preco: 118.9, custoProdutos: 41.2, vendas30: 42,
  },
  {
    id: 'kit-femininos', nome: 'Kit descoberta · Femininos', tag: 'Entrada',
    itens: [
      { baseId: 'del', label: 'Delina 3 ml' },
      { baseId: 'gg', label: 'Good Girl 3 ml' },
      { baseId: 'erb', label: 'Erba Pura 3 ml' },
    ],
    preco: 112.9, custoProdutos: 38.6, vendas30: 31,
  },
  {
    id: 'dupla-assinatura', nome: 'Dupla assinatura', tag: 'Presente',
    itens: [
      { baseId: 'sau', label: 'Sauvage Elixir 10 ml' },
      { baseId: 'blu', label: 'Bleu de Chanel 10 ml' },
    ],
    preco: 214.9, custoProdutos: 68.4, vendas30: 18,
  },
  {
    id: 'kit-presente', nome: 'Kit presente · estojo', tag: 'Presente',
    itens: [
      { baseId: 'bac', label: 'Baccarat Rouge 540 10 ml' },
      { baseId: 'del', label: 'Delina 10 ml' },
      { baseId: null, label: 'Estojo rígido' },
    ],
    preco: 289.9, custoProdutos: 104.3, vendas30: 12,
  },
  {
    id: 'trio-verao', nome: 'Trio verão', tag: 'Sazonal',
    itens: [
      { baseId: 'erb', label: 'Erba Pura 5 ml' },
      { baseId: 'sau', label: 'Sauvage Elixir 5 ml' },
      { baseId: 'ave', label: 'Aventus 5 ml' },
    ],
    preco: 168.9, custoProdutos: 58.9, vendas30: 9,
  },
  {
    id: 'combo-repor', nome: 'Combo repor · 15 ml', tag: 'Recompra',
    itens: [
      { baseId: null, label: 'Qualquer base 15 ml' },
      { baseId: null, label: 'Refil 5 ml' },
    ],
    preco: 232.9, custoProdutos: 79.1, vendas30: 6,
  },
]

const saida = (data: string, ref: string, unidades: number, variante: VarianteMl) => ({
  data,
  ref,
  ml: unidades * variante,
  unidades,
  variante,
  motivo: null,
})

export const LOTES: Lote[] = [
  {
    id: 'LT-095', baseId: 'bac', perfume: 'Baccarat Rouge 540', fornecedor: 'Importadora Aurum',
    volumeMl: 1000, entrada: '26/07/2026', encerradoEm: null,
    saidas: [
      saida('28/07', 'OP-2205', 20, 5), saida('30/07', 'OP-2208', 12, 10),
      saida('02/08', 'OP-2217', 4, 5), saida('03/08', 'OP-2214', 24, 5),
    ],
  },
  {
    id: 'LT-096', baseId: 'sau', perfume: 'Sauvage Elixir', fornecedor: 'Importadora Aurum',
    volumeMl: 1500, entrada: '02/07/2026', encerradoEm: null,
    saidas: [saida('20/07', 'OP-2206', 10, 5), saida('03/08', 'OP-2212', 18, 15)],
  },
  {
    id: 'LT-097', baseId: 'blu', perfume: 'Bleu de Chanel', fornecedor: 'Importadora Aurum',
    volumeMl: 1000, entrada: '12/07/2026', encerradoEm: null,
    saidas: [
      saida('19/07', 'OP-2198', 16, 5), saida('27/07', 'OP-2203', 8, 10),
      saida('01/08', 'OP-2215', 10, 8),
    ],
  },
  {
    id: 'LT-098', baseId: 'erb', perfume: 'Erba Pura', fornecedor: 'Nicho Distribuidora',
    volumeMl: 500, entrada: '02/08/2026', encerradoEm: null, saidas: [],
  },
  {
    id: 'LT-094', baseId: 'gg', perfume: 'Good Girl', fornecedor: 'Nicho Distribuidora',
    volumeMl: 500, entrada: '18/07/2026', encerradoEm: null,
    saidas: [saida('25/07', 'OP-2202', 12, 5), saida('31/07', 'OP-2209', 10, 10)],
  },
  {
    id: 'LT-093', baseId: 'ave', perfume: 'Aventus', fornecedor: 'Importadora Aurum',
    volumeMl: 500, entrada: '10/07/2026', encerradoEm: null,
    saidas: [saida('24/07', 'OP-2200', 6, 10), saida('02/08', 'OP-2216', 10, 3)],
  },
  {
    id: 'LT-091', baseId: 'erb', perfume: 'Erba Pura', fornecedor: 'Nicho Distribuidora',
    volumeMl: 500, entrada: '20/06/2026', encerradoEm: null,
    saidas: [
      saida('02/07', 'OP-2180', 14, 5), saida('18/07', 'OP-2194', 8, 10),
      saida('26/07', 'OP-2201', 30, 5), saida('29/07', 'OP-2207', 6, 10),
      saida('31/07', 'OP-2210', 40, 3),
    ],
  },
  {
    id: 'LT-092', baseId: 'del', perfume: 'Delina', fornecedor: 'Parfums Brasil',
    volumeMl: 500, entrada: '15/06/2026', encerradoEm: null,
    saidas: [
      saida('28/06', 'OP-2172', 30, 5), saida('17/07', 'OP-2192', 14, 10),
      saida('02/08', 'OP-2211', 15, 8),
    ],
  },
  {
    id: 'LT-088', baseId: 'bac', perfume: 'Baccarat Rouge 540', fornecedor: 'Importadora Aurum',
    volumeMl: 500, entrada: '02/05/2026', encerradoEm: '28/07/2026',
    saidas: [
      saida('12/05', 'OP-2088', 20, 5), saida('24/05', 'OP-2101', 12, 10),
      saida('09/06', 'OP-2140', 24, 3), saida('27/06', 'OP-2166', 10, 8),
      saida('14/07', 'OP-2190', 6, 15), saida('26/07', 'OP-2204', 4, 5),
    ],
  },
  {
    id: 'LT-084', baseId: 'sau', perfume: 'Sauvage Elixir', fornecedor: 'Importadora Aurum',
    volumeMl: 1000, entrada: '18/04/2026', encerradoEm: '02/07/2026',
    saidas: [
      saida('29/04', 'OP-2061', 30, 5), saida('15/05', 'OP-2094', 24, 10),
      saida('03/06', 'OP-2128', 40, 3), saida('21/06', 'OP-2158', 18, 15),
      saida('01/07', 'OP-2178', 35, 5),
    ],
  },
  {
    id: 'LT-079', baseId: 'oud', perfume: 'Oud Wood', fornecedor: 'Nicho Distribuidora',
    volumeMl: 250, entrada: '05/04/2026', encerradoEm: '01/08/2026',
    saidas: [
      saida('19/04', 'OP-2054', 10, 5), saida('11/05', 'OP-2090', 8, 10),
      saida('08/06', 'OP-2134', 10, 3), saida('22/07', 'OP-2196', 10, 8),
    ],
  },
]

export const PEDIDOS: Pedido[] = [
  {
    id: '#10482', cliente: 'Camila Rocha', email: 'camila.rocha@email.com', cpf: '30412877010', telefone: '11 98421-0032',
    data: '03/08/2026', canal: 'Shopify', valor: 389.0, frete: 24.9, cashback: 24.9,
    pagamento: 'pago', envio: 'Aguardando envio', diasDesdeEntrega: null, entregueEm: null,
    destino: 'São Paulo · SP', cep: '05435-000', rua: 'Rua Harmonia, 482 · Vila Madalena',
    peso: '0,42 kg', dimensoes: '18 × 12 × 9 cm', gateway: 'Frenet', rastreio: null,
    itens: [
      { perfume: 'Baccarat Rouge 540', marca: 'Maison Francis', variante: 10, preco: 289.0 },
      { perfume: 'Delina', marca: 'Parfums de Marly', variante: 5, preco: 100.0 },
    ],
  },
  {
    id: '#10481', cliente: 'Rafael Andrade', email: 'rafael.andrade@email.com', cpf: '18855204093', telefone: '19 99120-8874',
    data: '03/08/2026', canal: 'Yampi', valor: 245.0, frete: 24.9, cashback: 0,
    pagamento: 'pago', envio: 'Enviado', diasDesdeEntrega: null, entregueEm: null,
    destino: 'Campinas · SP', cep: '13024-110', rua: 'Av. Andrade Neves, 1204 · Centro',
    peso: '0,28 kg', dimensoes: '16 × 10 × 8 cm', gateway: 'Melhor Envio', rastreio: 'OS4471120BR',
    itens: [{ perfume: 'Oud Wood', marca: 'Tom Ford', variante: 15, preco: 220.1 }],
  },
  {
    id: '#10480', cliente: 'Juliana Prado', email: 'ju.prado@email.com', cpf: '04133092122', telefone: '31 98003-1177',
    data: '02/08/2026', canal: 'Shopify', valor: 612.5, frete: 41.2, cashback: 0,
    pagamento: 'divergente', envio: 'Retido', diasDesdeEntrega: null, entregueEm: null,
    destino: 'Belo Horizonte · MG', cep: '30140-071', rua: 'Rua Pernambuco, 907 · Savassi',
    peso: '0,61 kg', dimensoes: '22 × 14 × 10 cm', gateway: 'Melhor Envio', rastreio: 'OS9981204BR',
    itens: [
      { perfume: 'Baccarat Rouge 540', marca: 'Maison Francis', variante: 10, preco: 268.5 },
      { perfume: 'Erba Pura', marca: 'Xerjoff', variante: 15, preco: 214.0 },
      { perfume: 'Good Girl', marca: 'Carolina Herrera', variante: 5, preco: 88.8 },
    ],
  },
  {
    id: '#10479', cliente: 'Tiago Nunes', email: 'tiago.nunes@email.com', cpf: '27790145088', telefone: '41 99887-2210',
    data: '02/08/2026', canal: 'WhatsApp', valor: 298.0, frete: 29.9, cashback: 0,
    pagamento: 'pendente', envio: 'Não iniciado', diasDesdeEntrega: null, entregueEm: null,
    destino: 'Curitiba · PR', cep: '80420-090', rua: 'Al. Dr. Carlos de Carvalho, 318',
    peso: '0,34 kg', dimensoes: '17 × 11 × 9 cm', gateway: 'Frenet', rastreio: null,
    itens: [{ perfume: 'Sauvage Elixir', marca: 'Dior', variante: 15, preco: 268.1 }],
  },
  {
    id: '#10478', cliente: 'Beatriz Lima', email: 'bia.lima@email.com', cpf: '11204877035', telefone: '21 98554-9021',
    data: '26/07/2026', canal: 'Shopify', valor: 513.6, frete: 26.7, cashback: 26.7,
    pagamento: 'pago', envio: 'Entregue', diasDesdeEntrega: 5, entregueEm: '30/07/2026',
    destino: 'Rio de Janeiro · RJ', cep: '22071-020', rua: 'Rua Bulhões de Carvalho, 145 · Copacabana',
    peso: '0,45 kg', dimensoes: '19 × 12 × 9 cm', gateway: 'Frenet', rastreio: 'LGG88214077',
    itens: [
      { perfume: 'Baccarat Rouge 540', marca: 'Maison Francis', variante: 5, preco: 79.9 },
      { perfume: 'Oud Wood', marca: 'Tom Ford', variante: 10, preco: 169.9 },
      { perfume: 'Delina', marca: 'Parfums de Marly', variante: 3, preco: 48.9 },
      { perfume: 'Aventus', marca: 'Creed', variante: 15, preco: 214.9 },
    ],
  },
  {
    id: '#10477', cliente: 'Marcos Ferreira', email: 'marcos.f@email.com', cpf: '39471200164', telefone: '13 99441-7788',
    data: '01/08/2026', canal: 'Yampi', valor: 352.0, frete: 22.4, cashback: 0,
    pagamento: 'pago', envio: 'Aguardando envio', diasDesdeEntrega: null, entregueEm: null,
    destino: 'Santos · SP', cep: '11055-200', rua: 'Av. Ana Costa, 62 · Gonzaga',
    peso: '0,30 kg', dimensoes: '16 × 11 × 8 cm', gateway: 'Frenet', rastreio: null,
    itens: [{ perfume: 'Aventus', marca: 'Creed', variante: 15, preco: 329.6 }],
  },
  {
    id: '#10476', cliente: 'Larissa Duarte', email: 'larissa.d@email.com', cpf: '52208814077', telefone: '62 98220-4410',
    data: '01/08/2026', canal: 'Shopify', valor: 824.9, frete: 31.8, cashback: 31.8,
    pagamento: 'pago', envio: 'Enviado', diasDesdeEntrega: null, entregueEm: null,
    destino: 'Goiânia · GO', cep: '74110-010', rua: 'Rua 9, 1130 · Setor Oeste',
    peso: '0,86 kg', dimensoes: '26 × 16 × 12 cm', gateway: 'Melhor Envio', rastreio: 'OS7712004BR',
    itens: [
      { perfume: 'Bleu de Chanel', marca: 'Chanel', variante: 10, preco: 468.9 },
      { perfume: 'Baccarat Rouge 540', marca: 'Maison Francis', variante: 10, preco: 196.0 },
      { perfume: 'Delina', marca: 'Parfums de Marly', variante: 5, preco: 160.0 },
    ],
  },
  {
    id: '#10475', cliente: 'Eduardo Salles', email: 'edu.salles@email.com', cpf: '64019928140', telefone: '51 99612-3345',
    data: '01/08/2026', canal: 'WhatsApp', valor: 189.0, frete: 27.5, cashback: 0,
    pagamento: 'pendente', envio: 'Não iniciado', diasDesdeEntrega: null, entregueEm: null,
    destino: 'Porto Alegre · RS', cep: '90570-020', rua: 'Rua Mostardeiro, 274 · Moinhos de Vento',
    peso: '0,26 kg', dimensoes: '15 × 10 × 8 cm', gateway: 'Frenet', rastreio: null,
    itens: [{ perfume: 'Bleu de Chanel', marca: 'Chanel', variante: 10, preco: 161.5 }],
  },
  {
    id: '#10474', cliente: 'Ana Clara Mota', email: 'ana.mota@email.com', cpf: '77310455021', telefone: '11 97001-5540',
    data: '28/06/2026', canal: 'Shopify', valor: 168.8, frete: 58.9, cashback: 0,
    pagamento: 'pago', envio: 'Entregue', diasDesdeEntrega: 32, entregueEm: '03/07/2026',
    destino: 'São Paulo · SP', cep: '04532-060', rua: 'Rua Jerônimo da Veiga, 45 · Itaim Bibi',
    peso: '0,44 kg', dimensoes: '19 × 12 × 9 cm', gateway: 'Frenet', rastreio: 'AZ7710455',
    itens: [
      { perfume: 'Erba Pura', marca: 'Xerjoff', variante: 5, preco: 86.9 },
      { perfume: 'Sauvage Elixir', marca: 'Dior', variante: 8, preco: 81.9 },
    ],
  },
  {
    id: '#10402', cliente: 'Beatriz Lima', email: 'bia.lima@email.com', cpf: '11204877035', telefone: '21 98554-9021',
    data: '28/06/2026', canal: 'Shopify', valor: 168.8, frete: 22.4, cashback: 0,
    pagamento: 'pago', envio: 'Entregue', diasDesdeEntrega: 32, entregueEm: '03/07/2026',
    destino: 'Rio de Janeiro · RJ', cep: '22071-020', rua: 'Rua Bulhões de Carvalho, 145 · Copacabana',
    peso: '0,29 kg', dimensoes: '16 × 11 × 8 cm', gateway: 'Frenet', rastreio: 'AZ4471120',
    itens: [
      { perfume: 'Erba Pura', marca: 'Xerjoff', variante: 5, preco: 86.9 },
      { perfume: 'Sauvage Elixir', marca: 'Dior', variante: 8, preco: 81.9 },
    ],
  },
  {
    id: '#10486', cliente: 'Beatriz Lima', email: 'bia.lima@email.com', cpf: '11204877035', telefone: '21 98554-9021',
    data: '02/08/2026', canal: 'Shopify', valor: 289.9, frete: 24.9, cashback: 0,
    pagamento: 'pago', envio: 'Enviado', diasDesdeEntrega: null, entregueEm: null,
    destino: 'Rio de Janeiro · RJ', cep: '22071-020', rua: 'Rua Bulhões de Carvalho, 145 · Copacabana',
    peso: '0,38 kg', dimensoes: '18 × 12 × 9 cm', gateway: 'Frenet', rastreio: 'LGG55120904',
    itens: [
      { perfume: 'Bleu de Chanel', marca: 'Chanel', variante: 10, preco: 118.9 },
      { perfume: 'Good Girl', marca: 'Carolina Herrera', variante: 15, preco: 171.0 },
    ],
  },
]

/**
 * Extrato de movimentações de estoque.
 *
 * Nas saídas, `liquidoMl` é o que entrou no frasco e `volumeMl` é o que saiu do
 * estoque — a diferença é a perda técnica, derivada, nunca lançada à parte.
 * Nos ajustes, `ref` diz a origem: `LT-` é encerramento de lote, `INV-` é
 * divergência de contagem.
 */
export const MOVIMENTACOES: Movimentacao[] = [
  {
    id: 'MV-4412', baseId: 'bac', perfume: 'Baccarat Rouge 540', tipo: 'saida',
    data: '03/08 09:12', volumeMl: -123.6, liquidoMl: 120, ref: 'OP-2214',
    motivo: 'Ordem de produção OP-2214 · 24 un de 5 ml', responsavel: 'Pedro A.', saldoMl: 640,
  },
  {
    id: 'MV-4411', baseId: 'sau', perfume: 'Sauvage Elixir', tipo: 'saida',
    data: '03/08 08:20', volumeMl: -278.1, liquidoMl: 270, ref: 'OP-2212',
    motivo: 'Ordem de produção OP-2212 · 18 un de 15 ml', responsavel: 'Marina F.', saldoMl: 1180,
  },
  {
    id: 'MV-4410', baseId: 'erb', perfume: 'Erba Pura', tipo: 'entrada',
    data: '02/08 17:44', volumeMl: 500, liquidoMl: null, ref: 'NF-4482',
    motivo: 'Compra de perfume base · nota 4482', responsavel: 'João Marcelo', saldoMl: 520,
  },
  {
    id: 'MV-4409', baseId: 'del', perfume: 'Delina', tipo: 'saida',
    data: '02/08 11:05', volumeMl: -123.6, liquidoMl: 120, ref: 'OP-2211',
    motivo: 'Ordem de produção OP-2211 · 15 un de 8 ml', responsavel: 'Pedro A.', saldoMl: 90,
  },
  {
    id: 'MV-4408', baseId: 'oud', perfume: 'Oud Wood', tipo: 'ajuste',
    data: '01/08 16:30', volumeMl: -10, liquidoMl: null, ref: 'LT-079',
    motivo: 'Frasco declarado vazio · perda real apurada no lote', responsavel: 'João Marcelo', saldoMl: 0,
  },
  {
    id: 'MV-4407', baseId: 'gg', perfume: 'Good Girl', tipo: 'devolucao',
    data: '01/08 10:22', volumeMl: 5, liquidoMl: null, ref: 'DEV-1038',
    motivo: 'Decant lacrado devolvido por erro de expedição', responsavel: 'Marina F.', saldoMl: 340,
  },
  {
    id: 'MV-4406', baseId: 'erb', perfume: 'Erba Pura', tipo: 'saida',
    data: '31/07 15:48', volumeMl: -123.6, liquidoMl: 120, ref: 'OP-2210',
    motivo: 'Ordem de produção OP-2210 · 40 un de 3 ml', responsavel: 'Marina F.', saldoMl: 20,
  },
  {
    id: 'MV-4405', baseId: 'ave', perfume: 'Aventus', tipo: 'ajuste',
    data: '31/07 09:10', volumeMl: -12, liquidoMl: null, ref: 'INV-0726',
    motivo: 'Inventário · divergência encontrada na contagem', responsavel: 'Pedro A.', saldoMl: 410,
  },
]

/** Contagem física de agosto, ainda aberta. */
export const INVENTARIO: ContagemInventario[] = [
  { baseId: 'bac', perfume: 'Baccarat Rouge 540', sistemaMl: 640, contadoMl: 640, responsavel: 'Pedro A.', quando: 'hoje 07:40' },
  { baseId: 'sau', perfume: 'Sauvage Elixir', sistemaMl: 1180, contadoMl: 1174, responsavel: 'Pedro A.', quando: 'hoje 07:52' },
  { baseId: 'erb', perfume: 'Erba Pura', sistemaMl: 520, contadoMl: 520, responsavel: 'Marina F.', quando: 'hoje 08:05' },
  { baseId: 'blu', perfume: 'Bleu de Chanel', sistemaMl: 760, contadoMl: 768, responsavel: 'Marina F.', quando: 'hoje 08:18' },
  { baseId: 'ave', perfume: 'Aventus', sistemaMl: 410, contadoMl: 398, responsavel: 'Pedro A.', quando: 'hoje 08:30' },
  { baseId: 'del', perfume: 'Delina', sistemaMl: 90, contadoMl: 90, responsavel: 'Marina F.', quando: 'hoje 08:41' },
  { baseId: 'gg', perfume: 'Good Girl', sistemaMl: 340, contadoMl: null, responsavel: null, quando: null },
  { baseId: 'oud', perfume: 'Oud Wood', sistemaMl: 0, contadoMl: 0, responsavel: 'Pedro A.', quando: 'hoje 08:52' },
]

/**
 * Ordens de produção. São elas que geram as saídas de lote que Movimentações
 * e Lotes leem — os volumes já embutem a perda técnica de 3% do parâmetro
 * (24 un × 5 ml × 1,03 = 123,6 ml).
 */
export const ORDENS: OrdemProducao[] = [
  {
    id: 'OP-2214', baseId: 'bac', perfume: 'Baccarat Rouge 540', marca: 'Maison Francis',
    variante: 5, quantidade: 24, volumeMl: 123.6, status: 'Em envase',
    responsavel: 'Pedro A.', prazo: 'hoje 16:00', motivo: 'AUTO_COBERTURA',
  },
  {
    id: 'OP-2213', baseId: 'oud', perfume: 'Oud Wood', marca: 'Tom Ford',
    variante: 10, quantidade: 12, volumeMl: 123.6, status: 'Bloqueada',
    responsavel: 'Pedro A.', prazo: 'atrasada 1 dia',
    motivo: 'Sem volume · aguardando recompra do base',
  },
  {
    id: 'OP-2212', baseId: 'sau', perfume: 'Sauvage Elixir', marca: 'Dior',
    variante: 15, quantidade: 18, volumeMl: 278.1, status: 'Aguardando conferência',
    responsavel: 'Marina F.', prazo: 'hoje 18:00', motivo: 'Alto giro · estoque de segurança',
  },
  {
    id: 'OP-2211', baseId: 'del', perfume: 'Delina', marca: 'Parfums de Marly',
    variante: 8, quantidade: 15, volumeMl: 123.6, status: 'Concluída',
    responsavel: 'Pedro A.', prazo: 'ontem 15:20', motivo: 'Pedidos da semana',
  },
  {
    id: 'OP-2210', baseId: 'erb', perfume: 'Erba Pura', marca: 'Xerjoff',
    variante: 3, quantidade: 40, volumeMl: 123.6, status: 'Concluída',
    responsavel: 'Marina F.', prazo: '01/08 11:40', motivo: 'Kit descoberta',
  },
]

/**
 * Rastreamento por pedido.
 *
 * A Yampi recebe o rastreio dos gateways mas não reporta a entrega para a
 * Shopify — por isso `shopify` pode ficar em `aguardando-baixa` mesmo com o
 * objeto já entregue. É essa lacuna que a integração fecha.
 */
export const ENVIOS: Envio[] = [
  {
    pedidoId: '#10476', cliente: 'Larissa Duarte', destino: 'Goiânia · GO',
    transportadora: 'Jadlog · .Package', gateway: 'Melhor Envio', rastreio: 'JD4471120',
    status: 'entregue', shopify: 'aguardando-baixa',
    ultimoEvento: 'Objeto entregue ao destinatário', eventoQuando: 'hoje 11:24',
    eventos: [
      { quando: 'hoje 11:24', descricao: 'Objeto entregue ao destinatário', local: 'Goiânia · GO', severidade: 'ok' },
      { quando: 'hoje 07:50', descricao: 'Objeto saiu para entrega', local: 'Jadlog Goiânia · GO', severidade: 'info' },
      { quando: '02/08 21:15', descricao: 'Objeto em trânsito', local: 'Jadlog Campinas · SP', severidade: 'info' },
      { quando: '01/08 18:30', descricao: 'Objeto postado', local: 'Jadlog São Paulo · SP', severidade: 'info' },
    ],
  },
  {
    pedidoId: '#10480', cliente: 'Juliana Prado', destino: 'Belo Horizonte · MG',
    transportadora: 'Correios · SEDEX', gateway: 'Melhor Envio', rastreio: 'OS9981204BR',
    status: 'entrega-nao-efetuada', shopify: 'em-transito',
    ultimoEvento: 'Destinatário ausente · 2ª tentativa amanhã', eventoQuando: 'hoje 10:38',
    eventos: [
      { quando: 'hoje 10:38', descricao: 'Tentativa de entrega não efetuada · destinatário ausente', local: 'Belo Horizonte · MG', severidade: 'erro' },
      { quando: 'hoje 08:05', descricao: 'Objeto saiu para entrega', local: 'CDD Savassi · MG', severidade: 'info' },
      { quando: '02/08 22:10', descricao: 'Objeto postado', local: 'Agência Vila Madalena · SP', severidade: 'info' },
    ],
  },
  {
    pedidoId: '#10478', cliente: 'Beatriz Lima', destino: 'Rio de Janeiro · RJ',
    transportadora: 'Loggi · Econômico', gateway: 'Frenet', rastreio: 'LGG88214077',
    status: 'sem-movimentacao', shopify: 'em-transito',
    ultimoEvento: 'Sem leitura há 4 dias · prazo estourado', eventoQuando: '30/07 09:12',
    eventos: [
      { quando: '30/07 09:12', descricao: 'Objeto em trânsito', local: 'Loggi Rio de Janeiro · RJ', severidade: 'info' },
      { quando: '29/07 20:44', descricao: 'Objeto postado', local: 'Loggi São Paulo · SP', severidade: 'info' },
      { quando: '—', descricao: 'Nenhuma leitura desde então · abrir ocorrência na Yampi', local: 'Yampi · Frenet', severidade: 'erro' },
    ],
  },
  {
    pedidoId: '#10481', cliente: 'Rafael Andrade', destino: 'Campinas · SP',
    transportadora: 'Correios · PAC', gateway: 'Melhor Envio', rastreio: 'OS1234567BR',
    status: 'em-transito', shopify: 'em-transito',
    ultimoEvento: 'Objeto em trânsito para BRC Campinas', eventoQuando: 'hoje 06:14',
    eventos: [
      { quando: 'hoje 06:14', descricao: 'Objeto em trânsito para unidade de distribuição', local: 'CTE São Paulo · SP', severidade: 'info' },
      { quando: 'ontem 19:02', descricao: 'Objeto postado', local: 'Agência Vila Madalena · SP', severidade: 'info' },
      { quando: 'ontem 17:41', descricao: 'Etiqueta gerada manualmente · rastreio enviado à Yampi', local: 'FRENESI · expedição', severidade: 'neutro' },
    ],
  },
  {
    pedidoId: '#10474', cliente: 'Ana Clara Mota', destino: 'São Paulo · SP',
    transportadora: 'Azul Cargo · Amanhã', gateway: 'Frenet', rastreio: 'AZ7710455',
    status: 'entregue', shopify: 'entregue',
    ultimoEvento: 'Objeto entregue · baixa registrada na Shopify', eventoQuando: '31/07 14:02',
    eventos: [
      { quando: '31/07 14:06', descricao: 'Pedido marcado como entregue na Shopify', local: 'FRENESI ERP · baixa automática', severidade: 'ok' },
      { quando: '31/07 14:04', descricao: 'Evento de entrega lido na Yampi', local: 'FRENESI ERP · integração', severidade: 'ok' },
      { quando: '31/07 14:02', descricao: 'Objeto entregue ao destinatário', local: 'São Paulo · SP', severidade: 'ok' },
      { quando: '31/07 08:20', descricao: 'Objeto saiu para entrega', local: 'Azul Cargo Congonhas · SP', severidade: 'info' },
    ],
  },
  {
    pedidoId: '#10482', cliente: 'Camila Rocha', destino: 'São Paulo · SP',
    transportadora: 'Correios · SEDEX', gateway: 'Melhor Envio', rastreio: '',
    status: 'aguardando-postagem', shopify: 'aguardando-envio',
    ultimoEvento: 'Etiqueta ainda não gerada na plataforma', eventoQuando: 'há 2 dias',
    eventos: [],
  },
  {
    pedidoId: '#10477', cliente: 'Marcos Ferreira', destino: 'Santos · SP',
    transportadora: 'Jadlog · .Package', gateway: 'Melhor Envio', rastreio: '',
    status: 'aguardando-postagem', shopify: 'aguardando-envio',
    ultimoEvento: 'Etiqueta ainda não gerada na plataforma', eventoQuando: 'há 2 dias',
    eventos: [],
  },
  {
    pedidoId: '#10475', cliente: 'Eduardo Salles', destino: 'Porto Alegre · RS',
    transportadora: 'Correios · PAC', gateway: 'Melhor Envio', rastreio: '',
    status: 'pagamento-pendente', shopify: 'aguardando-pagamento',
    ultimoEvento: 'Pedido não liberado para envio', eventoQuando: 'há 2 dias',
    eventos: [],
  },
]

/** Ocorrências abertas automaticamente pelo rastreio. */
export const OCORRENCIAS: Ocorrencia[] = [
  {
    id: 'OE-318', pedidoId: '#10478', cliente: 'Beatriz Lima', destino: 'Rio de Janeiro · RJ',
    transportadora: 'Loggi · Econômico', gateway: 'Frenet', rastreio: 'LGG88214077',
    tipo: 'sem-movimentacao', dias: 4, prazo: -3, abertura: '02/08 09:20',
    estado: 'aberta', acao: 'Abrir reclamação na Yampi', valor: 513.6,
  },
  {
    id: 'OE-317', pedidoId: '#10480', cliente: 'Juliana Prado', destino: 'Belo Horizonte · MG',
    transportadora: 'Correios · SEDEX', gateway: 'Melhor Envio', rastreio: 'OS9981204BR',
    tipo: 'entrega-nao-efetuada', dias: 1, prazo: 0, abertura: 'hoje 10:38',
    estado: 'aguardando-cliente', acao: 'Confirmar endereço e reagendar', valor: 612.5,
  },
  {
    id: 'OE-316', pedidoId: '#10465', cliente: 'Vitor Hugo Rezende', destino: 'Londrina · PR',
    transportadora: 'Loggi · Econômico', gateway: 'Frenet', rastreio: 'LGG55120904',
    tipo: 'extravio', dias: 11, prazo: -8, abertura: '28/07 15:02',
    estado: 'em-indenizacao', acao: 'Reenviar pedido e pedir ressarcimento', valor: 352.0,
  },
  {
    id: 'OE-315', pedidoId: '#10471', cliente: 'Bruno Sampaio', destino: 'Recife · PE',
    transportadora: 'Azul Cargo · Amanhã', gateway: 'Frenet', rastreio: 'AZ4471120',
    tipo: 'avaria', dias: 6, prazo: 0, abertura: '30/07 09:05',
    estado: 'resolvida', acao: 'Reenvio postado · devolução DEV-1039', valor: 289.0,
  },
  {
    id: 'OE-314', pedidoId: '#10459', cliente: 'Helena Braga', destino: 'Manaus · AM',
    transportadora: 'Correios · PAC', gateway: 'Melhor Envio', rastreio: 'OS7712004BR',
    tipo: 'atraso', dias: 9, prazo: -5, abertura: '27/07 11:44',
    estado: 'aberta', acao: 'Cobrar prazo no gateway', valor: 198.0,
  },
  {
    id: 'OE-313', pedidoId: '#10452', cliente: 'Diego Matos', destino: 'Belém · PA',
    transportadora: 'Jadlog · .Package', gateway: 'Melhor Envio', rastreio: 'JD3390017',
    tipo: 'endereco-insuficiente', dias: 3, prazo: -1, abertura: '31/07 16:20',
    estado: 'aguardando-cliente', acao: 'Cliente precisa completar o endereço', valor: 245.0,
  },
]

export interface SolicitacaoErp {
  id: string
  pedidoId: string
  cliente: string
  destino: string
  identificacao: string
  email: string
  telefone: string
  abertura: string
  tipo: TipoSolicitacao
  motivo: string
  comentario: string
  valor: number
  prazo: string
  prazoOk: boolean
  status: StatusSolicitacao
  gateway: 'Frenet' | 'Melhor Envio'
  etiquetaIda: string
  reverso: string
  lacre: EstadoLacre
  fotos: string[]
  /** A conferência: volume medido de cada item recebido. Vazia antes de chegar. */
  itens: ItemAferido[]
  /** O que o cliente marcou no portal. É contra esta lista que se confere. */
  itensSolicitados?: string[]
}

/**
 * Devoluções vindas do portal.
 *
 * `itens` já vem aferido: o volume medido na conferência contra o que foi
 * fracionado. A decisão de aceitar sai daí — ver `triarDevolucao`.
 */
export const SOLICITACOES: SolicitacaoErp[] = [
  {
    id: 'DEV-1042', pedidoId: '#10480', cliente: 'Juliana Prado', destino: 'Belo Horizonte · MG',
    identificacao: 'CPF 041.***.***-22', email: 'ju.prado@email.com', telefone: '31 98003-1177',
    abertura: 'hoje 08:12', tipo: 'Defeito', motivo: 'Produto avariado no transporte',
    comentario:
      'A caixa chegou amassada e um dos frascos estava trincado, vazou dentro do estojo. Tenho fotos do frasco e da embalagem.',
    valor: 612.5, prazo: '28 dias restantes · defeito (30 dias)', prazoOk: true,
    status: 'Nova', gateway: 'Melhor Envio', etiquetaIda: 'OS9981204BR', reverso: '',
    lacre: 'rompido-no-transporte',
    fotos: ['Volume no frasco', 'Lacre / recrave', 'Frasco trincado', 'Estojo com vazamento'],
    itens: [
      aferirItem('Baccarat Rouge 540', 5, 4.9, 'Frasco trincado'),
      aferirItem('Delina', 5, 1.2, 'Vazou no transporte'),
      aferirItem('Aventus', 5, 4.8, 'Frasco trincado'),
    ],
  },
  {
    id: 'DEV-1041', pedidoId: '#10474', cliente: 'Ana Clara Mota', destino: 'São Paulo · SP',
    identificacao: 'E-mail verificado', email: 'ana.mota@email.com', telefone: '11 97001-5540',
    abertura: 'ontem 17:40', tipo: 'Arrependimento', motivo: 'Desistência da compra',
    comentario: 'Comprei por impulso e não abri o lacre. Gostaria de devolver os dois itens.',
    valor: 168.8, prazo: '5 dias restantes · CDC (7 dias)', prazoOk: false,
    status: 'Em análise', gateway: 'Frenet', etiquetaIda: 'AZ7710455', reverso: '',
    lacre: 'intacto',
    fotos: ['Volume no frasco', 'Lacre / recrave'],
    itens: [
      aferirItem('Erba Pura', 5, 5, 'Lacre intacto'),
      aferirItem('Sauvage Elixir', 8, 7.6, 'Lacre intacto'),
    ],
  },
  {
    id: 'DEV-1040', pedidoId: '#10465', cliente: 'Vitor Hugo Rezende', destino: 'Londrina · PR',
    identificacao: 'CPF 118.***.***-40', email: 'vitor.rezende@email.com', telefone: '43 99820-6611',
    abertura: '02/08 14:10', tipo: 'Arrependimento', motivo: 'Não gostei da fragrância',
    comentario: 'Não é o que eu esperava. Usei só uma borrifada para testar.',
    valor: 352.0, prazo: '2 dias restantes · CDC (7 dias)', prazoOk: false,
    // Ainda em análise: a triagem reprova o volume, então a decisão está de pé.
    // Aprovar antes da conferência contradiria a própria aferição.
    status: 'Em análise', gateway: 'Frenet', etiquetaIda: 'LGG55120904', reverso: '',
    lacre: 'violado',
    fotos: ['Volume no frasco', 'Lacre / recrave'],
    itens: [
      // 3,9 de 5 ml = 78%, abaixo do mínimo de 4,5 → arrependimento bloqueado.
      aferirItem('Oud Wood', 5, 3.9, 'Lacre rompido pelo cliente'),
    ],
  },
  {
    id: 'DEV-1039', pedidoId: '#10471', cliente: 'Bruno Sampaio', destino: 'Recife · PE',
    identificacao: 'E-mail verificado', email: 'bruno.sampaio@email.com', telefone: '81 98120-4477',
    abertura: '30/07 09:40', tipo: 'Defeito', motivo: 'Frasco chegou vazando',
    comentario: 'Chegou com a tampa solta e metade do conteúdo tinha vazado na caixa.',
    valor: 289.0, prazo: 'dentro do prazo · defeito (30 dias)', prazoOk: true,
    status: 'Em trânsito reverso', gateway: 'Frenet', etiquetaIda: 'AZ4471120', reverso: 'RV4471120BR',
    lacre: 'rompido-no-transporte',
    fotos: ['Volume no frasco', 'Tampa solta', 'Caixa com vazamento'],
    itens: [aferirItem('Bleu de Chanel', 10, 4.2, 'Vazou no transporte')],
  },
  {
    id: 'DEV-1038', pedidoId: '#10452', cliente: 'Diego Matos', destino: 'Belém · PA',
    identificacao: 'CPF 330.***.***-17', email: 'diego.matos@email.com', telefone: '91 98221-3390',
    abertura: '28/07 11:05', tipo: 'Erro de envio', motivo: 'Recebi produto diferente do pedido',
    comentario: 'Pedi Good Girl 5 ml e veio outro perfume.',
    valor: 245.0, prazo: 'resolvido', prazoOk: true,
    status: 'Concluída', gateway: 'Melhor Envio', etiquetaIda: 'JD3390017', reverso: 'RV7710455BR',
    lacre: 'intacto',
    fotos: ['Volume no frasco', 'Lacre / recrave'],
    itens: [aferirItem('Good Girl', 5, 5, 'Lacre intacto · perfume trocado')],
  },
]

/** Mês fechado que alimenta o resumo financeiro do dashboard e o DRE. */
export const JULHO = {
  dias: 31,
  receitaBruta: 198430,
  receitaLiquida: 182804,
  saidas: 141614,
  resultado: 41190,
}

export const AGOSTO = {
  dias: 3,
  entradas: 21580,
  saidas: 17091,
  get resultado() {
    return this.entradas - this.saidas
  },
}

/** Lançamentos de agosto. As pendências do dashboard derivam daqui. */
export const LANCAMENTOS: Lancamento[] = [
  { id: 'LC-118', data: '05/08', descricao: 'Frete transportadora · agosto', categoria: 'Logística', conta: 'Inter PJ', tipo: 'saida', valor: 1240.0, status: 'A pagar', recorrente: false, origem: 'Assessor IA' },
  { id: 'LC-117', data: '05/08', descricao: 'Embalagens e frascos · lote 240', categoria: 'Insumos e embalagem', conta: 'Inter PJ', tipo: 'saida', valor: 2180.0, status: 'A pagar', recorrente: false, origem: 'Manual' },
  { id: 'LC-116', data: '05/08', descricao: 'Meta Ads · agosto', categoria: 'Marketing e ADS', conta: 'Nubank PJ', tipo: 'saida', valor: 760.0, status: 'A pagar', recorrente: true, origem: 'Recorrente' },
  { id: 'LC-115', data: '04/08', descricao: 'Repasse Shopify · lote 03/08', categoria: 'Vendas', conta: 'Inter PJ', tipo: 'entrada', valor: 8432.1, status: 'Previsto', recorrente: false, origem: 'Conciliação' },
  { id: 'LC-114', data: '03/08', descricao: 'Repasse Yampi · lote 02/08', categoria: 'Vendas', conta: 'Inter PJ', tipo: 'entrada', valor: 5218.4, status: 'Recebido', recorrente: false, origem: 'Conciliação' },
  { id: 'LC-113', data: '03/08', descricao: 'Compra de perfume base · Oud Wood 500 ml', categoria: 'Matéria-prima', conta: 'Inter PJ', tipo: 'saida', valor: 2200.0, status: 'Pago', recorrente: false, origem: 'Estoque' },
  { id: 'LC-112', data: '02/08', descricao: 'Assinatura Judge.me', categoria: 'Ferramentas', conta: 'Nubank PJ', tipo: 'saida', valor: 149.0, status: 'Pago', recorrente: true, origem: 'Recorrente' },
  { id: 'LC-111', data: '02/08', descricao: 'Pró-labore', categoria: 'Pessoal', conta: 'Inter PJ', tipo: 'saida', valor: 6000.0, status: 'Pago', recorrente: true, origem: 'Recorrente' },
  { id: 'LC-110', data: '01/08', descricao: 'Repasse Shopify · lote 31/07', categoria: 'Vendas', conta: 'Inter PJ', tipo: 'entrada', valor: 11940.8, status: 'Recebido', recorrente: false, origem: 'Conciliação' },
  { id: 'LC-109', data: '01/08', descricao: 'Contabilidade', categoria: 'Serviços', conta: 'Nubank PJ', tipo: 'saida', valor: 890.0, status: 'Pago', recorrente: true, origem: 'Recorrente' },
  { id: 'LC-108', data: '01/08', descricao: 'Simples Nacional · competência julho', categoria: 'Impostos', conta: 'Inter PJ', tipo: 'saida', valor: 4310.0, status: 'Vencido', recorrente: false, origem: 'Manual' },
]

export const CONTAS: ContaBancaria[] = [
  { id: 'inter', nome: 'Inter PJ', tipo: 'Conta corrente', banco: 'Banco Inter · 077', saldo: 38420, entradasMes: 16240, saidasMes: 12980, uso: 'Operacional · repasses e fornecedores', principal: true, saldoInformado: null, saldoInformadoEm: null },
  { id: 'nubank', nome: 'Nubank PJ', tipo: 'Conta corrente', banco: 'Nu Pagamentos · 260', saldo: 18960, entradasMes: 5340, saidasMes: 4111, uso: 'Ferramentas, ADS e assinaturas', principal: false, saldoInformado: null, saldoInformadoEm: null },
  { id: 'reserva', nome: 'Reserva', tipo: 'Caixa de rendimento', banco: 'Inter · CDB liquidez diária', saldo: 5100, entradasMes: 0, saidasMes: 0, uso: 'Colchão de 1 mês de custo fixo', principal: false, saldoInformado: null, saldoInformadoEm: null },
]

/**
 * Repasses a conciliar. Só os fatos: esperado, taxa, o que caiu. O status é
 * derivado por `conciliarRepasse` — nunca vem marcado daqui.
 */
export const REPASSES: Repasse[] = [
  { pedidoId: '#10482', origem: 'Shopify · Cartão 1x', esperado: 389.0, taxaPct: 4.33, recebido: 372.15, pagamentoConfirmado: true },
  { pedidoId: '#10480', origem: 'Shopify · Cartão 3x', esperado: 612.5, taxaPct: 4.33, recebido: 561.4, pagamentoConfirmado: true },
  { pedidoId: '#10479', origem: 'Pix · Inter', esperado: 298.0, taxaPct: 0, recebido: null, pagamentoConfirmado: false },
  { pedidoId: '#10478', origem: 'Yampi · Cartão 2x', esperado: 476.0, taxaPct: 4.32, recebido: 455.42, pagamentoConfirmado: true },
  { pedidoId: '#10477', origem: 'Yampi · Pix', esperado: 352.0, taxaPct: 0, recebido: 352.0, pagamentoConfirmado: true },
  { pedidoId: '#10476', origem: 'Shopify · Cartão 6x', esperado: 824.9, taxaPct: 4.33, recebido: null, pagamentoConfirmado: true },
  { pedidoId: '#10475', origem: 'WhatsApp · Pix', esperado: 189.0, taxaPct: 0, recebido: 189.0, pagamentoConfirmado: true },
  { pedidoId: '#10474', origem: 'Shopify · Cartão 1x', esperado: 458.0, taxaPct: 4.33, recebido: 486.2, pagamentoConfirmado: true },
]

/** Custos e despesas de julho, classificados. Participações derivam do total. */
export const CATEGORIAS: CategoriaFinanceira[] = [
  { nome: 'Matéria-prima', natureza: 'Custo variável', valorMes: 58240, lancamentos: 6 },
  { nome: 'Marketing e ADS', natureza: 'Despesa', valorMes: 21936, lancamentos: 12 },
  { nome: 'Pessoal', natureza: 'Despesa fixa', valorMes: 12000, lancamentos: 2 },
  { nome: 'Impostos', natureza: 'Custo variável', valorMes: 10968, lancamentos: 1 },
  { nome: 'Insumos e embalagem', natureza: 'Custo variável', valorMes: 9640, lancamentos: 4 },
  { nome: 'Logística', natureza: 'Custo variável', valorMes: 8940, lancamentos: 9 },
  { nome: 'Taxas de pagamento', natureza: 'Custo variável', valorMes: 11557, lancamentos: 31 },
  { nome: 'Ferramentas', natureza: 'Despesa fixa', valorMes: 2250, lancamentos: 5 },
  { nome: 'Serviços', natureza: 'Despesa fixa', valorMes: 890, lancamentos: 1 },
  { nome: 'Ocupação e diversos', natureza: 'Despesa', valorMes: 5193, lancamentos: 7 },
]

/**
 * Linhas primitivas do DRE de julho. Os subtotais (receita líquida, margem de
 * contribuição, resultado) NUNCA aparecem aqui — `montarDre` os deriva.
 */
export const DRE_JULHO = {
  receitaBruta: {
    linha: 'Vendas da loja',
    valor: 198430,
    nota: '482 pedidos faturados · ticket médio R$ 412',
  },
  receitasExtras: [],
  deducoes: [
    { linha: 'Descontos e cupons', valor: 11806, nota: '12,9% da receita promocional' },
    { linha: 'Devoluções', valor: 3820, nota: '6 solicitações · 3 reembolsadas' },
  ],
  custos: [
    { linha: 'Impostos', valor: 10968, nota: 'Simples Nacional · 6%' },
    { linha: 'Taxas de pagamento e checkout', valor: 11557, nota: 'Intermediador 4,33% + Yampi 1,99%' },
    { linha: 'Custo dos produtos vendidos', valor: 58240, nota: 'Perfume base + perda técnica' },
    { linha: 'Embalagens e insumos', valor: 9640, nota: 'Frasco, válvula, etiqueta e caixa' },
    { linha: 'Frete subsidiado', valor: 8940, nota: 'Média de R$ 27,10 por pedido' },
  ],
  despesas: [
    { linha: 'Marketing e ADS', valor: 21936, nota: '12% da receita · CAC R$ 45,50' },
    { linha: 'Pessoal e pró-labore', valor: 12000, nota: '2 pessoas' },
    { linha: 'Ferramentas e serviços', valor: 3140, nota: 'Shopify, Yampi, Judge.me, contabilidade' },
    { linha: 'Outras despesas', valor: 5193, nota: 'Ocupação e diversos' },
  ],
}

export interface EnvioContabil {
  quando: string
  arquivo: string
  conteudo: string
  registros: number
  tamanho: string
  estado: 'Aceito' | 'Processando' | 'Recusado'
  nota: string
}

export const ENVIOS_CONTABEIS: EnvioContabil[] = [
  { quando: 'ontem 23:10', arquivo: 'frenesi-202608-nfe.zip', conteudo: 'XML das notas de agosto', registros: 128, tamanho: '2,4 MB', estado: 'Aceito', nota: '' },
  { quando: 'ontem 23:10', arquivo: 'frenesi-202608-razao.csv', conteudo: 'Razão analítico por categoria', registros: 214, tamanho: '186 KB', estado: 'Aceito', nota: '' },
  { quando: '02/08 23:10', arquivo: 'frenesi-202607-fechamento.zip', conteudo: 'Fechamento de julho', registros: 486, tamanho: '5,1 MB', estado: 'Aceito', nota: '' },
  { quando: '01/08 23:10', arquivo: 'frenesi-202607-devolucoes.csv', conteudo: 'Notas de devolução de julho', registros: 12, tamanho: '14 KB', estado: 'Recusado', nota: 'Duas devoluções sem NF de entrada · reenviar após emitir' },
  { quando: 'hoje 08:00', arquivo: 'frenesi-202608-conciliacao.csv', conteudo: 'Extrato conciliado do Inter', registros: 96, tamanho: '78 KB', estado: 'Processando', nota: '' },
]

/** Conta contábil de cada categoria, amarrada para o arquivo do escritório. */
export const PLANO_CONTAS: Record<string, string> = {
  'Matéria-prima': '1.1.03.001 · estoque de perfume base',
  'Marketing e ADS': '3.1.03.002 · marketing e publicidade',
  Pessoal: '3.1.01.001 · remuneração e pró-labore',
  Impostos: '3.1.04.001 · tributos sobre venda',
  'Insumos e embalagem': '1.1.03.002 · materiais de embalagem',
  Logística: '3.1.02.004 · fretes e carretos',
  'Taxas de pagamento': '3.1.02.001 · despesas financeiras',
  Ferramentas: '3.1.03.005 · softwares e assinaturas',
  Serviços: '3.1.03.008 · serviços de terceiros',
  'Ocupação e diversos': '3.1.01.004 · ocupação e despesas gerais',
}

export const NOTAS_EMITIDAS = 128
export const PEDIDOS_SEM_NOTA = 3

// ── Configurações ──────────────────────────────────────────────────────────

export type NivelPermissao = 'total' | 'leitura' | 'nenhum'

export interface PerfilAcesso {
  nome: string
  descricao: string
  pessoas: number
}

export const PERFIS: PerfilAcesso[] = [
  { nome: 'Administrador', descricao: 'Acesso total, inclusive financeiro e permissões', pessoas: 1 },
  { nome: 'Financeiro', descricao: 'Lançamentos, conciliação e DRE · custos e pedidos apenas em leitura', pessoas: 1 },
  { nome: 'Operação', descricao: 'Pedidos, estoque, produção e devoluções · CRM em leitura, sem acesso a custos', pessoas: 2 },
  { nome: 'Atendimento', descricao: 'CRM e campanhas · pedidos e devoluções apenas em leitura', pessoas: 1 },
]

export interface UsuarioErp {
  nome: string
  email: string
  perfil: string
  ultimoAcesso: string
  status: 'Ativo' | 'Convite pendente'
  duasEtapas: boolean
  assessorIa: boolean
  iniciais: string
}

export const USUARIOS: UsuarioErp[] = [
  { nome: 'João Marcelo', email: 'joao@frenesiperfumes.com.br', perfil: 'Administrador', ultimoAcesso: 'hoje 09:42', status: 'Ativo', duasEtapas: true, assessorIa: true, iniciais: 'JM' },
  { nome: 'Marina Ferraz', email: 'marina@frenesiperfumes.com.br', perfil: 'Operação', ultimoAcesso: 'hoje 08:15', status: 'Ativo', duasEtapas: true, assessorIa: false, iniciais: 'MF' },
  { nome: 'Rita Camargo', email: 'rita@contabilidade.com.br', perfil: 'Financeiro', ultimoAcesso: 'ontem 18:04', status: 'Ativo', duasEtapas: false, assessorIa: false, iniciais: 'RC' },
  { nome: 'Pedro Anselmo', email: 'pedro@frenesiperfumes.com.br', perfil: 'Operação', ultimoAcesso: '31/07 17:22', status: 'Ativo', duasEtapas: false, assessorIa: false, iniciais: 'PA' },
  { nome: 'Bianca Alves', email: 'bianca@frenesiperfumes.com.br', perfil: 'Atendimento', ultimoAcesso: '12/07 10:38', status: 'Convite pendente', duasEtapas: false, assessorIa: false, iniciais: 'BA' },
]

/** Matriz área × perfil, na mesma ordem de PERFIS. */
export const PERMISSOES: { area: string; niveis: NivelPermissao[] }[] = [
  { area: 'Pedidos e envios', niveis: ['total', 'leitura', 'total', 'leitura'] },
  { area: 'Estoque e produção', niveis: ['total', 'nenhum', 'total', 'nenhum'] },
  { area: 'Custos e precificação', niveis: ['total', 'leitura', 'nenhum', 'nenhum'] },
  { area: 'Financeiro e conciliação', niveis: ['total', 'total', 'nenhum', 'nenhum'] },
  { area: 'Devoluções', niveis: ['total', 'leitura', 'total', 'leitura'] },
  { area: 'CRM e campanhas', niveis: ['total', 'nenhum', 'leitura', 'total'] },
  { area: 'Configurações e usuários', niveis: ['total', 'nenhum', 'nenhum', 'nenhum'] },
]

export interface Integracao {
  sigla: string
  nome: string
  papel: string
  estado: 'Conectada' | 'Via Yampi' | 'Domínio pendente'
  detalhe: string
  desde: string
  ping: string
}

export const INTEGRACOES: Integracao[] = [
  { sigla: 'SH', nome: 'Shopify', papel: 'Loja e catálogo', estado: 'Conectada', detalhe: 'Pedidos, produtos, coleção Ofertas e baixa de entrega', desde: 'há 8 meses', ping: 'há 2 min' },
  { sigla: 'YP', nome: 'Yampi', papel: 'Checkout e frete', estado: 'Conectada', detalhe: 'Cupons, cálculo de frete e rastreio de Melhor Envio e Frenet', desde: 'há 8 meses', ping: 'há 6 min' },
  { sigla: 'ME', nome: 'Melhor Envio', papel: 'Transportadoras', estado: 'Via Yampi', detalhe: 'Correios e Jadlog · leitura de rastreio pelo intermediário', desde: 'há 7 meses', ping: 'há 6 min' },
  { sigla: 'FR', nome: 'Frenet', papel: 'Transportadoras', estado: 'Via Yampi', detalhe: 'Loggi e Azul Cargo · leitura de rastreio pelo intermediário', desde: 'há 5 meses', ping: 'há 12 min' },
  { sigla: 'JM', nome: 'Judge.me', papel: 'Avaliações', estado: 'Conectada', detalhe: 'Importa cupons de avaliação e recria na Yampi', desde: 'há 4 meses', ping: 'há 40 min' },
  { sigla: 'KL', nome: 'Klaviyo', papel: 'E-mail marketing', estado: 'Domínio pendente', detalhe: 'Falta autenticar o domínio de envio · risco de cair em spam', desde: 'há 12 dias', ping: 'há 1 h' },
  { sigla: 'SE', nome: 'Amazon SES', papel: 'E-mail transacional', estado: 'Conectada', detalhe: 'Confirmação de pedido, rastreio e código reverso', desde: 'há 6 meses', ping: 'há 4 min' },
  { sigla: 'WA', nome: 'WhatsApp Business', papel: 'Atendimento e IA', estado: 'Conectada', detalhe: 'Canal do Assessor IA e recuperação de carrinho', desde: 'há 3 meses', ping: 'há 8 min' },
]

/**
 * Um gatilho, um remetente. Quando dois serviços disparam o mesmo e-mail, o
 * cliente recebe a mensagem duplicada e as métricas se dividem — a coluna
 * `conflito` registra a sobreposição.
 */
export const RESPONSAVEIS_EMAIL: { gatilho: string; dono: string; conflito: string }[] = [
  { gatilho: 'Confirmação de pedido', dono: 'Amazon SES', conflito: '' },
  { gatilho: 'Pedido enviado · rastreio', dono: 'Amazon SES', conflito: 'Yampi também dispara este e-mail' },
  { gatilho: 'Pedido entregue', dono: 'Amazon SES', conflito: '' },
  { gatilho: 'Carrinho abandonado', dono: 'Klaviyo', conflito: 'Yampi tem automação nativa ligada' },
  { gatilho: 'Convite para avaliar', dono: 'Judge.me', conflito: '' },
  { gatilho: 'Cupom de avaliação', dono: 'Judge.me', conflito: '' },
  { gatilho: 'Campanhas e newsletter', dono: 'Klaviyo', conflito: '' },
  { gatilho: 'Código reverso de devolução', dono: 'Amazon SES', conflito: '' },
  { gatilho: 'Aniversário e reativação', dono: 'Klaviyo', conflito: '' },
]

export interface RegraNotificacao {
  evento: string
  condicao: string
  canais: string
  modulo: string
  nivel: 'Crítico' | 'Atenção' | 'Informativo'
  ativa: boolean
  disparosHoje: number
}

export const NOTIFICACOES: RegraNotificacao[] = [
  { evento: 'Perfume base esgotado', condicao: 'Volume chega a zero', canais: 'ERP · WhatsApp', modulo: 'Estoque', nivel: 'Crítico', ativa: true, disparosHoje: 1 },
  { evento: 'Cobertura abaixo de 20 dias', condicao: 'Volume ÷ consumo diário < 20', canais: 'ERP', modulo: 'Estoque', nivel: 'Atenção', ativa: true, disparosHoje: 2 },
  { evento: 'Pedido pago sem envio há 48h', condicao: 'Pagamento aprovado e sem etiqueta', canais: 'ERP · e-mail', modulo: 'Pedidos', nivel: 'Crítico', ativa: true, disparosHoje: 4 },
  { evento: 'Entrega sem movimentação', condicao: 'Rastreio parado há 3 dias', canais: 'ERP', modulo: 'Logística', nivel: 'Atenção', ativa: true, disparosHoje: 2 },
  { evento: 'Cupom fora de sincronia', condicao: 'Existe na Shopify e não na Yampi', canais: 'ERP · WhatsApp', modulo: 'Promoções', nivel: 'Crítico', ativa: true, disparosHoje: 2 },
  { evento: 'Devolução aberta no portal', condicao: 'Nova solicitação do cliente', canais: 'ERP · e-mail', modulo: 'Devoluções', nivel: 'Informativo', ativa: true, disparosHoje: 1 },
  { evento: 'Conta a pagar vencendo', condicao: 'Vence em 2 dias', canais: 'ERP · e-mail', modulo: 'Financeiro', nivel: 'Atenção', ativa: true, disparosHoje: 3 },
  { evento: 'Margem abaixo do piso', condicao: 'Preço praticado fura o piso', canais: 'ERP', modulo: 'Precificação', nivel: 'Atenção', ativa: true, disparosHoje: 1 },
  { evento: 'Concorrente baixou preço', condicao: 'Menor preço do mercado caiu 5%', canais: 'ERP', modulo: 'Concorrentes', nivel: 'Informativo', ativa: false, disparosHoje: 0 },
  { evento: 'Meta diária de vendas', condicao: 'Resumo às 20h', canais: 'WhatsApp', modulo: 'Dashboard', nivel: 'Informativo', ativa: false, disparosHoje: 0 },
]

export interface RegistroAuditoria {
  quando: string
  autor: string
  modulo: string
  acao: string
  /** Vazio quando a ação criou algo, sem valor anterior. */
  antes: string
  depois: string
  /** Preço, permissão ou estoque — o que merece revisão periódica. */
  sensivel: boolean
}

export const LOGS_AUDITORIA: RegistroAuditoria[] = [
  { quando: '09:42', autor: 'Assessor IA', modulo: 'Financeiro', acao: 'Lançamento de despesa criado após aprovação', antes: '', depois: 'Frete transportadora · R$ 1.240,00', sensivel: false },
  { quando: '09:14', autor: 'Sistema', modulo: 'Promoções', acao: 'Giftback emitido na compra #10482', antes: '', depois: 'GB-2291 · R$ 40,00', sensivel: false },
  { quando: '08:52', autor: 'Pedro A.', modulo: 'Estoque', acao: 'Contagem de inventário registrada', antes: '410 ml', depois: '398 ml', sensivel: true },
  { quando: '08:30', autor: 'Marina F.', modulo: 'Pedidos', acao: 'Pedido marcado como entregue na Shopify', antes: 'Em trânsito', depois: 'Entregue', sensivel: false },
  { quando: '08:05', autor: 'João Marcelo', modulo: 'Precificação', acao: 'Margem alvo alterada', antes: '22%', depois: '25%', sensivel: true },
  { quando: '07:58', autor: 'Assessor IA', modulo: 'Financeiro', acao: 'Lançamento recusado por categoria não identificada', antes: '', depois: '', sensivel: false },
  { quando: '07:40', autor: 'Sistema', modulo: 'Avaliações', acao: 'Cupom do Judge.me importado e criado na Yampi', antes: '', depois: 'JM-FOTO-4821', sensivel: false },
  { quando: 'ontem 18:20', autor: 'João Marcelo', modulo: 'Usuários', acao: 'Perfil de acesso alterado', antes: 'Atendimento', depois: 'Operação', sensivel: true },
]

/** Dados fiscais fictícios. A validade do certificado alimenta o alerta. */
export const EMPRESA = {
  identificacao: [
    { label: 'Razão social', valor: 'FRENESI Perfumes Fracionados LTDA' },
    { label: 'Nome fantasia', valor: 'FRENESI' },
    { label: 'CNPJ', valor: '64.983.651/0001-73' },
    { label: 'Inscrição estadual', valor: '141.882.664.110' },
  ],
  endereco: [
    { label: 'Logradouro', valor: 'Rua Harmonia, 1.208 · galpão 4' },
    { label: 'Bairro e cidade', valor: 'Vila Madalena · São Paulo · SP' },
    { label: 'CEP', valor: '05435-001' },
    { label: 'Origem do frete', valor: 'Mesmo endereço · usado na cotação da Yampi' },
  ],
  tributacao: [
    { label: 'Regime', valor: 'Simples Nacional' },
    { label: 'Anexo e faixa', valor: 'Anexo I · faixa 3' },
    { label: 'CNAE principal', valor: '4772-5/00 · comércio de cosméticos e perfumaria' },
  ],
  certificado: {
    tipo: 'A1 · e-CNPJ',
    validade: '2026-10-04',
    responsavel: 'João Marcelo',
    uso: 'Emissão de nota e integração contábil',
  },
}

export const PEDIDOS_A_SEPARAR = 17

// ── CRM ────────────────────────────────────────────────────────────────────

export interface ClienteCrm {
  nome: string
  cidade: string
  iniciais: string
  email: string
  telefone: string
  /** Total comprado e nº de pedidos: o ticket médio é derivado (total ÷ pedidos). */
  total: number
  pedidos: number
  ultimaCompra: string
  status: 'VIP' | 'Recorrente' | 'Novo' | 'Inativo'
}

export const CLIENTES: ClienteCrm[] = [
  { nome: 'Camila Rocha', cidade: 'São Paulo · SP', iniciais: 'CR', email: 'camila.rocha@email.com', telefone: '11 98421-0032', total: 4180, pedidos: 11, ultimaCompra: '03/08', status: 'VIP' },
  { nome: 'Rafael Andrade', cidade: 'Campinas · SP', iniciais: 'RA', email: 'rafael.andrade@email.com', telefone: '19 99120-8874', total: 2640, pedidos: 7, ultimaCompra: '03/08', status: 'Recorrente' },
  { nome: 'Juliana Prado', cidade: 'Belo Horizonte · MG', iniciais: 'JP', email: 'ju.prado@email.com', telefone: '31 98003-1177', total: 1980, pedidos: 5, ultimaCompra: '02/08', status: 'Recorrente' },
  { nome: 'Tiago Nunes', cidade: 'Curitiba · PR', iniciais: 'TN', email: 'tiago.nunes@email.com', telefone: '41 99887-2210', total: 298, pedidos: 1, ultimaCompra: '02/08', status: 'Novo' },
  { nome: 'Beatriz Lima', cidade: 'Rio de Janeiro · RJ', iniciais: 'BL', email: 'bia.lima@email.com', telefone: '21 98554-9021', total: 6320, pedidos: 16, ultimaCompra: '02/08', status: 'VIP' },
  { nome: 'Marcos Ferreira', cidade: 'Santos · SP', iniciais: 'MF', email: 'marcos.f@email.com', telefone: '13 99441-7788', total: 1408, pedidos: 4, ultimaCompra: '01/08', status: 'Recorrente' },
  { nome: 'Larissa Duarte', cidade: 'Goiânia · GO', iniciais: 'LD', email: 'larissa.d@email.com', telefone: '62 98220-4410', total: 3290, pedidos: 6, ultimaCompra: '01/08', status: 'VIP' },
  { nome: 'Eduardo Salles', cidade: 'Porto Alegre · RS', iniciais: 'ES', email: 'edu.salles@email.com', telefone: '51 99612-3345', total: 640, pedidos: 3, ultimaCompra: '12/04', status: 'Inativo' },
]

export interface CarrinhoAbandonado {
  cliente: string
  telefone: string
  valor: number
  tempo: string
  prioridade: 'Alta' | 'Média' | 'Baixa'
  itens: { nome: string; qtd: string }[]
  contatado: boolean
}

export const CARRINHOS: CarrinhoAbandonado[] = [
  { cliente: 'Fernanda Belmonte', telefone: '11 97722-1180', valor: 682, tempo: 'há 42 min', prioridade: 'Alta', itens: [{ nome: 'Baccarat Rouge 540 · 15 ml', qtd: '1×' }, { nome: 'Delina · 10 ml', qtd: '1×' }], contatado: false },
  { cliente: 'Paulo Vasques', telefone: '11 98330-4471', valor: 512, tempo: 'há 2h', prioridade: 'Alta', itens: [{ nome: 'Aventus · 15 ml', qtd: '1×' }, { nome: 'Refil 10 ml', qtd: '2×' }], contatado: false },
  { cliente: 'Renata Coelho', telefone: '21 99441-2087', valor: 438.9, tempo: 'há 5h', prioridade: 'Alta', itens: [{ nome: 'Erba Pura · 15 ml', qtd: '1×' }, { nome: 'Kit descoberta', qtd: '1×' }], contatado: true },
  { cliente: 'Gustavo Aguiar', telefone: '31 98110-6654', valor: 289, tempo: 'há 1 dia', prioridade: 'Média', itens: [{ nome: 'Sauvage Elixir · 10 ml', qtd: '1×' }], contatado: false },
  { cliente: 'Sofia Menezes', telefone: '48 99225-3390', valor: 198, tempo: 'há 2 dias', prioridade: 'Média', itens: [{ nome: 'Bleu de Chanel · 10 ml', qtd: '1×' }], contatado: true },
  { cliente: 'Henrique Dantas', telefone: '85 98774-1102', valor: 149, tempo: 'há 4 dias', prioridade: 'Baixa', itens: [{ nome: 'Good Girl · 10 ml', qtd: '1×' }], contatado: false },
]

/**
 * Fatos dos últimos 7/30 dias que os 6 cards acima (uma amostra) não cobrem.
 * A recuperação bate com a receita do fluxo "Carrinho abandonado" em FLUXOS.
 */
export const CARRINHOS_7D = { abertos: 31, valor: 12840 }
export const CARRINHOS_RECUPERADOS = { qtd: 14, valor: 5610, taxaPct: 31 }
export const CARRINHOS_PRIORIDADE_ALTA = 6
export const COMANDOS_IA_AGUARDANDO = 2

export const CAMPANHAS_MKT: CampanhaMkt[] = [
  { nome: 'Lançamento Layton', canal: 'E-mail + Instagram', publico: 'Compraram amadeirados', periodo: '01/08 a 07/08', alcance: 1284, conversaoPct: 4.8, receita: 8420, custo: 1200, estado: 'Em veiculação' },
  { nome: 'Coleção Ofertas · ciclo 48h', canal: 'E-mail + site', publico: 'Base completa', periodo: '03/08 a 05/08', alcance: 4820, conversaoPct: 2.1, receita: 6480, custo: 0, estado: 'Em veiculação' },
  { nome: 'Dia dos Pais · kits', canal: 'Meta Ads', publico: 'Lookalike de compradores', periodo: '25/07 a 08/08', alcance: 42600, conversaoPct: 0.9, receita: 18940, custo: 4800, estado: 'Em veiculação' },
  { nome: 'Reativação 90 dias', canal: 'E-mail + WhatsApp', publico: 'Sem comprar há 90 dias', periodo: '20/07 a 27/07', alcance: 742, conversaoPct: 5.4, receita: 4120, custo: 380, estado: 'Encerrada' },
  { nome: 'Pré-venda VIP', canal: 'WhatsApp', publico: 'VIP', periodo: '10/08 a 12/08', alcance: 186, conversaoPct: 0, receita: 0, custo: 0, estado: 'Agendada' },
  { nome: 'Black Friday · aquecimento', canal: 'E-mail', publico: 'Base completa', periodo: '15/07 a 22/07', alcance: 4610, conversaoPct: 1.6, receita: 5210, custo: 620, estado: 'Encerrada' },
]

export const FLUXOS: FluxoEmail[] = [
  { id: 'carrinho', nome: 'Carrinho abandonado', gatilho: 'Carrinho parado há 1h', etapas: 3, enviados: 412, aberturaPct: 48.2, cliquesPct: 12.4, receita: 5610, status: 'Ativo' },
  { id: 'poscompra', nome: 'Pós-compra · pedido entregue', gatilho: 'Entrega confirmada na Yampi', etapas: 2, enviados: 386, aberturaPct: 61.5, cliquesPct: 9.1, receita: 3240, status: 'Ativo' },
  { id: 'avaliacao', nome: 'Convite para avaliar', gatilho: '7 dias após a entrega', etapas: 2, enviados: 298, aberturaPct: 54.8, cliquesPct: 18.6, receita: 1980, status: 'Ativo' },
  { id: 'recompra', nome: 'Hora de repor', gatilho: '45 dias sem comprar', etapas: 3, enviados: 174, aberturaPct: 39.4, cliquesPct: 7.2, receita: 4120, status: 'Ativo' },
  { id: 'aniversario', nome: 'Aniversário do cliente', gatilho: 'Data de nascimento', etapas: 1, enviados: 38, aberturaPct: 66.1, cliquesPct: 21.3, receita: 1640, status: 'Ativo' },
  { id: 'boasvindas', nome: 'Boas-vindas', gatilho: 'Cadastro na newsletter', etapas: 2, enviados: 0, aberturaPct: 0, cliquesPct: 0, receita: 0, status: 'Rascunho' },
]

export const ETAPAS_FLUXO: Record<string, EtapaFluxo[]> = {
  carrinho: [
    { quando: 'após 1 hora', assunto: 'Esqueceu algo no carrinho?', corpo: 'Lembrete simples com os itens e o frete já calculado', cupom: '', aberturaPct: 52.1, receita: 2180 },
    { quando: 'após 24 horas', assunto: 'Seu carrinho expira em breve', corpo: 'Prova social com avaliações do Judge.me do mesmo perfume', cupom: 'VOLTA10', aberturaPct: 47.3, receita: 2410 },
    { quando: 'após 72 horas', assunto: 'Última chance · 10% de desconto', corpo: 'Urgência e escassez do decant fracionado', cupom: 'VOLTA10', aberturaPct: 41.8, receita: 1020 },
  ],
  poscompra: [
    { quando: 'na confirmação de entrega', assunto: 'Chegou! Como usar seu decant', corpo: 'Cuidados com o frasco, conservação e camadas da fragrância', cupom: '', aberturaPct: 68.2, receita: 0 },
    { quando: 'após 3 dias', assunto: 'Combina com o que você levou', corpo: 'Sugestão de fragrância complementar na mesma família olfativa', cupom: '', aberturaPct: 54.8, receita: 3240 },
  ],
  avaliacao: [
    { quando: '7 dias após a entrega', assunto: 'O que achou da fragrância?', corpo: 'Convite do Judge.me pedindo foto do frasco e do lacre', cupom: '', aberturaPct: 58.4, receita: 0 },
    { quando: 'após 12 dias', assunto: 'Avalie e ganhe até 20% de desconto', corpo: 'Reforço explicando que foto rende 15% e vídeo rende 20%', cupom: 'JM · automático', aberturaPct: 51.2, receita: 1980 },
  ],
  recompra: [
    { quando: '45 dias sem comprar', assunto: 'Seu decant deve estar acabando', corpo: 'Cálculo de duração pelo volume comprado e uso médio', cupom: '', aberturaPct: 42.1, receita: 1490 },
    { quando: 'após 60 dias', assunto: 'Repor o mesmo ou provar outro?', corpo: 'Dois caminhos: recompra rápida ou kit descoberta', cupom: '', aberturaPct: 38.6, receita: 1830 },
    { quando: 'após 90 dias', assunto: 'Sentimos sua falta', corpo: 'Última tentativa antes de marcar o cliente como inativo', cupom: 'VOLTA10', aberturaPct: 37.5, receita: 800 },
  ],
  aniversario: [
    { quando: 'no dia do aniversário', assunto: 'Um presente da Frenesi para você', corpo: 'Cupom pessoal válido por 15 dias, com sugestão pela última compra', cupom: 'ANIVER20', aberturaPct: 66.1, receita: 1640 },
  ],
  boasvindas: [
    { quando: 'no cadastro', assunto: 'Bem-vindo à Frenesi', corpo: 'Apresenta o conceito de decant fracionado e as cinco variantes', cupom: '', aberturaPct: 0, receita: 0 },
    { quando: 'após 2 dias', assunto: 'Por onde começar', corpo: 'Kit descoberta de 3 ml para experimentar antes de investir', cupom: '', aberturaPct: 0, receita: 0 },
  ],
}

export const REGRAS_CASHBACK: RegraCashback[] = [
  { faixa: 'Primeira compra', pct: 3, validade: '60 dias', minimo: 0, ativa: true },
  { faixa: 'Recorrente · 2ª à 5ª compra', pct: 5, validade: '90 dias', minimo: 150, ativa: true },
  { faixa: 'VIP · acima de R$ 3.000 comprados', pct: 8, validade: '120 dias', minimo: 0, ativa: true },
  { faixa: 'Compra de kit ou combo', pct: 10, validade: '90 dias', minimo: 400, ativa: false },
]

/** Só gerado e usado — o saldo é derivado por `saldoDe`, nunca digitado. */
export const SALDOS_CASHBACK: SaldoCashback[] = [
  { cliente: 'Beatriz Lima', perfil: 'VIP', gerado: 126, usado: 0, expiraEmDias: 84 },
  { cliente: 'Camila Rocha', perfil: 'VIP', gerado: 84, usado: 0, expiraEmDias: 12 },
  { cliente: 'Larissa Duarte', perfil: 'VIP', gerado: 65, usado: 65, expiraEmDias: null },
  { cliente: 'Rafael Andrade', perfil: 'Recorrente', gerado: 41, usado: 0, expiraEmDias: 47 },
  { cliente: 'Marcos Ferreira', perfil: 'Recorrente', gerado: 22, usado: 0, expiraEmDias: 3 },
  { cliente: 'Juliana Prado', perfil: 'Recorrente', gerado: 18, usado: 18, expiraEmDias: null },
]

export const GIFTBACKS: GiftbackEmitido[] = [
  { codigo: 'GB-2291', cliente: 'Camila Rocha', origem: 'Compra #10482', valor: 40, minimo: 250, emitido: 'hoje 09:14', validade: '30 dias', estado: 'Disponível', sincronizado: true },
  { codigo: 'GB-2290', cliente: 'Rafael Andrade', origem: 'Compra #10481', valor: 25, minimo: 150, emitido: 'hoje 08:02', validade: '30 dias', estado: 'Disponível', sincronizado: false },
  { codigo: 'GB-2289', cliente: 'Beatriz Lima', origem: 'Compra #10478', valor: 50, minimo: 300, emitido: '02/08 14:20', validade: '30 dias', estado: 'Resgatado', sincronizado: true },
  { codigo: 'GB-2288', cliente: 'Larissa Duarte', origem: 'Compra #10476', valor: 80, minimo: 400, emitido: '01/08 16:44', validade: '30 dias', estado: 'Disponível', sincronizado: true },
  { codigo: 'GB-2287', cliente: 'Eduardo Salles', origem: 'Compra #10412', valor: 20, minimo: 150, emitido: '04/07 10:10', validade: 'venceu', estado: 'Expirado', sincronizado: true },
]

// ── Promoções ──────────────────────────────────────────────────────────────

export const CUPONS: CupomPromo[] = [
  { codigo: 'VOLTA10', tipo: '10% de desconto', regra: 'Carrinhos abandonados · mínimo R$ 250', usos: 34, limite: 200, receita: 12480, desconto: 1387, margem: 19.4, status: 'Ativo', validade: 'até 31/08', shopify: 'Ativo', yampi: 'Ativo' },
  { codigo: 'FRENESI15', tipo: '15% de desconto', regra: 'Primeira compra · todos os canais', usos: 128, limite: 500, receita: 41290, desconto: 7286, margem: 15.1, status: 'Ativo', validade: 'até 30/09', shopify: 'Ativo', yampi: 'Ativo' },
  { codigo: 'KITVERAO', tipo: 'R$ 40 off', regra: 'Kits de 3 decants · acima de R$ 400', usos: 19, limite: 100, receita: 9640, desconto: 760, margem: 22.8, status: 'Ativo', validade: 'até 15/08', shopify: 'Ativo', yampi: 'Pendente' },
  { codigo: 'FRETEGRATIS', tipo: 'Frete grátis', regra: 'Sudeste · acima de R$ 350', usos: 76, limite: 0, receita: 28110, desconto: 2110, margem: 11.2, status: 'Revisar', validade: 'sem prazo', shopify: 'Ativo', yampi: 'Divergente' },
  { codigo: 'ANIVER20', tipo: '20% de desconto', regra: 'Aniversário do cliente · válido por 15 dias', usos: 26, limite: 0, receita: 1640, desconto: 410, margem: 17.9, status: 'Ativo', validade: 'contínuo', shopify: 'Ativo', yampi: 'Ativo' },
  { codigo: 'BLACK30', tipo: '30% de desconto', regra: 'Campanha encerrada', usos: 214, limite: 250, receita: 52340, desconto: 22432, margem: 4.6, status: 'Encerrado', validade: 'expirou 30/11', shopify: 'Encerrado', yampi: 'Encerrado' },
]

/**
 * Vitrine publicada: preço praticado, giro e tempo parado por variante.
 * O rodízio de ofertas sorteia daqui — esgotado sai sozinho porque a base
 * (PERFUMES_BASE) é a mesma fonte do estoque.
 */
export const VITRINE: ItemVitrine[] = [
  { baseId: 'bac', variante: 5, preco: 79.9, vendas30: 62, diasParado: 0 },
  { baseId: 'bac', variante: 10, preco: 139.9, vendas30: 38, diasParado: 0 },
  { baseId: 'sau', variante: 5, preco: 54.9, vendas30: 71, diasParado: 0 },
  { baseId: 'sau', variante: 15, preco: 148.9, vendas30: 24, diasParado: 2 },
  { baseId: 'ave', variante: 10, preco: 164.9, vendas30: 9, diasParado: 11 },
  { baseId: 'ave', variante: 3, preco: 42.9, vendas30: 4, diasParado: 19 },
  { baseId: 'erb', variante: 5, preco: 86.9, vendas30: 3, diasParado: 26 },
  { baseId: 'erb', variante: 15, preco: 194.9, vendas30: 1, diasParado: 41 },
  { baseId: 'del', variante: 5, preco: 62.9, vendas30: 11, diasParado: 6 },
  { baseId: 'del', variante: 8, preco: 92.9, vendas30: 2, diasParado: 33 },
  { baseId: 'blu', variante: 3, preco: 38.9, vendas30: 5, diasParado: 22 },
  { baseId: 'blu', variante: 10, preco: 118.9, vendas30: 7, diasParado: 14 },
  { baseId: 'gg', variante: 5, preco: 58.9, vendas30: 1, diasParado: 47 },
  { baseId: 'gg', variante: 10, preco: 104.9, vendas30: 0, diasParado: 58 },
  { baseId: 'oud', variante: 5, preco: 94.9, vendas30: 28, diasParado: 1 },
  { baseId: 'erb', variante: 10, preco: 154.9, vendas30: 6, diasParado: 17 },
]

export const RODIZIO_HISTORICO = [
  { quando: '01/08 09:00', itens: 10, receita: 6480, conversao: '4,2%', destaque: 'Good Girl 10 ml saiu de 58 dias parado' },
  { quando: '30/07 09:00', itens: 10, receita: 5120, conversao: '3,6%', destaque: 'Erba Pura 15 ml vendeu 2 unidades' },
  { quando: '28/07 09:00', itens: 8, receita: 4390, conversao: '3,1%', destaque: 'Bleu de Chanel 3 ml zerou o encalhe' },
]

export interface AvaliacaoCupom {
  codigo: string
  cliente: string
  email: string
  produto: string
  estrelas: number
  midia: 'Foto' | 'Vídeo'
  /** % de desconto — foto rende 15, vídeo 20, 4 estrelas 10. */
  valorPct: number
  emitido: string
  validade: string
  yampi: 'Criado' | 'Pendente' | 'Erro'
  usado: boolean
}

export const AVALIACOES_CUPONS: AvaliacaoCupom[] = [
  { codigo: 'JM-FOTO-4821', cliente: 'Camila Rocha', email: 'camila.rocha@email.com', produto: 'Baccarat Rouge 540 · 5 ml', estrelas: 5, midia: 'Foto', valorPct: 15, emitido: 'hoje 07:40', validade: '90 dias', yampi: 'Criado', usado: false },
  { codigo: 'JM-VIDEO-4820', cliente: 'Rafael Andrade', email: 'rafael.andrade@email.com', produto: 'Oud Wood · 5 ml', estrelas: 5, midia: 'Vídeo', valorPct: 20, emitido: 'hoje 06:55', validade: '90 dias', yampi: 'Criado', usado: false },
  { codigo: 'JM-FOTO-4819', cliente: 'Beatriz Lima', email: 'bia.lima@email.com', produto: 'Delina · 10 ml', estrelas: 4, midia: 'Foto', valorPct: 10, emitido: 'ontem 19:12', validade: '90 dias', yampi: 'Criado', usado: true },
  { codigo: 'JM-VIDEO-4818', cliente: 'Larissa Duarte', email: 'larissa.d@email.com', produto: 'Sauvage Elixir · 15 ml', estrelas: 5, midia: 'Vídeo', valorPct: 20, emitido: 'ontem 15:38', validade: '90 dias', yampi: 'Pendente', usado: false },
  { codigo: 'JM-FOTO-4817', cliente: 'Marcos Ferreira', email: 'marcos.f@email.com', produto: 'Aventus · 10 ml', estrelas: 5, midia: 'Foto', valorPct: 15, emitido: '02/08 11:20', validade: '90 dias', yampi: 'Erro', usado: false },
  { codigo: 'JM-FOTO-4816', cliente: 'Ana Clara Mota', email: 'ana.mota@email.com', produto: 'Erba Pura · 5 ml', estrelas: 4, midia: 'Foto', valorPct: 10, emitido: '01/08 09:05', validade: '90 dias', yampi: 'Criado', usado: true },
]

// ── Atendimento ────────────────────────────────────────────────────────────

export const ATENDIMENTO: TicketAtendimento[] = [
  { id: 'AT-882', cliente: 'Beatriz Lima', pedido: '#10478', canal: 'WhatsApp', assunto: 'Pedido sem movimentação há 4 dias', abertura: 'hoje 09:20', esperaMin: 160, prioridade: 'Alta', responsavel: 'Bianca A.', origem: 'Rastreamento' },
  { id: 'AT-881', cliente: 'Juliana Prado', pedido: '#10480', canal: 'E-mail', assunto: 'Entrega não efetuada · destinatário ausente', abertura: 'hoje 08:05', esperaMin: 245, prioridade: 'Alta', responsavel: 'Bianca A.', origem: 'Rastreamento' },
  { id: 'AT-880', cliente: 'Caio Bastos', pedido: '#10460', canal: 'Portal', assunto: 'Contesta recusa da devolução DEV-1037', abertura: 'ontem 21:10', esperaMin: 900, prioridade: 'Alta', responsavel: 'Não atribuída', origem: 'Devoluções' },
  { id: 'AT-879', cliente: 'Tiago Nunes', pedido: '#10479', canal: 'WhatsApp', assunto: 'Quer trocar forma de pagamento', abertura: 'ontem 17:44', esperaMin: 1080, prioridade: 'Média', responsavel: 'Marina F.', origem: 'Pedidos' },
  { id: 'AT-878', cliente: 'Camila Rocha', pedido: '#10482', canal: 'Instagram', assunto: 'Pergunta sobre prazo de envio', abertura: 'ontem 14:02', esperaMin: 1440, prioridade: 'Baixa', responsavel: 'Bianca A.', origem: 'Pré-venda' },
  { id: 'AT-877', cliente: 'Larissa Duarte', pedido: '#10476', canal: 'E-mail', assunto: 'Elogio · pediu indicação de fragrância', abertura: '01/08 10:15', esperaMin: null, prioridade: 'Baixa', responsavel: 'Bianca A.', origem: 'CRM' },
]

export const ATENDIMENTO_RESPONDIDAS_HOJE = { qtd: 9, tempoMedio: '1h 12min' }
export const ATENDIMENTO_RESOLVIDAS_IA = { qtd: 4, hint: 'Consultas de prazo e rastreio' }

// ── Relatórios ─────────────────────────────────────────────────────────────

export const RELATORIOS_LISTA: { titulo: string; descricao: string; area: string; atencao: boolean }[] = [
  { titulo: 'Vendas por canal', descricao: 'Shopify, Yampi e WhatsApp com ticket e margem', area: 'Comercial', atencao: false },
  { titulo: 'Curva ABC de produtos', descricao: 'Quais perfumes sustentam o faturamento', area: 'Comercial', atencao: false },
  { titulo: 'Coorte de recompra', descricao: 'Quantos clientes voltam por mês de entrada', area: 'CRM', atencao: false },
  { titulo: 'Margem por variante', descricao: 'Rentabilidade de 3, 5, 8, 10 e 15 ml', area: 'Financeiro', atencao: false },
  { titulo: 'Giro e cobertura de estoque', descricao: 'Dias de cobertura por perfume base', area: 'Estoque', atencao: true },
  { titulo: 'Devoluções por motivo', descricao: 'O que mais volta e por quê', area: 'Pós-venda', atencao: false },
  { titulo: 'Desempenho de cupons', descricao: 'Receita e margem por código', area: 'Promoções', atencao: false },
  { titulo: 'Prazo de entrega por transportadora', descricao: 'Prometido contra realizado', area: 'Logística', atencao: true },
]

export const CANAIS_JULHO = [
  { canal: 'Shopify', pedidos: 286, receita: 118240, margem: 23.1 },
  { canal: 'Yampi · checkout', pedidos: 142, receita: 58960, margem: 22.4 },
  { canal: 'WhatsApp', pedidos: 44, receita: 18140, margem: 27.8 },
  { canal: 'Instagram', pedidos: 10, receita: 3090, margem: 19.6 },
]

/** Participação de cada perfume na receita — o acumulado é derivado na tela. */
export const CURVA_ABC = [
  { produto: 'Sauvage Elixir', partPct: 24.1 },
  { produto: 'Baccarat Rouge 540', partPct: 21.6 },
  { produto: 'Oud Wood', partPct: 14.8 },
  { produto: 'Delina', partPct: 11.2 },
  { produto: 'Aventus', partPct: 9.4 },
  { produto: 'Erba Pura', partPct: 7.3 },
  { produto: 'Bleu de Chanel', partPct: 6.9 },
  { produto: 'Good Girl', partPct: 4.7 },
]

// ── Meu Assessor IA ────────────────────────────────────────────────────────

export interface RegraIa {
  acao: string
  modulo: string
  limite: string
  permitida: boolean
  /** Quando permitida, exige confirmação humana antes de executar. */
  aprovacao: boolean
  motivo: string
}

export const IA_REGRAS: RegraIa[] = [
  { acao: 'Consultar estoque, preço e pedidos', modulo: 'Leitura', limite: 'sem limite', permitida: true, aprovacao: false, motivo: 'Só leitura · não altera nenhum dado' },
  { acao: 'Registrar lançamento financeiro', modulo: 'Financeiro', limite: 'até R$ 1.000,00', permitida: true, aprovacao: true, motivo: 'Acima do limite exige confirmação no WhatsApp' },
  { acao: 'Dar baixa de entrega na Shopify', modulo: 'Pedidos', limite: 'sem limite', permitida: true, aprovacao: false, motivo: 'Só quando a Yampi confirma a entrega' },
  { acao: 'Criar ordem de produção', modulo: 'Produção', limite: 'até 20 unidades', permitida: true, aprovacao: true, motivo: 'Consome volume de base · sempre confirma' },
  { acao: 'Aplicar desconto no rodízio', modulo: 'Promoções', limite: 'até o piso de margem', permitida: true, aprovacao: true, motivo: 'Nunca abaixo do piso, mesmo com aprovação' },
  { acao: 'Aprovar ou recusar devolução', modulo: 'Devoluções', limite: '—', permitida: false, aprovacao: true, motivo: 'Depende de avaliação das fotos · decisão humana' },
  { acao: 'Criar cupom novo', modulo: 'Promoções', limite: '—', permitida: false, aprovacao: true, motivo: 'Só usa códigos já ativos nas duas plataformas' },
  { acao: 'Alterar preço de venda', modulo: 'Precificação', limite: '—', permitida: false, aprovacao: true, motivo: 'Preço é decisão de margem · fora do escopo da IA' },
  { acao: 'Alterar permissões de usuário', modulo: 'Configurações', limite: '—', permitida: false, aprovacao: true, motivo: 'Risco de escalada de acesso' },
]

export interface AutorizadoIa {
  nome: string
  numero: string
  perfil: string
  desde: string
  escopo: string
  comandos: number
  ultimo: string
  ativo: boolean
  iniciais: string
}

export const IA_AUTORIZADOS: AutorizadoIa[] = [
  { nome: 'João Marcelo', numero: '+55 11 9•••• 4821', perfil: 'Administrador', desde: 'há 3 meses', escopo: 'Todas as ações permitidas nas regras', comandos: 84, ultimo: 'hoje 09:42', ativo: true, iniciais: 'JM' },
  { nome: 'Marina Ferraz', numero: '+55 11 9•••• 7710', perfil: 'Operação', desde: 'há 2 meses', escopo: 'Estoque, produção e pedidos', comandos: 31, ultimo: 'hoje 08:15', ativo: true, iniciais: 'MF' },
  { nome: 'Pedro Anselmo', numero: '+55 11 9•••• 2204', perfil: 'Operação', desde: 'há 1 mês', escopo: 'Consulta de estoque apenas', comandos: 12, ultimo: 'ontem 17:40', ativo: true, iniciais: 'PA' },
  { nome: 'Rita Camargo', numero: '+55 11 9•••• 5583', perfil: 'Financeiro', desde: 'há 5 meses', escopo: 'Revogado em 28/07', comandos: 0, ultimo: '27/07 14:10', ativo: false, iniciais: 'RC' },
]

export interface ComandoIa {
  quando: string
  canal: string
  autor: string
  comando: string
  interpretacao: string
  resultado: string
  estado: 'Executado' | 'Recusado' | 'Aguardando'
}

export const IA_COMANDOS: ComandoIa[] = [
  { quando: 'hoje 09:42', canal: 'WhatsApp · áudio', autor: 'João Marcelo', comando: 'Lança a despesa da transportadora, 1.240 reais, saiu da conta Inter hoje', interpretacao: 'Lançamento de saída · Logística · Inter PJ', resultado: 'Criado após confirmação', estado: 'Executado' },
  { quando: 'hoje 09:41', canal: 'WhatsApp · áudio', autor: 'João Marcelo', comando: 'Confirma se o Baccarat base tem volume pra semana', interpretacao: 'Consulta de estoque · Baccarat Rouge 540', resultado: 'Respondido no WhatsApp', estado: 'Executado' },
  { quando: 'hoje 08:55', canal: 'ERP', autor: 'Marina Ferraz', comando: 'Criar cupom de 10% para os carrinhos de ontem', interpretacao: 'Criação de cupom novo', resultado: 'Bloqueado por regra · usar VOLTA10 existente', estado: 'Recusado' },
  { quando: 'hoje 08:20', canal: 'WhatsApp · texto', autor: 'Marina Ferraz', comando: 'Dá baixa nos pedidos que a Yampi já entregou', interpretacao: 'Baixa de entrega na Shopify · 3 pedidos', resultado: 'Executado sem confirmação', estado: 'Executado' },
  { quando: 'hoje 07:58', canal: 'WhatsApp · áudio', autor: 'João Marcelo', comando: 'Paga aquela conta de ontem', interpretacao: 'Não identificou qual lançamento', resultado: 'Pediu esclarecimento ao usuário', estado: 'Aguardando' },
  { quando: 'ontem 17:40', canal: 'WhatsApp · texto', autor: 'Pedro Anselmo', comando: 'Quanto tem de Oud Wood', interpretacao: 'Consulta de estoque · Oud Wood', resultado: 'Respondido: esgotado', estado: 'Executado' },
  { quando: 'ontem 15:22', canal: 'WhatsApp · áudio', autor: 'Número desconhecido', comando: 'Mensagem de número não autorizado', interpretacao: 'Remetente não verificado', resultado: 'Ignorado e registrado', estado: 'Recusado' },
]

export interface PublicoIa {
  id: string
  nome: string
  contatos: number
  descricao: string
}

export const IA_PUBLICOS: PublicoIa[] = [
  { id: 'todos', nome: 'Base completa', contatos: 4820, descricao: 'Todos os contatos com opt-in' },
  { id: 'amadeirados', nome: 'Compraram amadeirados', contatos: 1284, descricao: 'Afinidade olfativa pelo histórico' },
  { id: 'vip', nome: 'VIP', contatos: 186, descricao: 'Acima de R$ 3.000 comprados' },
  { id: 'inativos', nome: 'Sem comprar há 90 dias', contatos: 742, descricao: 'Última compra antes de maio' },
  { id: 'carrinho', nome: 'Abandonaram carrinho', contatos: 311, descricao: 'Últimos 30 dias, sem conversão' },
  { id: 'aniversariantes', nome: 'Aniversariantes do mês', contatos: 96, descricao: 'Data de nascimento cadastrada' },
]

export interface TipoCampanhaIa {
  id: 'lancamento' | 'ofertas' | 'reativacao' | 'data' | 'vip'
  nome: string
  descricao: string
  publicoPadrao: string
  prompt: string
}

export const IA_CAMPANHAS: TipoCampanhaIa[] = [
  { id: 'lancamento', nome: 'Lançamento', descricao: 'Perfume novo no catálogo', publicoPadrao: 'amadeirados', prompt: 'Lançamento do Layton, chegou esta semana nas cinco variantes. Tom de novidade e exclusividade, sem desconto. Falar do perfil olfativo e sugerir começar pelo 5 ml.' },
  { id: 'ofertas', nome: 'Coleção Ofertas', descricao: 'Rodízio de encalhados', publicoPadrao: 'amadeirados', prompt: 'Campanha para os produtos encalhados que entraram na coleção Ofertas desta semana. Tom sóbrio, sem parecer liquidação. Priorizar quem já comprou amadeirados.' },
  { id: 'reativacao', nome: 'Reativação', descricao: 'Clientes parados há 90 dias', publicoPadrao: 'inativos', prompt: 'Trazer de volta quem não compra há mais de 90 dias. Lembrar dos mais vendidos, oferecer cupom de retorno e reforçar que o decant dura pouco.' },
  { id: 'data', nome: 'Data comemorativa', descricao: 'Dia dos Pais, Natal, Black Friday', publicoPadrao: 'todos', prompt: 'Campanha de Dia dos Pais. Presentear com perfume sem errar o gosto: sugerir kit de amadeirados e a opção de 3 ml para experimentar antes.' },
  { id: 'vip', nome: 'Exclusiva VIP', descricao: 'Base de maior valor', publicoPadrao: 'vip', prompt: 'Pré-venda exclusiva para clientes VIP, 48 horas antes do lançamento público. Tom de acesso antecipado, sem desconto agressivo.' },
]
