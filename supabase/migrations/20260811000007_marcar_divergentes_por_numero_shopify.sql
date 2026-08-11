-- Pedido anulado/estornado na Shopify vira divergente aqui. Compara só os
-- dígitos do número: a Yampi guarda o espelho com prefixo variável.
create or replace function marcar_divergentes_por_numero_shopify(p_numeros text[])
returns integer
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
       and p.shopify_numero is not null
       and regexp_replace(p.shopify_numero, '\D', '', 'g') = any (p_numeros)
     returning p.id
  )
  select count(*) into v_marcados from alvo;
  return v_marcados;
end;
$$;
