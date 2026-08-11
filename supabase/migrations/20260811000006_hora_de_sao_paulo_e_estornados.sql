-- Dois consertos de verdade dos números:
--
-- 1. Hora do pedido. O parser antigo lia a hora de São Paulo da Yampi como
--    UTC, empurrando todo pedido 3 horas para trás — a compra das 22h caía
--    no dia seguinte e a venda por dia saía errada. O parser novo grava
--    certo; aqui corrigimos o que já estava no banco.
update pedidos
   set comprado_em = comprado_em + interval '3 hours',
       entregue_em = entregue_em + interval '3 hours'
 where canal = 'yampi';

-- 2. Pedido pago e depois estornado não é venda. A Yampi às vezes segue
--    dizendo "paid" mesmo com o dinheiro devolvido — mas o estorno deixa
--    rastro: a linha de saída no extrato ligada ao pedido, ou o status da
--    transação. Quem tem rastro de estorno vira 'divergente' e sai de toda
--    conta de receita, do CRM e dos relatórios.
create or replace function marcar_estornados() returns integer
language plpgsql
as $$
declare
  v_marcados integer;
begin
  with alvo as (
    update pedidos p
       set pagamento = 'divergente'
     where p.canal = 'yampi'
       and p.pagamento = 'pago'
       and (
         exists (
           select 1 from extrato_linhas e
            where e.pedido_id = p.id
              and e.tipo = 'saida'
              and (e.descricao ilike '%estorno%'
                   or e.descricao ilike '%chargeback%'
                   or e.descricao ilike '%devolu%')
         )
         or exists (
           select 1 from pedido_transacoes t
            where t.pedido_id = p.id
              and (t.status ilike '%refund%'
                   or t.status ilike '%estorn%'
                   or t.status ilike '%chargeback%'
                   or t.status ilike '%devolv%')
         )
       )
     returning p.id
  )
  select count(*) into v_marcados from alvo;
  return v_marcados;
end;
$$;

select marcar_estornados();
