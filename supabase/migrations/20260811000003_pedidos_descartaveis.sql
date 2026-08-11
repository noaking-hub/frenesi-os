-- Quais destes pedidos podem sair do banco sem perder história?
--
-- Serve à autocura da importação: a Yampi é a autoridade sobre o que é
-- venda, mas linha de extrato, devolução ou lançamento apontando para o
-- pedido é história financeira — aí o pedido fica, mesmo não sendo venda.
create or replace function pedidos_descartaveis(p_ids text[])
returns setof text
language sql
stable
as $$
  select p.id
    from pedidos p
   where p.id = any (p_ids)
     and p.canal = 'yampi'
     and not exists (select 1 from extrato_linhas e where e.pedido_id = p.id)
     and not exists (select 1 from devolucoes d where d.pedido_id = p.id)
     and not exists (select 1 from lancamentos l where l.pedido_id = p.id)
$$;
