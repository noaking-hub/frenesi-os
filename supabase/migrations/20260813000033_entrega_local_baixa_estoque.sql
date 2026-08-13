-- Entrega local: o gatilho da baixa é a ENTREGA, não o faturamento.
--
-- Pedido de motoboy não gera nota, logo nunca é faturado, logo nunca chega ao
-- momento que dispara a baixa de estoque. Os 23 pedidos MOTOBOY desde 01/08
-- estão todos parados em "pago" — o perfume saiu do frasco e o saldo não caiu.
--
-- Nem a Yampi nem transportadora nenhuma vai confirmar essa entrega: quem
-- entregou foi a operação, em mãos. Por isso a confirmação é manual, e é ela
-- que fecha o ciclo do pedido e consome o ml na mesma transação — separar as
-- duas deixaria o pedido entregue com estoque intacto na primeira falha.

alter table pedidos add column if not exists entrega_local boolean not null default false;

comment on column pedidos.entrega_local is
  'Entrega em mãos pela operação — não é faturada, e a baixa de estoque acontece na entrega';

update pedidos
set entrega_local = true
where servico_frete ilike '%motoboy%'
   or (rastreio is null and destino ilike '%muria%');

create or replace function entregar_pedido_local(
  p_pedido_id text,
  p_operador text default 'Operação'
) returns numeric
language plpgsql
as $$
declare
  v_ml numeric;
begin
  if not exists (select 1 from pedidos where id = p_pedido_id) then
    raise exception 'Pedido % não existe.', p_pedido_id;
  end if;

  update pedidos
  set situacao = 'entregue',
      envio = 'entregue',
      entregue_em = coalesce(entregue_em, now())
  where id = p_pedido_id;

  -- A baixa vem depois da marcação e na mesma transação: se ela falhar, a
  -- entrega volta atrás junto, e o pedido não fica entregue com estoque cheio.
  select baixar_estoque_do_pedido(p_pedido_id, p_operador) into v_ml;
  return v_ml;
end;
$$;

comment on function entregar_pedido_local is
  'Confirma entrega em mãos e consome o ml na mesma transação';
