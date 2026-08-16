-- ESTORNO PARCIAL NÃO TIRA A VENDA DO FATURAMENTO
--
-- `pagamento = 'divergente'` vinha de qualquer estorno, e o faturamento só
-- conta 'pago'. Um item que esgotou depois da compra, reembolsado sozinho
-- enquanto o resto seguia para o cliente, apagava a venda inteira do
-- relatório — R$ 540,00 de um pedido entregue sumiram do dia 10/08 assim.
--
-- A leitura da Yampi já foi corrigida, mas ela depende de a Yampi mandar o
-- valor do estorno, e nem sempre manda. Esta função é a trava que não depende
-- disso: quem sabe quanto entrou e quanto voltou é o EXTRATO, e ele está aqui.
--
-- Roda depois da importação de pedidos. Sem ela, a sincronia de cinco minutos
-- desfaria a correção a cada rodada — foi o que aconteceu quando o reparo foi
-- feito só na mão.
create or replace function corrigir_pagamento_por_estorno_parcial()
returns table (corrigidos integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  with dinheiro as (
    select e.pedido_id,
           sum(case when e.descricao = 'Venda recebida' then e.valor else 0 end) as entrou,
           sum(case when e.descricao = 'Estorno ao cliente' then e.valor else 0 end) as voltou
      from extrato_linhas e
     where e.pedido_id is not null and not e.ignorado
     group by e.pedido_id
  )
  update pedidos p
     set pagamento = 'pago'
    from dinheiro d
   where d.pedido_id = p.id
     and p.pagamento = 'divergente'
     -- O dinheiro entrou e a maior parte FICOU: isso é venda com estorno
     -- parcial, não venda desfeita.
     and d.entrou > 0
     and d.voltou < d.entrou * 0.99;
  get diagnostics v_n = row_count;

  return query select v_n;
end;
$$;

select * from corrigir_pagamento_por_estorno_parcial();
