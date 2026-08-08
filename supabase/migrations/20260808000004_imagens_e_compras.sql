-- Imagem do produto (vem da Shopify na importação do catálogo) e o fluxo de
-- compra/reposição — que é onde o custo por ml nasce de verdade.

alter table perfumes_base
  add column imagem_url text;

create sequence lotes_id_seq start 100;

/**
 * Registrar a compra de um frasco: UMA ação que gera o lote, a movimentação
 * de entrada (ref = id do lote) e atualiza volume e custo da base.
 *
 * Custo por ml: a primeira compra define (custo ÷ volume); reposição faz a
 * média ponderada entre o volume que já existia, ao custo atual, e o que
 * entrou. Base importada da Shopify com custo 0 é tratada como primeira
 * compra — o histórico desconhecido não contamina a média.
 */
create function registrar_compra(
  p_base_id     text,
  p_volume_ml   numeric,
  p_custo_total numeric,
  p_fornecedor  text
) returns text
language plpgsql
as $$
declare
  v_lote_id      text;
  v_volume_atual numeric;
  v_custo_atual  numeric;
  v_custo_novo   numeric;
begin
  if p_volume_ml is null or p_volume_ml <= 0 then
    raise exception 'o volume comprado deve ser maior que zero';
  end if;
  if p_custo_total is null or p_custo_total <= 0 then
    raise exception 'o custo total deve ser maior que zero';
  end if;
  if coalesce(trim(p_fornecedor), '') = '' then
    raise exception 'informe o fornecedor da compra';
  end if;

  select volume_ml, custo_por_ml
    into v_volume_atual, v_custo_atual
    from perfumes_base
   where id = p_base_id
     for update;
  if not found then
    raise exception 'perfume base "%" não existe', p_base_id;
  end if;

  v_lote_id := 'LT-' || lpad(nextval('lotes_id_seq')::text, 3, '0');

  insert into lotes (id, base_id, fornecedor, volume_ml, custo_total, entrada_em)
  values (v_lote_id, p_base_id, p_fornecedor, p_volume_ml, p_custo_total, current_date);

  -- Uma ação, um lançamento: a compra GERA a entrada, com ref no lote.
  insert into movimentacoes (base_id, tipo, volume_ml, ref, descricao)
  values (p_base_id, 'entrada', p_volume_ml, v_lote_id, 'Compra de frasco · ' || p_fornecedor);

  if v_volume_atual <= 0 or v_custo_atual <= 0 then
    v_custo_novo := p_custo_total / p_volume_ml;
  else
    v_custo_novo := (v_volume_atual * v_custo_atual + p_custo_total)
                    / (v_volume_atual + p_volume_ml);
  end if;

  update perfumes_base
     set volume_ml    = v_volume_atual + p_volume_ml,
         custo_por_ml = round(v_custo_novo, 4)
   where id = p_base_id;

  return v_lote_id;
end;
$$;

comment on function registrar_compra is
  'Compra de frasco: gera lote + movimentação de entrada e atualiza volume e custo médio ponderado da base.';
