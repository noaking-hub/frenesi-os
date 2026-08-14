-- As operações da reserva: criar, liberar, consumir e reconciliar.
--
-- Tudo passa por aqui — nenhuma tela escreve reservado_ml direto, do mesmo
-- jeito que nenhuma tela escreve volume_ml. Saldo consolidado só muda por
-- operação nomeada, e cada uma deixa linha no ledger.

-- ── Criar: o pedido foi pago ───────────────────────────────────────────────
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

  -- Estoque já baixado: o ml virou saída de verdade. Reservar depois do
  -- consumo contaria o mesmo mililitro duas vezes.
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
     group by i.base_id
  loop
    -- Reserva ativa já existe: o mesmo webhook chegando de novo não dobra
    -- nada. É a idempotência exigida pelo escopo, garantida no banco.
    if exists (
      select 1 from reservas_estoque r
       where r.pedido_id = p_pedido_id and r.base_id = v_item.base_id
         and r.liberada_em is null
    ) then
      continue;
    end if;

    -- Reserva liberada que volta a valer (pedido reaberto) é reativada, não
    -- duplicada — a chave é (pedido, base).
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

-- ── Liberar: cancelou, reembolsou, despachou ou consumiu ───────────────────
create or replace function liberar_reserva_do_pedido(
  p_pedido_id text,
  p_motivo text default 'liberada',
  p_operador text default 'Sistema'
) returns numeric
language plpgsql
as $$
declare
  v_res record;
  v_total numeric := 0;
  v_reservado numeric;
  v_saldo numeric;
begin
  for v_res in
    select base_id, ml from reservas_estoque
     where pedido_id = p_pedido_id and liberada_em is null
     for update
  loop
    update reservas_estoque
       set liberada_em = now(), motivo = p_motivo
     where pedido_id = p_pedido_id and base_id = v_res.base_id;

    update perfumes_base
       set reservado_ml = greatest(reservado_ml - v_res.ml, 0)
     where id = v_res.base_id
    returning reservado_ml, volume_ml into v_reservado, v_saldo;

    insert into movimentacoes (
      base_id, tipo, ocorrida_em, volume_ml, ref, pedido_id,
      descricao, responsavel, saldo_ml, reserva_ml, saldo_reservado_ml
    ) values (
      v_res.base_id, 'liberacao', now(), 0, p_pedido_id, p_pedido_id,
      'Reserva liberada (' || p_motivo || ') · pedido ' || p_pedido_id,
      p_operador, v_saldo, -v_res.ml, v_reservado
    );

    v_total := v_total + v_res.ml;
  end loop;

  return v_total;
end;
$$;

-- ── Reconciliar: quem deveria estar reservado, está? ───────────────────────
--
-- A verdade é derivada do pedido: pago, não cancelado, ainda não despachado e
-- com estoque não baixado. Rodar isto de novo não muda nada quando já está
-- certo — é a rede que pega webhook perdido e cancelamento que não avisou.
create or replace function sincronizar_reservas()
returns jsonb
language plpgsql
as $$
declare
  v_p record;
  v_criadas integer := 0;
  v_liberadas integer := 0;
begin
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
       and exists (select 1 from pedido_itens i where i.pedido_id = p.id and i.base_id is not null)
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

-- ── Consumir: o faturamento tira o ml e a reserva morre junto ──────────────
--
-- Mesma baixa de antes, com uma diferença: a reserva que protegia esse
-- pedido é liberada na MESMA transação. Sem isso o ml sairia do físico e
-- continuaria comprometido — descontado duas vezes do disponível.
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

    insert into movimentacoes (
      base_id, tipo, ocorrida_em, volume_ml, liquido_ml, ref, pedido_id,
      descricao, responsavel, saldo_ml
    ) values (
      v_item.base_id, 'saida', now(), -v_ml, -v_item.ml_liquido, p_pedido_id, p_pedido_id,
      'Faturamento do pedido ' || p_pedido_id, p_operador, v_saldo
    );
  end loop;

  update pedidos
     set estoque_baixado_em = now(), estoque_baixado_ml = v_total
   where id = p_pedido_id;

  -- A reserva cumpriu o papel: o ml que ela guardava acabou de sair.
  perform liberar_reserva_do_pedido(p_pedido_id, 'consumida', p_operador);

  return v_total;
end;
$$;

-- ── Compatibilidade: o nome antigo passa a fazer a coisa certa ─────────────
--
-- `reservadas` em produtos_derivados era UNIDADE de decant pronta, e a
-- operação nunca envasou nada: virava 105 reservadas sobre 0 envasadas, o
-- "−105 prontas para venda" da tela. Zera aqui; a reserva de verdade agora
-- vive em ml, por pedido.
create or replace function recalcular_reservas()
returns integer
language plpgsql
as $$
declare
  v jsonb;
begin
  with producao as (
    select o.base_id, o.variante, sum(o.envasadas)::int as unidades
      from ordens_producao o
     where o.status = 'concluida' and o.envasadas is not null
     group by o.base_id, o.variante
  ),
  despachado as (
    select i.base_id, i.variante, sum(i.quantidade)::int as unidades
      from pedido_itens i
      join pedidos p on p.id = i.pedido_id
     where i.base_id is not null and i.variante is not null
       and p.envio in ('enviado', 'entregue')
     group by i.base_id, i.variante
  )
  alvo as (
    select d.base_id, d.variante,
           greatest(0, coalesce(pr.unidades, 0) - coalesce(de.unidades, 0)) as envasadas
      from produtos_derivados d
      left join producao pr on pr.base_id = d.base_id and pr.variante = d.variante
      left join despachado de on de.base_id = d.base_id and de.variante = d.variante
  )
  update produtos_derivados d
     set envasadas = a.envasadas,
         reservadas = 0
    from alvo a
   where a.base_id = d.base_id and a.variante = d.variante
     and (d.envasadas is distinct from a.envasadas or d.reservadas <> 0);

  v := sincronizar_reservas();
  return coalesce((v->>'criadas')::int, 0) + coalesce((v->>'liberadas')::int, 0);
end;
$$;
