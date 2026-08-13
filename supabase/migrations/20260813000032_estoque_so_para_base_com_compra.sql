-- O controle de estoque não é retroativo, e vale só para o que foi comprado
-- DENTRO do ERP.
--
-- Regra da operação: entra no controle apenas o perfume cujo vidro lacrado
-- teve a compra lançada aqui. Perfume que já era vendido antes do ERP não tem
-- frasco registrado, não tem custo apurado e não tem saldo — descontar dele
-- criaria negativo a partir de um número que nunca existiu.
--
-- A migração anterior calculava um "passivo histórico" de 453 pedidos para
-- acerto. Ele não existe: aquelas vendas saíram de frascos que o ERP nunca
-- viu, e cobrá-las de um saldo que começou depois seria inventar dívida.
--
-- Duas guardas, e as duas são necessárias:
--  1. Pedido anterior à virada não baixa nada, nem que a base tenha compra
--     lançada hoje — aquele decant saiu de outro frasco.
--  2. Item cuja base não tem compra lançada é pulado SEMPRE, inclusive em
--     pedido novo: o frasco de onde ele saiu continua fora do controle.

alter table pedidos add column if not exists estoque_fora_do_controle boolean not null default false;

comment on column pedidos.estoque_fora_do_controle is
  'Pedido anterior à adoção do controle de estoque — nunca baixa ml';

update pedidos
set estoque_fora_do_controle = true
where estoque_baixado_em is null;

create or replace function base_sob_controle(p_base_id text)
returns boolean
language sql
stable
as $$
  select exists (select 1 from lotes l where l.base_id = p_base_id);
$$;

comment on function base_sob_controle is
  'A base tem compra de frasco lançada no ERP — é o que a coloca sob controle';

create or replace function baixar_estoque_do_pedido(
  p_pedido_id text,
  p_operador text default 'Faturamento'
) returns numeric
language plpgsql
as $$
declare
  v_perda numeric;
  v_total numeric := 0;
  v_item record;
  v_ml numeric;
  v_saldo numeric;
begin
  perform 1 from pedidos where id = p_pedido_id for update;

  if not exists (select 1 from pedidos where id = p_pedido_id) then
    raise exception 'Pedido % não existe.', p_pedido_id;
  end if;
  if exists (
    select 1 from pedidos
    where id = p_pedido_id
      and (estoque_baixado_em is not null or estoque_fora_do_controle)
  ) then
    return 0;
  end if;

  select coalesce(perda_pct, 0) into v_perda
  from parametros_precificacao
  order by vigente_desde desc
  limit 1;
  v_perda := coalesce(v_perda, 0);

  for v_item in
    select i.base_id, sum(i.variante * i.quantidade) as ml_liquido
    from pedido_itens i
    where i.pedido_id = p_pedido_id
      and i.base_id is not null
      and base_sob_controle(i.base_id)
    group by i.base_id
  loop
    v_ml := round(v_item.ml_liquido * (1 + v_perda / 100.0), 1);
    v_total := v_total + v_ml;

    update perfumes_base
    set volume_ml = greatest(volume_ml - v_ml, 0)
    where id = v_item.base_id
    returning volume_ml into v_saldo;

    insert into movimentacoes (base_id, tipo, ocorrida_em, volume_ml, liquido_ml, ref, descricao, responsavel, saldo_ml)
    values (
      v_item.base_id, 'saida', now(), -v_ml, -v_item.ml_liquido, p_pedido_id,
      'Faturamento do pedido ' || p_pedido_id, p_operador, v_saldo
    );
  end loop;

  update pedidos
  set estoque_baixado_em = now(), estoque_baixado_ml = v_total
  where id = p_pedido_id;

  return v_total;
end;
$$;

-- O cálculo do passivo histórico sai junto: ele deixou de existir por decisão
-- da operação, e função morta é armadilha para quem vier depois.
drop function if exists estoque_nao_baixado();
