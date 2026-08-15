-- CONCILIAR O REPASSE COM O QUE JÁ ESTÁ NO EXTRATO
--
-- A tela de Conciliação lia `repasses` e anunciava 416 vendas "pagas sem
-- crédito", R$ 61.426,41. O crédito existia: 316 daquelas vendas já tinham a
-- linha do extrato ligada ao pedido e o lançamento de caixa gravado. Só a
-- linha de `repasses` não sabia — ela era preenchida pela rotina do Mercado
-- Pago, e nada nunca a alimentou a partir do extrato.
--
-- Uma tela que pede decisão sobre 416 vendas já resolvidas não é fila de
-- trabalho: é ruído que faz o operador parar de olhar. E enquanto a tarifa
-- real fica nula, a tela compara contra o parâmetro de 14,94% — que é a taxa
-- MÁXIMA, de 6x sem juros — e acusa divergência em toda venda no Pix.
--
-- O que o extrato sabe e o repasse não: quanto CAIU (`valor`, já líquido),
-- QUANDO caiu (`ocorrido_em`) e, por diferença contra o bruto do pedido,
-- quanto o intermediador reteve. É tudo o que falta.
create or replace function conciliar_repasses_pelo_extrato()
returns table (preenchidos integer, ainda_sem_credito integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_preenchidos integer;
  v_pendentes integer;
begin
  with credito as (
    -- Um pedido pode ter mais de uma linha de crédito (parcial, reenvio).
    -- Soma-se tudo o que caiu por ele: é o total creditado que interessa.
    select e.pedido_id,
           sum(e.valor) as caiu,
           max(e.ocorrido_em) as em,
           min(e.origem) as origem,
           min(e.bruto->>'meio') as meio
      from extrato_linhas e
     where e.pedido_id is not null
       and e.tipo = 'entrada'
       and not e.ignorado
       and e.descricao = 'Venda recebida'
     group by e.pedido_id
  )
  update repasses r
     set recebido = c.caiu,
         creditado_em = c.em,
         bruto_gateway = coalesce(r.bruto_gateway, p.valor),
         -- Tarifa real é o que o pedido valia menos o que caiu. Negativo não
         -- existe: crédito acima do bruto é juros de parcelamento repassado,
         -- e nesse caso a retenção foi zero.
         taxa_real = greatest(p.valor - c.caiu, 0),
         meio = coalesce(r.meio, c.meio),
         origem = case when c.origem = 'pagarme' then 'pagarme' else r.origem end,
         conciliado_por = coalesce(r.conciliado_por, 'extrato')
    from credito c
    join pedidos p on p.id = c.pedido_id
   where r.pedido_id = c.pedido_id
     and r.recebido is null;
  get diagnostics v_preenchidos = row_count;

  select count(*) into v_pendentes from repasses where recebido is null;
  return query select v_preenchidos, v_pendentes;
end;
$$;
