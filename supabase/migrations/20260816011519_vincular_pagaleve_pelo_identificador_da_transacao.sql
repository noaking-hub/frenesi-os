-- O checkout da Pagaleve JÁ ESTAVA no ERP, e ninguém tinha olhado.
--
-- A Yampi grava em `pedido_transacoes.identificadores` o id que o meio de
-- pagamento devolveu, e para a Pagaleve esse id é o próprio `checkout_id`.
-- Conferido nas 27 vendas conhecidas: 27 casaram, sem uma única exceção.
--
-- Isso muda a natureza do vínculo. Valor arredondado mais data com folga de um
-- dia é PALPITE — funciona até o dia em que dois clientes gastarem o mesmo
-- total na mesma véspera, e aí o dinheiro de um aparece na venda do outro sem
-- que nada acuse o erro. O identificador é FATO: ou é o mesmo checkout ou não é.
--
-- O palpite não foi removido, foi rebaixado. Ele ainda cobre a venda cuja
-- transação a Yampi não trouxe, e roda só sobre o que sobrou do casamento
-- exato — nunca disputando com ele.
drop function if exists public.vincular_parcelas_pagaleve();

create function public.vincular_parcelas_pagaleve()
returns table(vinculadas integer, por_identificador integer, por_valor_e_data integer)
language plpgsql
as $function$
declare
  v_exatas int;
  v_palpite int;
begin
  -- 1ª passada: o identificador da transação. Chave, não semelhança.
  with pares as (
    select distinct pp.checkout_id, t.pedido_id
    from (select distinct checkout_id from public.pagaleve_parcelas where pedido_id is null) pp
    join public.pedido_transacoes t on t.identificadores @> array[pp.checkout_id]
  ),
  -- Um checkout que apontasse para dois pedidos seria dado corrompido; nesse
  -- caso nenhum dos dois é escolhido, porque escolher um seria inventar.
  unicos as (
    select checkout_id, min(pedido_id) as pedido_id
    from pares group by checkout_id having count(distinct pedido_id) = 1
  )
  update public.pagaleve_parcelas pp
  set pedido_id = u.pedido_id, atualizada_em = now()
  from unicos u
  where u.checkout_id = pp.checkout_id and pp.pedido_id is null;
  get diagnostics v_exatas = row_count;

  -- 2ª passada: o antigo casamento por valor e data, agora só para o resto.
  with candidatos as (
    select pp.checkout_id, p.id as pedido_id,
      row_number() over (partition by pp.checkout_id
        order by abs(extract(epoch from
          (p.comprado_em at time zone 'America/Sao_Paulo') - pp.comprada_em::timestamp))) as posto
    from (select distinct checkout_id, comprada_em, total_da_compra
          from public.pagaleve_parcelas
          where pedido_id is null and comprada_em is not null) pp
    join public.pedidos p
      on round(p.valor, 2) = pp.total_da_compra
     and (p.comprado_em at time zone 'America/Sao_Paulo')::date
         between pp.comprada_em - 1 and pp.comprada_em + 1
     and p.situacao <> 'cancelado'
    -- Pedido que já é de OUTRO checkout está fora: sem isto, a venda de um
    -- cliente serviria de par para a parcela de outro.
     and not exists (
       select 1 from public.pagaleve_parcelas q
       where q.pedido_id = p.id and q.checkout_id <> pp.checkout_id
     )
  )
  update public.pagaleve_parcelas pp
  set pedido_id = c.pedido_id, atualizada_em = now()
  from candidatos c
  where c.checkout_id = pp.checkout_id and c.posto = 1 and pp.pedido_id is null;
  get diagnostics v_palpite = row_count;

  return query select v_exatas + v_palpite, v_exatas, v_palpite;
end $function$;

-- A busca por `identificadores @> array[...]` sem índice varre a tabela de
-- transações inteira a cada rodada horária. GIN é o índice que serve a array.
create index if not exists pedido_transacoes_identificadores_gin
  on public.pedido_transacoes using gin (identificadores);
