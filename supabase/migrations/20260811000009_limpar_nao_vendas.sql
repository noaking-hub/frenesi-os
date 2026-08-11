-- A transação é a autoridade sobre o pagamento: o `authorized` do pedido
-- fica true para sempre mesmo com a autorização anulada. Pedido cujas
-- transações existem e NENHUMA pagou (cancelled, refused, voided,
-- waiting_payment) nunca teve dinheiro — não é venda nem estorno, e sai do
-- banco. A trava dos vínculos protege história financeira; estornos de
-- verdade são assunto de marcar_estornados, que roda antes.
create or replace function limpar_nao_vendas() returns integer
language plpgsql
as $$
declare
  v_removidos integer;
begin
  with alvo as (
    delete from pedidos p
     where p.canal = 'yampi'
       and p.pagamento in ('pago', 'pendente')
       and exists (select 1 from pedido_transacoes t where t.pedido_id = p.id)
       and not exists (
         select 1 from pedido_transacoes t
          where t.pedido_id = p.id
            and t.status ~* 'paid|approv|authoriz|captur|settl'
       )
       and not exists (
         select 1 from pedido_transacoes t
          where t.pedido_id = p.id
            and t.status ~* 'refund|estorn|chargeback|devolv'
       )
       and not exists (select 1 from extrato_linhas e where e.pedido_id = p.id)
       and not exists (select 1 from devolucoes d where d.pedido_id = p.id)
       and not exists (select 1 from lancamentos l where l.pedido_id = p.id)
     returning p.id
  )
  select count(*) into v_removidos from alvo;
  return v_removidos;
end;
$$;

select limpar_nao_vendas();
