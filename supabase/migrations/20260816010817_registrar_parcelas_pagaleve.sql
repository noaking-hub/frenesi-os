/**
 * Registra o cronograma de uma venda da Pagaleve, sem estragar o que já se sabe.
 *
 * A regra que dá nome à função está no `where` do update: ESTIMATIVA NUNCA
 * SOBRESCREVE DATA INFORMADA. A rotina automática lê a API, que não publica o
 * cronograma — ela só permite calcular um. Já o relatório do lojista traz a
 * data que a Pagaleve promete, e essa acertou 44 dos 53 créditos ocorridos.
 * Sem esta guarda, a primeira execução do cron trocaria dado bom por
 * aproximação, e ninguém perceberia: as duas são datas plausíveis.
 *
 * O caminho contrário é livre — informada entra por cima de estimada sempre,
 * que é exatamente o que se quer quando o relatório chega.
 */
create or replace function public.registrar_parcelas_pagaleve(p_parcelas jsonb)
returns table (inseridas int, atualizadas int, protegidas int) language plpgsql as $$
declare
  v_antes int;
  v_depois int;
  v_total int;
begin
  select count(*) into v_antes from public.pagaleve_parcelas;
  select count(*) into v_total from jsonb_array_elements(p_parcelas);

  insert into public.pagaleve_parcelas
    (checkout_id, numero, de, bruto, tarifa, liquido, prevista_para,
     origem_da_data, modalidade, comprada_em, total_da_compra)
  select
    x.checkout_id, x.numero, x.de, x.bruto, x.tarifa, x.liquido, x.prevista_para,
    coalesce(x.origem_da_data, 'estimada'), x.modalidade, x.comprada_em, x.total_da_compra
  from jsonb_to_recordset(p_parcelas) as x(
    checkout_id text, numero smallint, de smallint, bruto numeric, tarifa numeric,
    liquido numeric, prevista_para date, origem_da_data text, modalidade text,
    comprada_em date, total_da_compra numeric
  )
  on conflict (checkout_id, numero) do update set
    de = excluded.de,
    bruto = excluded.bruto,
    tarifa = excluded.tarifa,
    liquido = excluded.liquido,
    prevista_para = excluded.prevista_para,
    origem_da_data = excluded.origem_da_data,
    modalidade = coalesce(excluded.modalidade, public.pagaleve_parcelas.modalidade),
    comprada_em = coalesce(excluded.comprada_em, public.pagaleve_parcelas.comprada_em),
    total_da_compra = coalesce(excluded.total_da_compra, public.pagaleve_parcelas.total_da_compra),
    atualizada_em = now()
  -- A guarda. Linha informada só cede a outra informada.
  where public.pagaleve_parcelas.origem_da_data = 'estimada'
     or excluded.origem_da_data = 'informada';

  select count(*) into v_depois from public.pagaleve_parcelas;
  return query select
    (v_depois - v_antes)::int,
    0::int,
    -- O que a guarda recusou: veio no lote, não entrou e não é linha nova.
    greatest(v_total - (v_depois - v_antes), 0)::int;
end $$;

-- A primeira versão de `vincular_parcelas_pagaleve` casava por valor e data;
-- ela foi substituída na migração seguinte, que promove o identificador da
-- transação a chave. Ver 20260816011519.
