-- Parcela zerada não é pendência: é parcela cancelada por estorno.
--
-- Quando a venda é estornada, as parcelas futuras aparecem no relatório como
-- crédito e débito que se anulam. A linha continua existindo com valor zero, e
-- cobrar a Pagaleve por zero real é o tipo de alarme que ensina a ignorar a fila.
create or replace view public.pagaleve_a_receber as
select
  prevista_para,
  count(*)                        as parcelas,
  count(distinct checkout_id)     as vendas,
  round(sum(liquido), 2)          as liquido,
  (prevista_para < current_date)  as ja_venceu,
  bool_and(origem_da_data = 'informada') as data_confirmada
from public.pagaleve_parcelas
where liquidada_em is null and liquido <> 0
group by prevista_para
order by prevista_para;

/**
 * O repasse da Pagaleve aprende com o cronograma.
 *
 * `recebido` era o campo que faltava, e agora ele tem fonte: é a soma das
 * parcelas EFETIVAMENTE creditadas, nunca o valor da venda. Uma venda de
 * R$ 206,00 em quatro parcelas com duas pagas vale R$ 95,80 em caixa, e é
 * isso que a conciliação precisa enxergar — fingir que entrou tudo no dia da
 * compra inventaria dinheiro que só chega em 45 dias.
 */
create or replace function public.conciliar_pagaleve()
returns table (vendas int, recebido numeric) language plpgsql as $$
declare
  v_vendas int;
  v_recebido numeric;
begin
  with resumo as (
    select
      pedido_id,
      max(checkout_id)                                        as checkout_id,
      round(max(total_da_compra), 2)                          as bruto,
      round(sum(tarifa) filter (where liquidada_em is not null), 2) as tarifa_paga,
      round(sum(liquido) filter (where liquidada_em is not null), 2) as creditado,
      max(liquidada_em)                                       as ultimo_credito
    from public.pagaleve_parcelas
    where pedido_id is not null
    group by pedido_id
  )
  insert into public.repasses
    (pedido_id, origem, meio, gateway_id, bruto_gateway, taxa_real, recebido, creditado_em)
  select
    r.pedido_id, 'pagaleve', 'Pix parcelado (Pagaleve)', r.checkout_id,
    r.bruto, coalesce(r.tarifa_paga, 0), coalesce(r.creditado, 0), r.ultimo_credito
  from resumo r
  on conflict (pedido_id) do update set
    origem = 'pagaleve',
    meio = 'Pix parcelado (Pagaleve)',
    gateway_id = excluded.gateway_id,
    bruto_gateway = excluded.bruto_gateway,
    taxa_real = excluded.taxa_real,
    recebido = excluded.recebido,
    creditado_em = excluded.creditado_em;

  get diagnostics v_vendas = row_count;
  select round(sum(liquido), 2) into v_recebido
  from public.pagaleve_parcelas where liquidada_em is not null and pedido_id is not null;
  return query select v_vendas, coalesce(v_recebido, 0);
end $$;
