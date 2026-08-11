-- O operador não quer pedido cancelado nem pendente no ERP: não é venda.
--
-- Exceção: cancelado COM movimento no extrato é dinheiro que entrou e voltou
-- — a conciliação precisa enxergá-lo, então vira 'divergente' em vez de
-- sumir. O importador passa a pular cancelados e pendentes, portanto esta
-- reclassificação não é sobrescrita pela próxima sincronia.

update pedidos p
   set pagamento = 'divergente'
 where p.canal = 'yampi'
   and p.pagamento = 'cancelado'
   and exists (select 1 from extrato_linhas e where e.pedido_id = p.id);

delete from pedidos p
 where p.canal = 'yampi'
   and p.pagamento in ('cancelado', 'pendente')
   and not exists (select 1 from extrato_linhas e where e.pedido_id = p.id)
   and not exists (select 1 from devolucoes d where d.pedido_id = p.id)
   and not exists (select 1 from lancamentos l where l.pedido_id = p.id);
