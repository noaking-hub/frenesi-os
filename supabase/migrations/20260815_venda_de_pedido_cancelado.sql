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

-- Segunda parte do reparo: ao reclassificar eu troquei o RÓTULO e esqueci o
-- NÚMERO. As três linhas continuavam valendo o bruto do pedido, não o que caiu
-- na conta — a tarifa retida pelo gateway virava caixa que nunca entrou.
-- O pedido de R$ 540,00 creditou R$ 459,32; o de R$ 1.041,38 creditou
-- R$ 885,80; o de R$ 50,25 creditou R$ 49,75.
update lancamentos l
   set valor = e.valor, recebido = e.valor
  from extrato_linhas e
 where e.chave = l.chave_externa
   and l.descricao like 'Crédito a classificar – pedido%cancelado'
   and l.valor <> e.valor;

-- E a tarifa lançada para eles deixa de existir: sem venda não há tarifa de
-- venda. O que o gateway reteve já está embutido na diferença entre o bruto do
-- pedido e o crédito, que agora ninguém conta como receita.
delete from lancamentos
 where id like 'ext-taxa-%'
   and pedido_id in (select id from pedidos where situacao::text = 'cancelado');
