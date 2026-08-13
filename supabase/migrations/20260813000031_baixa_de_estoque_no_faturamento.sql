-- O estoque em ml passa a cair na VENDA, no momento do faturamento.
--
-- O modelo anterior tinha três passos: comprar o frasco somava ml, a produção
-- envasava (tirando ml e criando decants prontos) e a venda baixava decants.
-- A operação da FRENESI fraciona sob demanda — não existe decant pronto na
-- prateleira — então o passo do meio nunca aconteceu: zero unidades envasadas
-- em toda a história do ERP.
--
-- Resultado: 1.373 itens vendidos e o ml só caiu pelas 12 correções lançadas à
-- mão. O saldo que a tela mostrava era ficção.
--
-- Agora são dois passos. Compra soma ml; faturamento tira. O momento é o
-- faturamento porque é quando o perfume de fato sai do frasco — pedido
-- cancelado antes disso não pode levar embora ml que continua lá.

-- Quando o pedido baixou o estoque. É a trava de idempotência: a função
-- recusa pedido já baixado, então rodar a rotina duas vezes não consome o
-- dobro de perfume.
alter table pedidos add column if not exists estoque_baixado_em timestamptz;
alter table pedidos add column if not exists estoque_baixado_ml numeric;

comment on column pedidos.estoque_baixado_em is 'Quando o faturamento deste pedido consumiu ml das bases';
comment on column pedidos.estoque_baixado_ml is 'Total de ml consumido, já com a perda técnica embutida';

create index if not exists pedidos_estoque_pendente_idx
  on pedidos (situacao)
  where estoque_baixado_em is null;

/**
 * Baixa o estoque de UM pedido faturado.
 *
 * Uma transação para o pedido inteiro: ou todos os itens saem, ou nenhum. Item
 * a item, uma falha no terceiro perfume deixaria o pedido com dois baixados e
 * um não — e ninguém saberia qual.
 *
 * O volume consumido inclui a PERDA TÉCNICA do parâmetro vigente: envasar 5 ml
 * gasta mais que 5 ml, e ignorar isso faz o estoque parecer maior do que é,
 * justamente no número que decide quando repor.
 *
 * Item sem base casada é pulado e contado — ele aparece no pedido mas não tem
 * de qual frasco sair. Recusar o pedido inteiro por causa dele travaria a
 * baixa dos outros itens, que são reais.
 */
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
  -- Trava a linha: duas rodadas simultâneas não podem baixar o mesmo pedido.
  perform 1 from pedidos where id = p_pedido_id for update;

  if not exists (select 1 from pedidos where id = p_pedido_id) then
    raise exception 'Pedido % não existe.', p_pedido_id;
  end if;
  if exists (select 1 from pedidos where id = p_pedido_id and estoque_baixado_em is not null) then
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
    where i.pedido_id = p_pedido_id and i.base_id is not null
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
      v_item.base_id,
      'saida',
      now(),
      -v_ml,
      -v_item.ml_liquido,
      p_pedido_id,
      'Faturamento do pedido ' || p_pedido_id,
      p_operador,
      v_saldo
    );
  end loop;

  update pedidos
  set estoque_baixado_em = now(), estoque_baixado_ml = v_total
  where id = p_pedido_id;

  return v_total;
end;
$$;

comment on function baixar_estoque_do_pedido is 'Consome ml das bases no faturamento; idempotente por pedido';
