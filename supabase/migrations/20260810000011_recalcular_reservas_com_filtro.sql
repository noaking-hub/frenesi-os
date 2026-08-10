-- ═══════════════════════════════════════════════════════════════════════════
-- `recalcular_reservas` sem UPDATE de tabela inteira.
--
-- A função reescrevia todas as linhas de `produtos_derivados` sem WHERE, e a
-- proteção `safeupdate` do Supabase recusa — com razão: apagar ou reescrever
-- tabela inteira sem dizer o que se está mudando é o acidente que ela existe
-- para impedir. O erro aparecia na importação de pedidos, que chama isto no
-- fim, e travava a importação inteira depois de todo o trabalho feito.
--
-- A correção não é contornar a proteção. É escrever só o que muda:
--
--   · o filtro fica honesto — atualiza a linha cujo número mudou;
--   · `row_count` passa a significar "quantas mudaram", que é a informação
--     que alguém quer, em vez de "quantas existem";
--   · numa loja com centenas de derivados, a maioria das sincronias não
--     escreve nada, porque nada mudou.
--
-- Todo derivado continua coberto: o alvo sai de `produtos_derivados` com
-- LEFT JOIN nas contagens, então o que não teve produção nem venda é zerado
-- em vez de ficar com o número velho.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function recalcular_reservas()
returns integer
language plpgsql
as $$
declare
  v_linhas integer;
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
  ),
  vendido as (
    select i.base_id, i.variante, sum(i.quantidade)::int as unidades
      from pedido_itens i
      join pedidos p on p.id = i.pedido_id
     where i.base_id is not null and i.variante is not null
       and p.pagamento = 'pago'
       and p.envio in ('nao_iniciado', 'aguardando_envio')
     group by i.base_id, i.variante
  ),
  alvo as (
    select
      d.base_id,
      d.variante,
      greatest(0, coalesce(pr.unidades, 0) - coalesce(de.unidades, 0)) as envasadas,
      coalesce(ve.unidades, 0) as reservadas
    from produtos_derivados d
    left join producao   pr on pr.base_id = d.base_id and pr.variante = d.variante
    left join despachado de on de.base_id = d.base_id and de.variante = d.variante
    left join vendido    ve on ve.base_id = d.base_id and ve.variante = d.variante
  )
  update produtos_derivados d
     set envasadas  = a.envasadas,
         reservadas = a.reservadas
    from alvo a
   where a.base_id = d.base_id
     and a.variante = d.variante
     and (d.envasadas is distinct from a.envasadas
       or d.reservadas is distinct from a.reservadas);

  get diagnostics v_linhas = row_count;
  return v_linhas;
end;
$$;

comment on function recalcular_reservas is
  'Recalcula envasadas e reservadas de cada derivado. Escreve só as linhas cujo número mudou — o retorno é quantas mudaram.';
