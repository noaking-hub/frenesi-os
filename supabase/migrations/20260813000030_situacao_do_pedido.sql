-- Os quatro momentos reais do pedido, e o status BRUTO que os originou.
--
-- Até aqui o ERP guardava só `envio`, derivado na importação e sem guardar o
-- que a Yampi disse. Isso custava duas coisas:
--
--  1. "Faturado" e "aguardando envio" caíam ambos em `aguardando_envio` — os
--     50 pedidos dessa fila hoje são uma mistura dos dois, e não há como
--     separá-los sem reimportar.
--  2. Corrigir a regra de derivação exigia reimportar a Yampi inteira. Com o
--     alias guardado, a correção é um UPDATE.
--
-- A regra continua a mesma: derivado NUNCA é fonte. `status_yampi` é o fato;
-- `situacao` é a leitura que o ERP faz dele.
alter table pedidos add column if not exists status_yampi text;

-- pago | em_producao | faturado | enviado | entregue | cancelado
--
-- Três destes vêm da Yampi (pago, faturado, enviado) e um é NOSSO:
-- `em_producao` nasce quando a ordem de produção do pedido é aberta aqui, e é
-- o único momento do ciclo que a Yampi não conhece. Por isso ele não pode ser
-- derivado do status dela — seria apagado na importação seguinte.
alter table pedidos add column if not exists situacao text;

-- Quando o pedido entrou em produção no ERP, e quando a loja foi avisada.
-- Separados porque a segunda pode falhar sem invalidar a primeira: a produção
-- começou de fato, ainda que a Shopify não tenha aceitado a marcação.
alter table pedidos add column if not exists producao_em timestamptz;
alter table pedidos add column if not exists producao_shopify_em timestamptz;

create index if not exists pedidos_situacao_idx on pedidos (situacao, comprado_em desc);

comment on column pedidos.status_yampi is 'Alias cru do status na Yampi — o fato, guardado para a derivação poder ser corrigida sem reimportar';
comment on column pedidos.situacao is 'pago | em_producao | faturado | enviado | entregue | cancelado';
comment on column pedidos.producao_em is 'Quando a ordem de produção deste pedido foi aberta no ERP';

-- Carga inicial a partir do que já existe. `em_producao` fica de fora: ele
-- nunca foi registrado, e inventá-lo agora seria escrever histórico falso.
update pedidos set situacao = case
  when pagamento = 'cancelado' then 'cancelado'
  when envio = 'entregue' then 'entregue'
  when envio = 'enviado' then 'enviado'
  when envio = 'aguardando_envio' then 'faturado'
  else 'pago'
end
where situacao is null;
