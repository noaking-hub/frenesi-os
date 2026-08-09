-- ═══════════════════════════════════════════════════════════════════════════
-- A compra passa a assinar a movimentação que gera.
-- ═══════════════════════════════════════════════════════════════════════════

-- `registrar_compra()` nasceu antes das colunas `responsavel` e `saldo_ml`
-- (que vieram na migration de movimentações) e nunca foi atualizada: toda
-- compra gravava uma entrada sem autor e sem saldo. Na tela de Movimentações
-- isso aparecia como saldo 0 ml e responsável "—" logo depois de uma compra
-- que deixou a base cheia — o extrato contradizia o estoque.
--
-- É drop e create, não `create or replace`: o parâmetro novo criaria uma
-- SOBRECARGA, e a versão antiga — a que a aplicação chama — continuaria de pé,
-- gravando entradas sem autor.
drop function registrar_compra(text, numeric, numeric, text);

create function registrar_compra(
  p_base_id     text,
  p_volume_ml   numeric,
  p_custo_total numeric,
  p_fornecedor  text,
  p_operador    text default 'ERP'
) returns text
language plpgsql
as $$
declare
  v_lote_id      text;
  v_volume_atual numeric;
  v_custo_atual  numeric;
  v_custo_novo   numeric;
  v_saldo        numeric;
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

  if v_volume_atual <= 0 or v_custo_atual <= 0 then
    v_custo_novo := p_custo_total / p_volume_ml;
  else
    v_custo_novo := (v_volume_atual * v_custo_atual + p_custo_total)
                    / (v_volume_atual + p_volume_ml);
  end if;

  update perfumes_base
     set volume_ml    = v_volume_atual + p_volume_ml,
         custo_por_ml = round(v_custo_novo, 4)
   where id = p_base_id
   returning volume_ml into v_saldo;

  -- Uma ação, um lançamento: a compra GERA a entrada, com ref no lote. O
  -- saldo é congelado aqui porque depois ninguém consegue reconstruí-lo.
  insert into movimentacoes (
    base_id, tipo, volume_ml, ref, descricao, responsavel, saldo_ml
  ) values (
    p_base_id, 'entrada', p_volume_ml, v_lote_id,
    'Compra de frasco · ' || p_fornecedor, coalesce(nullif(trim(p_operador), ''), 'ERP'), v_saldo
  );

  return v_lote_id;
end;
$$;

comment on function registrar_compra(text, numeric, numeric, text, text) is
  'Compra de frasco: gera lote + movimentação de entrada assinada e atualiza volume e custo médio ponderado da base.';

-- Conserta as entradas já gravadas sem saldo, só onde o saldo é dedutível:
-- na PRIMEIRA compra de uma base, o que havia antes era zero, então o saldo
-- daquele instante é o próprio volume comprado. Em compras posteriores o
-- saldo depende de tudo que aconteceu no meio e não dá para reconstruir —
-- essas ficam nulas, e nulo é mais honesto que um número inventado.
update movimentacoes m
   set saldo_ml = l.volume_ml
  from lotes l
 where m.ref = l.id
   and m.tipo = 'entrada'
   and m.saldo_ml is null
   and not exists (
     select 1 from lotes anterior
      where anterior.base_id = l.base_id
        and (anterior.entrada_em, anterior.id) < (l.entrada_em, l.id)
   );
