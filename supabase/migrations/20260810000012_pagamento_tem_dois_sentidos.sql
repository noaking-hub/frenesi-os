-- ═══════════════════════════════════════════════════════════════════════════
-- `payment` significa duas coisas opostas, e a reserva dele é interna.
--
-- A primeira leitura completa do extrato expôs dois enganos meus, nenhum deles
-- no saldo — que fecha certo — e os dois na fila de decisões:
--
--   13 linhas "Venda recebida" com sinal de SAÍDA
--     O Mercado Pago usa `payment` tanto para a venda que a conta recebeu
--     quanto para a compra que a conta pagou: etiqueta de frete, ferramenta,
--     anúncio. "Venda recebida · − R$ 203,22" é uma frase que não quer dizer
--     nada, e manda a pessoa procurar um pedido que nunca existiu.
--
--   13 linhas `reserve_for_payment` cruas na fila
--     Nome que eu não tinha mapeado. É a reserva de um pagamento em curso:
--     entra e sai pelo mesmo valor (+1.450,16 e −1.450,16 no período), como
--     as outras reservas. Movimento da conta, não decisão de ninguém.
--
-- As duas somam 26 das 51 linhas que estavam pedindo atenção sem ter o que
-- decidir. Fila cheia de trabalho inventado é fila que ninguém olha — e a
-- despesa de verdade está no meio dela.
--
-- A chave da linha é derivada da descrição CRUA do relatório, não da
-- traduzida, então corrigir o texto aqui não cria linha duplicada na próxima
-- importação. Foi por isso que a chave foi feita assim.
-- ═══════════════════════════════════════════════════════════════════════════

-- Compra que a conta pagou, não venda que ela recebeu.
update extrato_linhas
   set descricao = 'Compra paga pela conta'
 where origem = 'mercadopago'
   and tipo = 'saida'
   and descricao = 'Venda recebida';

-- A reserva de pagamento é movimento interno: conta no saldo, fora da fila.
update extrato_linhas
   set descricao = 'Reserva de pagamento',
       interno = true
 where origem = 'mercadopago'
   and descricao = 'reserve_for_payment';
