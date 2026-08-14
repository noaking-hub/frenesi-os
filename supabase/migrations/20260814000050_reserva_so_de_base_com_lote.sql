-- Duas correções de regra, ditas pelo dono da operação.
--
-- 1. NADA é contabilizado para perfume sem compra de frasco registrada.
--
--    A reserva estava sendo criada para todo pedido pago, inclusive de
--    bases que nunca tiveram lote. Isso inflava o "Reservado" do estoque, a
--    fila de envase e a necessidade de insumo — com volume que o ERP nunca
--    soube que existia. É a mesma regra que a baixa de estoque já seguia
--    (`base_sob_controle`), e que a reserva precisava seguir junto: sem
--    ela, o estoque nunca fecha.
--
-- 2. Válvula e tampa são as MESMAS para os dois frascos.
--
--    São quatro itens, não seis: frasco de 8, frasco de 15, válvula e
--    tampa. O frasco depende do tamanho; o resto, não.

-- ── 1. Reserva só de base sob controle ─────────────────────────────────────
create or replace function reservar_pedido(
  p_pedido_id text,
  p_operador text default 'Pedido pago'
) returns numeric
language plpgsql
as $$
declare
  v_item record;
  v_total numeric := 0;
  v_reservado numeric;
  v_saldo numeric;
begin
  perform 1 from pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'Pedido % não existe.', p_pedido_id;
  end if;

  if exists (
    select 1 from pedidos where id = p_pedido_id and estoque_baixado_em is not null
  ) then
    return 0;
  end if;

  for v_item in
    select i.base_id, sum(i.variante * i.quantidade)::numeric as ml
      from pedido_itens i
     where i.pedido_id = p_pedido_id
       and i.base_id is not null
       and i.variante is not null
       -- Sem compra de frasco registrada, o ERP não sabe o que existe: não
       -- pode reservar, nem cobrar insumo, nem dizer que falta volume.
       and base_sob_controle(i.base_id)
     group by i.base_id
  loop
    if exists (
      select 1 from reservas_estoque r
       where r.pedido_id = p_pedido_id and r.base_id = v_item.base_id
         and r.liberada_em is null
    ) then
      continue;
    end if;

    insert into reservas_estoque (pedido_id, base_id, ml, criada_em, liberada_em, motivo)
    values (p_pedido_id, v_item.base_id, v_item.ml, now(), null, null)
    on conflict (pedido_id, base_id) do update
      set ml = excluded.ml, criada_em = now(), liberada_em = null, motivo = null;

    update perfumes_base
       set reservado_ml = reservado_ml + v_item.ml
     where id = v_item.base_id
    returning reservado_ml, volume_ml into v_reservado, v_saldo;

    insert into movimentacoes (
      base_id, tipo, ocorrida_em, volume_ml, ref, pedido_id,
      descricao, responsavel, saldo_ml, reserva_ml, saldo_reservado_ml
    ) values (
      v_item.base_id, 'reserva', now(), 0, p_pedido_id, p_pedido_id,
      'Reserva do pedido ' || p_pedido_id, p_operador, v_saldo, v_item.ml, v_reservado
    );

    v_total := v_total + v_item.ml;
  end loop;

  return v_total;
end;
$$;

-- A reconciliação também solta o que já não deve estar reservado: base que
-- perdeu o último lote (estorno de compra) deixa de contar na hora.
create or replace function sincronizar_reservas()
returns jsonb
language plpgsql
as $$
declare
  v_p record;
  v_criadas integer := 0;
  v_liberadas integer := 0;
