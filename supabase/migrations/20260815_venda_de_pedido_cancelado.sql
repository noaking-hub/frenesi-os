-- Pedido CANCELADO não gera receita de venda, mesmo com crédito no extrato.
--
-- O dinheiro entrou de verdade — a linha do extrato existe — mas chamá-lo de
-- "Venda" num pedido cancelado infla o faturamento recebido e cria uma venda
-- que a tela de Pedidos jura que não aconteceu. Três pedidos assim somavam
-- R$ 1.631,63, e um deles sozinho respondia por R$ 540,00 do dia 10/08 — o
-- caso que expôs o problema.
--
-- O tratamento é o mesmo do crédito sem pedido: entra como caixa a
-- classificar, com o número do pedido no nome. O dinheiro continua no saldo,
-- que é a verdade, e alguém decide o que ele é — estorno pendente, venda que
-- não devia estar cancelada, ou cobrança em duplicidade.
--
-- A função inteira está no arquivo 20260815_caixa_real_extrato.sql; aqui vai
-- só o que mudou, para o histórico ficar legível:
--   * as duas inserções de venda e de tarifa ganharam `p.situacao <> 'cancelado'`
--   * a inserção de "crédito a classificar" passou a alcançar o cancelado
--     também, com o motivo no texto
--
-- Reparo do que já estava gravado:
update lancamentos l
   set categoria = null, categoria_id = null, pedido_id = null,
       descricao = 'Crédito a classificar – pedido ' || p.id || ' cancelado'
  from pedidos p
 where p.id = l.pedido_id
   and l.tipo = 'entrada' and l.categoria_id = 'vendas'
   and l.origem like 'Extrato %' and l.cancelado_em is null
   and p.situacao::text = 'cancelado';
