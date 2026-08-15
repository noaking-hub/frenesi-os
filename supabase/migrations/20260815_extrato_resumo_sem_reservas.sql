-- Os totais do extrato contavam as RESERVAS do Mercado Pago.
--
-- Cada transferência do MP gera três linhas: reserva criada (débito), reserva
-- liberada (crédito) e transferência para o banco (débito). As duas primeiras
-- se anulam no saldo, mas inflavam "entradas" e "saídas" em R$ 31.810,95 cada
-- uma — a tela dizia que tinha entrado dinheiro que nunca entrou.
--
-- O saldo já estava certo (as pernas se cancelam); o que estava errado era o
-- tamanho das duas colunas e a contagem de linhas. A transferência para o
-- banco continua contando: ela é a saída de verdade.
create or replace view extrato_resumo as
select
  count(*) filter (where not ignorado and descricao not ilike 'Reserva%') as linhas,
  coalesce(sum(valor) filter (
    where tipo = 'entrada' and not ignorado and descricao not ilike 'Reserva%'
  ), 0) as entradas,
  coalesce(sum(valor) filter (
    where tipo = 'saida' and not ignorado and descricao not ilike 'Reserva%'
  ), 0) as saidas,
  count(*) filter (
    where not ignorado and tipo = 'entrada' and pedido_id is not null
  ) as conciliadas,
  count(*) filter (
    where lancamento_id is null and not ignorado and descricao not ilike 'Reserva%'
      and (tipo = 'saida' or pedido_id is null)
  ) as a_decidir,
  count(*) filter (where ignorado) as dispensadas
from extrato_linhas;
