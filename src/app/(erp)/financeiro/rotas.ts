/**
 * As rotas que um fato financeiro invalida.
 *
 * Mora fora de `acoes-gerenciais.ts` porque aquele arquivo é `'use server'`, e
 * módulo de Server Actions só pode exportar função assíncrona — uma constante
 * exportada de lá vira erro de build.
 *
 * A lista existe para não ser reescrita: `registrarVendaManual` revalidava
 * `/pedidos`, `/estoque`, `/financeiro` e `/`, e esquecia justamente
 * `/financeiro/lancamentos`, que é a tela de ONDE o botão "+ Nova venda manual"
 * é clicado — o dono registrava a venda e a lista atrás do modal continuava
 * mostrando o mundo de antes. Com o parcelamento isso ficou pior: as parcelas
 * novas nascem em "Próximos vencimentos" e na projeção de caixa, duas telas
 * que também estavam de fora.
 *
 * Só as rotas do módulo — o resto do ERP não muda quando um boleto é pago, e
 * revalidar `'/', 'layout'` reconstrói o ERP inteiro a cada baixa (foi o que
 * estourou o limite de 26 s da Netlify no módulo de Devoluções).
 */
export const ROTAS_DO_FINANCEIRO = [
  '/financeiro',
  '/financeiro/lancamentos',
  '/financeiro/contas',
  '/financeiro/fluxo-de-caixa',
  '/financeiro/dre',
  '/financeiro/conciliacao',
  '/financeiro/categorias',
] as const
