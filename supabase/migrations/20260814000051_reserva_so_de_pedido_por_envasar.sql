-- A fila de envase mostrava pedido que já saiu — e de perfume que a loja nem
-- vende mais. Três defeitos somados, todos da mesma raiz: a reserva olhava
-- para `envio`, que na base importada não acompanha o que de fato aconteceu.
--
-- 1. `situacao` era ignorada. 21 pedidos ENTREGUES ficaram com
--    `envio = 'nao_iniciado'` na importação; para a reserva pareciam
--    esperando despacho.
--
-- 2. `faturado` continuava reservando. Faturar É o envase: o ml já saiu do
--    frasco ali. Pedidos de 06/07 seguiam na fila de hoje.
--
-- 3. `estoque_fora_do_controle` não era checado. Todo o histórico importado
--    veio marcado assim justamente para não mexer no estoque — mas quando o
--    perfume ganhou lote depois (Sauvage, 12/08), os pedidos velhos dele
--    passaram a reservar contra um frasco que nunca os atendeu.
--
-- A regra passa a ser uma só, escrita em um lugar: reserva existe entre o
-- pagamento e o faturamento, para pedido que o ERP controla.

-- ── A elegibilidade vira função, com o motivo junto ────────────────────────
--
-- Devolver o motivo (em vez de um booleano) faz a liberação explicar-se: a
-- movimentação diz por que a reserva caiu, e não um genérico "não elegível".
create or replace function motivo_para_nao_reservar(p_pedido_id text)
returns text
language sql
stable
as $$
  -- Pedido ausente é impedimento, não ausência de resposta: sem o exists o
  -- select vazio devolveria null, que aqui significa "pode reservar".
  select case when not exists (select 1 from pedidos where id = p_pedido_id)
    then 'pedido inexistente'
    else (
      select case
        -- Importação marcou o pedido como fora do controle: o ERP não sabia
        -- o estoque na época e não pode inventar demanda por ele agora.
        when p.estoque_fora_do_controle then 'pedido fora do controle de estoque'
        when p.pagamento <> 'pago' then 'pagamento não confirmado'
        when p.situacao = 'cancelado' then 'pedido cancelado'
        -- Qualquer situação além de 'pago' já passou pelo envase: faturado,
        -- enviado e entregue tiveram o líquido tirado do frasco.
        when p.situacao is distinct from 'pago'
          then 'pedido já envasado (' || coalesce(p.situacao, 'situação em branco') || ')'
        when p.envio not in ('nao_iniciado', 'aguardando_envio') then 'pedido já despachado'
        when p.estoque_baixado_em is not null then 'estoque já baixado'
        else null
      end
      from pedidos p where p.id = p_pedido_id
    )
  end
$$;

-- ── Criar reserva: recusa antes de tocar em saldo ──────────────────────────
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

  -- Pedido que não deve reservar sai daqui sem efeito nenhum: chamada
  -- repetida do webhook, pedido antigo, pedido importado — todos inertes.
  if motivo_para_nao_reservar(p_pedido_id) is not null then
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

-- ── Reconciliar pela mesma regra, nos dois sentidos ────────────────────────
create or replace function sincronizar_reservas()
returns jsonb
language plpgsql
as $$
declare
  v_p record;
  v_criadas integer := 0;
  v_liberadas integer := 0;
begin
  -- Reserva de base fora do controle sai, uma a uma, com motivo próprio: o
  -- pedido pode continuar válido, é a base que o ERP não acompanha.
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

  -- Reserva de pedido que já não deve reservar sai inteira, com o motivo que
  -- a função de elegibilidade apurou.
  for v_p in
    select distinct r.pedido_id, motivo_para_nao_reservar(r.pedido_id) as motivo
      from reservas_estoque r
     where r.liberada_em is null
       and motivo_para_nao_reservar(r.pedido_id) is not null
  loop
    perform liberar_reserva_do_pedido(v_p.pedido_id, v_p.motivo, 'Sincronização');
    v_liberadas := v_liberadas + 1;
  end loop;

  for v_p in
    select p.id
      from pedidos p
     where motivo_para_nao_reservar(p.id) is null
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

-- ── Limpar o que as versões anteriores criaram ─────────────────────────────
--
-- Nenhuma das 14 reservas ativas hoje passa na regra nova. Soltar agora, e
-- não na próxima rodada do pulso, para a tela parar de mentir já.
select sincronizar_reservas();
