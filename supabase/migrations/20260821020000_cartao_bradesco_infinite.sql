-- ═══════════════════════════════════════════════════════════════════════════
-- O cartão do Bradesco é o Infinite, e o nome precisa dizer isso.
--
-- "Cartão Bradesco" e "Rafael (PF)" (conta corrente, banco Bradesco) ficavam
-- com o MESMO tile vermelho na tela de Contas e carteiras — duas linhas
-- visualmente idênticas para coisas que não têm nada a ver uma com a outra.
-- Com "Infinite" no nome, o tile do cartão passa a ser o preto, e a conta
-- corrente segue com o vermelho da marca.
--
-- Só o rótulo muda. O id continua `cartao-bradesco`, então lançamento,
-- vencimento e saldo seguem apontando para a mesma conta.
-- ═══════════════════════════════════════════════════════════════════════════

update contas_bancarias
   set nome = 'Cartão Bradesco Infinite'
 where id = 'cartao-bradesco';
