-- O SKU nem sempre carrega o tamanho no fim: vendas antigas trazem
-- "LBS37QICAB" seco, sem o "-10ml". A descrição da venda guarda o tamanho
-- nesses casos ("J'adore Intense Feminino Eau de Parfum (Decant) 10ml").
--
-- O gatilho é a palavra "(Decant)": ela separa o que é fracionado do que não
-- é. Sem ela, "MYSLF Masculino Eau de Parfum 100ml" viraria uma variante de
-- 100 ml que não existe — e o frasco lacrado entraria no envase.
create or replace function preencher_variante_orfa()
returns integer
language plpgsql
as $$
declare
  v_n integer;
  v_m integer;
begin
  update pedido_itens
     set variante = variante_do_sku(sku)
   where variante is null
     and sku is not null
     and variante_do_sku(sku) is not null;
  get diagnostics v_n = row_count;

  update pedido_itens
     set variante = (regexp_replace(descricao, '^.*\(Decant\)\s*([0-9]+)\s*ml$', '\1', 'i'))::smallint
   where variante is null
     and descricao ~* '\(Decant\)\s*[0-9]+\s*ml$'
     and (regexp_replace(descricao, '^.*\(Decant\)\s*([0-9]+)\s*ml$', '\1', 'i'))::int
         in (3, 5, 8, 10, 15);
  get diagnostics v_m = row_count;

  return v_n + v_m;
end;
$$;

comment on function preencher_variante_orfa is
  'Tamanho do decant pelo SKU e, em último caso, pela descrição da venda. '
  'Perfume lacrado e kit ficam sem variante de propósito: não são fracionados.';

select preencher_variante_orfa() as preenchidos;
