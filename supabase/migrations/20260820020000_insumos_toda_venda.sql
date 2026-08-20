-- Insumos saem em TODA venda — a falha achada pelo dono (19/08 à noite).
--
-- A baixa de insumos herdava o filtro do LÍQUIDO: só descontava frasco,
-- tampa e válvula de item cuja base está sob controle de ml. Mas o vidro sai
-- fisicamente em toda venda — inclusive nos ~95% de itens cujo perfume está
-- "fora do controle" (regra do líquido, que continua valendo para o ml). O
-- resultado medido: 43 pedidos baixados desde a contagem de 15/08 e apenas 8
-- frascos registrados de saída.
--
-- Dois consertos e um reparo:
-- 1. `baixar_insumos_do_pedido` desconta pelo ITEM (variante define o
--    frasco), sem olhar o controle do líquido — e ganha idempotência
--    própria (pedido que já tem saída de insumo não desconta de novo),
--    porque o reparo retroativo precisa poder rodar em lote com segurança.
-- 2. O reparo: todo pedido COMPRADO a partir de 15/08 (dia da contagem
--    inicial dos insumos) que já teve a baixa de estoque e ainda não tem
--    saída de insumo, desconta agora. Pedido comprado antes da contagem fica
--    de fora de propósito: o frasco dele saiu antes de os insumos serem
--    contados, e descontar de novo dobraria a saída.

create or replace function public.baixar_insumos_do_pedido(p_pedido_id text, p_operador text)
returns integer
language plpgsql
as $function$
declare
  v_linha record;
  v_atual integer;
  v_saldo integer;
  v_baixado integer;
  v_total integer := 0;
begin
  -- Idempotência própria: a proteção não pode morar só no chamador — o
  -- reparo retroativo e reexecuções manuais passam por aqui direto.
  if exists (
    select 1 from insumo_movimentacoes
     where pedido_id = p_pedido_id and tipo = 'saida'
  ) then
    return 0;
  end if;

  for v_linha in
    with itens as (
      -- TODO item com variante consome frasco + tampa + válvula: o vidro sai
      -- na venda mesmo quando o LÍQUIDO da base está fora do controle de ml.
      select frasco_da_variante(i.variante::smallint) as frasco_ml,
             sum(i.quantidade)::int as unidades
        from pedido_itens i
       where i.pedido_id = p_pedido_id
         and i.variante is not null
       group by 1
    )
    select ins.id as insumo_id, x.unidades
      from itens x
      join insumos ins on ins.frasco_ml = x.frasco_ml and ins.ativo
    union all
    select ins.id, (select coalesce(sum(unidades), 0) from itens)::int
      from insumos ins
     where ins.frasco_ml is null and ins.ativo
  loop
    continue when v_linha.unidades <= 0;

    select unidades into v_atual from insumos where id = v_linha.insumo_id for update;
    v_baixado := least(v_atual, v_linha.unidades);

    update insumos set unidades = greatest(unidades - v_linha.unidades, 0)
     where id = v_linha.insumo_id
    returning unidades into v_saldo;

    insert into insumo_movimentacoes (
      insumo_id, tipo, unidades, saldo_anterior, saldo, ref, pedido_id,
      descricao, responsavel
    ) values (
      v_linha.insumo_id, 'saida', -v_baixado, v_atual, v_saldo,
      p_pedido_id, p_pedido_id,
      case when v_baixado < v_linha.unidades
        then 'Envase do pedido ' || p_pedido_id || ' · faltaram ' ||
             (v_linha.unidades - v_baixado) || ' un em estoque'
        else 'Envase do pedido ' || p_pedido_id
      end,
      p_operador
    );

    v_total := v_total + v_baixado;
  end loop;

  return v_total;
end;
$function$;

-- O reparo: pedidos comprados após a contagem inicial (15/08), já baixados
-- no estoque de líquido, sem saída de insumo registrada. A idempotência
-- acima garante que rodar isto duas vezes não desconta duas vezes.
do $do$
declare
  v_pedido record;
begin
  for v_pedido in
    select p.id
      from pedidos p
     where p.comprado_em >= '2026-08-15'
       and p.estoque_baixado_em is not null
       and not exists (
         select 1 from insumo_movimentacoes m
          where m.pedido_id = p.id and m.tipo = 'saida'
       )
     order by p.comprado_em
  loop
    perform baixar_insumos_do_pedido(v_pedido.id, 'Reparo retroativo de insumos (20/08)');
  end loop;
end $do$;
