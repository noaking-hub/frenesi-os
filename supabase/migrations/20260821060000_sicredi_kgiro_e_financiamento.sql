-- ═══════════════════════════════════════════════════════════════════════════
-- Sicredi KGIRO FAMPE é empréstimo, não "Diversos".
--
-- Vinte parcelas de R$ 965,89 (set/2026 a abr/2028, R$ 19.317,80 no total),
-- todas em aberto na conta Inter, estavam na categoria "Diversos" — a caixa do
-- "ainda não classifiquei". Sozinhas elas respondiam por R$ 19.317,80 dos
-- R$ 21.603,73 que aquela categoria acumulava: quase tudo o que parecia
-- despesa não classificada era, na verdade, uma dívida com nome e prazo.
--
-- Vão para "Financiamento" (despesa fixa) com centro "Financeiro". Nenhuma
-- delas está baixada, então nada de caixa se move — o que muda é a linha da
-- DRE e a resposta para "quanto por mês está comprometido com banco".
--
-- ── O que esta migração NÃO conserta ───────────────────────────────────────
--
-- 1. A PARCELA INTEIRA VAI PARA A DESPESA. Parcela de empréstimo é amortização
--    do principal (devolução de dinheiro que entrou — não é custo) mais juros
--    (esses, sim). Lançar os R$ 965,89 cheios infla a despesa do mês e some com
--    a dívida, que não existe como saldo em lugar nenhum do ERP. O conserto
--    honesto depende da tabela de amortização do contrato, que ninguém informou
--    ainda; até lá, o número está classificado no lugar certo e superestimado
--    no valor.
--
-- 2. A ENTRADA DO EMPRÉSTIMO NÃO ESTÁ LANÇADA. Procurado por descrição
--    (empréstimo, giro, KGIRO, FAMPE) e por valor: não há entrada nenhuma que
--    corresponda ao dinheiro que financiou essas vinte saídas. O ERP conhece a
--    conta a pagar e desconhece o crédito que a originou.
-- ═══════════════════════════════════════════════════════════════════════════

update lancamentos
   set categoria = 'Financiamento',
       categoria_id = 'financiamento',
       centro_custo = 'financeiro'
 where cancelado_em is null
   and categoria_id = 'diversos'
   and descricao = 'Sicredi - KGIRO FAMPE';