begin
  -- Reserva de base fora do controle sai, uma a uma, com motivo próprio.
  for v_p in
    select r.pedido_id, r.base_id, r.ml
      from reservas_estoque r
     where r.liberada_em is null
       and not base_sob_controle(r.base_id)
  loop
    update reservas_estoque
       set liberada_em = now(), motivo = 'base sem compra registrada'
     where pedido_id = v_p.pedido_id and base_id = v_p.base_id;

    update perfumes_base
       set reservado_ml = greatest(reservado_ml - v_p.ml, 0)
     where id = v_p.base_id;

    v_liberadas := v_liberadas + 1;
  end loop;

  for v_p in
    select distinct r.pedido_id
      from reservas_estoque r
      join pedidos p on p.id = r.pedido_id
     where r.liberada_em is null
       and (
         p.pagamento <> 'pago'
         or p.situacao = 'cancelado'
         or p.envio not in ('nao_iniciado', 'aguardando_envio')
         or p.estoque_baixado_em is not null
       )
  loop
    perform liberar_reserva_do_pedido(v_p.pedido_id, 'não elegível', 'Sincronização');
    v_liberadas := v_liberadas + 1;
  end loop;

  for v_p in
    select p.id
      from pedidos p
     where p.pagamento = 'pago'
       and p.situacao <> 'cancelado'
       and p.envio in ('nao_iniciado', 'aguardando_envio')
       and p.estoque_baixado_em is null
       and exists (
         select 1 from pedido_itens i
          where i.pedido_id = p.id and i.base_id is not null
            and base_sob_controle(i.base_id)
       )
       and not exists (
         select 1 from reservas_estoque r
          where r.pedido_id = p.id and r.liberada_em is null
       )
  loop
    perform reservar_pedido(v_p.id, 'Sincronização');
    v_criadas := v_criadas + 1;
  end loop;

  return jsonb_build_object(
    'criadas', v_criadas,
    'liberadas', v_liberadas,
    'pedidos_reservados', (select count(distinct pedido_id) from reservas_estoque where liberada_em is null),
    'ml_reservado', (select coalesce(sum(ml), 0) from reservas_estoque where liberada_em is null)
  );
end;
$$;

-- ── 2. Válvula e tampa passam a ser únicas ─────────────────────────────────
update insumos set frasco_ml = null, nome = 'Válvula spray', minimo = 150 where id = 'valvula-8';
update insumos set frasco_ml = null, nome = 'Tampa',         minimo = 150 where id = 'tampa-8';

-- As versões de 15 ml deixam de existir. O saldo delas, se houver, vai para
-- o item único: é o mesmo material na gaveta.
update insumos i
   set unidades = i.unidades + coalesce((select unidades from insumos v where v.id = 'valvula-15'), 0)
 where i.id = 'valvula-8';
update insumos i
   set unidades = i.unidades + coalesce((select unidades from insumos t where t.id = 'tampa-15'), 0)
 where i.id = 'tampa-8';

update insumo_movimentacoes set insumo_id = 'valvula-8' where insumo_id = 'valvula-15';
update insumo_movimentacoes set insumo_id = 'tampa-8'   where insumo_id = 'tampa-15';

delete from insumos where id in ('valvula-15', 'tampa-15');

-- Os ids ficam com o sufixo antigo por causa das referências já gravadas no
-- histórico; o que a tela mostra é o nome, e ele agora diz a verdade.

/**
 * Baixa de insumo: o frasco depende do tamanho, válvula e tampa não.
 *
 * Só entra pedido de base COM compra registrada — sem isso o insumo sairia
 * por decant cujo perfume o ERP nem sabe que existe.
 */
create or replace function baixar_insumos_do_pedido(
  p_pedido_id text,
  p_operador text default 'Faturamento'
) returns integer
language plpgsql
as $$
declare
  v_linha record;
  v_atual integer;
  v_saldo integer;
  v_baixado integer;
  v_total integer := 0;
begin
  for v_linha in
    with itens as (
      select frasco_da_variante(i.variante::smallint) as frasco_ml,
             sum(i.quantidade)::int as unidades
        from pedido_itens i
       where i.pedido_id = p_pedido_id
         and i.variante is not null
         and i.base_id is not null
         and base_sob_controle(i.base_id)
       group by 1
    )
    -- Frasco casa pelo tamanho; válvula e tampa levam o total do pedido.
    select ins.id as insumo_id, x.unidades
      from itens x
      join insumos ins on ins.frasco_ml = x.frasco_ml and ins.ativo
    union all
    select ins.id, (select coalesce(sum(unidades), 0) from itens)
      from insumos ins
     where ins.frasco_ml is null and ins.ativo
  loop
    continue when v_linha.unidades <= 0;

    select unidades into v_atual from insumos where id = v_linha.insumo_id for update;
    -- Falta de insumo não impede a baixa: o decant já saiu. O saldo para em
    -- zero e a movimentação diz quanto faltou, para a tela cobrar a compra.
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
$$;
