/**
 * Dados fictícios do handoff (CNPJ, endereço, clientes, custos e preços são
 * inventados). Servem para as telas renderizarem antes do Supabase estar
 * populado — a migration em `supabase/migrations` é o schema de verdade.
 *
 * Nada aqui é KPI pré-calculado: são só os fatos. Toda grandeza mostrada na
 * tela é derivada destes registros pelas funções de `src/domain`.
 */

import type {
  Lote,
  Pedido,
  PerfumeBase,
  ProdutoDerivado,
  VarianteMl,
} from '@/domain'

export const PERFUMES_BASE: PerfumeBase[] = [
  { id: 'bac', nome: 'Baccarat Rouge 540', marca: 'Maison Francis', custoPorMl: 3.1, volumeMl: 640, consumoDiarioMl: 51 },
  { id: 'blu', nome: 'Bleu de Chanel', marca: 'Chanel', custoPorMl: 2.9, volumeMl: 760, consumoDiarioMl: 14 },
  { id: 'sau', nome: 'Sauvage Elixir', marca: 'Dior', custoPorMl: 2.6, volumeMl: 1180, consumoDiarioMl: 30 },
  { id: 'erb', nome: 'Erba Pura', marca: 'Xerjoff', custoPorMl: 3.95, volumeMl: 520, consumoDiarioMl: 25 },
  { id: 'ave', nome: 'Aventus', marca: 'Creed', custoPorMl: 4.15, volumeMl: 410, consumoDiarioMl: 11 },
  { id: 'del', nome: 'Delina', marca: 'Parfums de Marly', custoPorMl: 3.8, volumeMl: 90, consumoDiarioMl: 22 },
  { id: 'oud', nome: 'Oud Wood', marca: 'Tom Ford', custoPorMl: 4.4, volumeMl: 0, consumoDiarioMl: 6 },
  { id: 'gg', nome: 'Good Girl', marca: 'Carolina Herrera', custoPorMl: 2.45, volumeMl: 340, consumoDiarioMl: 3 },
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

/** Contas a pagar e vencidas — a contagem alimenta as pendências do dashboard. */
export const CONTAS_ABERTAS = [
  { descricao: 'Simples Nacional · competência 07', valor: 4820.0, status: 'Vencido' as const },
  { descricao: 'Importadora Aurum · lote LT-098', valor: 3960.0, status: 'A pagar' as const },
  { descricao: 'Meta Ads · agosto', valor: 2480.0, status: 'A pagar' as const },
  { descricao: 'Nicho Distribuidora · frascaria', valor: 1140.0, status: 'A pagar' as const },
]

export const CARRINHOS_PRIORIDADE_ALTA = 6
export const COMANDOS_IA_AGUARDANDO = 2
export const PEDIDOS_A_SEPARAR = 17
