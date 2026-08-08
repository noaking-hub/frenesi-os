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
  CategoriaFinanceira,
  FonteConcorrente,
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
  Repasse,
  StatusSolicitacao,
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
  { nome: 'Decants do Bruno', dominio: 'decantsdobruno.com.br', status: 'Lida', quando: 'hoje 06:12', itensLidos: 148 },
  { nome: 'Essência Rara', dominio: 'essenciararaperfumes.com', status: 'Lida', quando: 'hoje 06:14', itensLidos: 212 },
  { nome: 'Frações Nobres', dominio: 'fracoesnobres.com.br', status: 'Parcial', quando: 'hoje 06:18', itensLidos: 63 },
  { nome: 'Perfume Lab', dominio: 'perfumelab.store', status: 'Bloqueada', quando: 'ontem 22:40', itensLidos: 0 },
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
  unidades,
  variante,
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
  itens: ItemAferido[]
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
  { id: 'inter', nome: 'Inter PJ', tipo: 'Conta corrente', banco: 'Banco Inter · 077', saldo: 38420, entradasMes: 16240, saidasMes: 12980, uso: 'Operacional · repasses e fornecedores', principal: true },
  { id: 'nubank', nome: 'Nubank PJ', tipo: 'Conta corrente', banco: 'Nu Pagamentos · 260', saldo: 18960, entradasMes: 5340, saidasMes: 4111, uso: 'Ferramentas, ADS e assinaturas', principal: false },
  { id: 'reserva', nome: 'Reserva', tipo: 'Caixa de rendimento', banco: 'Inter · CDB liquidez diária', saldo: 5100, entradasMes: 0, saidasMes: 0, uso: 'Colchão de 1 mês de custo fixo', principal: false },
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
    linha: 'Receita bruta',
    valor: 198430,
    nota: '482 pedidos faturados · ticket médio R$ 412',
  },
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

export const CARRINHOS_PRIORIDADE_ALTA = 6
export const COMANDOS_IA_AGUARDANDO = 2
export const PEDIDOS_A_SEPARAR = 17
