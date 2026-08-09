-- ═══════════════════════════════════════════════════════════════════════════
-- Carga inicial: dizer ao ERP o que já existe na prateleira.
-- ═══════════════════════════════════════════════════════════════════════════

-- O catálogo veio inteiro da Shopify — 412 bases — e todas nasceram com
-- volume zero. Sem volume não há quantas unidades dá para vender, sem custo
-- não há preço: o ERP fica com a lista certa e a operação vazia.
--
-- A quantidade publicada na Shopify NÃO serve de carga inicial. Ela é o que a
-- loja oferece, não o que existe no frasco: hoje são 20 unidades por variante
-- em quase toda base, o que daria 211 litros de perfume. Importar isso seria
-- inventar estoque com cara de número apurado.
--
-- O que serve é o que está na prateleira. Esta função recebe essa declaração
-- em lote, uma linha por base, e trata cada uma como o lote que passa a ser
-- medido daqui para frente.

/**
 * Grava o saldo declarado de várias bases de uma vez.
 *
 * Cada item é `{"base_id": "...", "volume_ml": 30, "custo_por_ml": 3.10}`.
 * Vira um lote, uma entrada em Movimentações e o custo por ml da base — a
 * mesma tríade de uma compra, porque é disso que se trata: o frasco foi
 * comprado, só que antes de o ERP existir.
 *
 * O volume declarado é o RESTANTE, não o tamanho original do frasco. A perda
 * real que o ERP vai medir neste lote é a perda do que sobrou em diante; o
 * que se perdeu antes da virada não tem como ser apurado e não é chutado.
 */
create function carregar_estoque_inicial(
  p_itens    jsonb,
  p_operador text default 'ERP'
) returns integer
language plpgsql
as $$
declare
  v_item         jsonb;
  v_base_id      text;
  v_volume       numeric;
  v_custo_ml     numeric;
  v_lote_id      text;
  v_volume_atual numeric;
  v_custo_atual  numeric;
  v_custo_novo   numeric;
  v_saldo        numeric;
  v_gravadas     integer := 0;
begin
  if jsonb_typeof(p_itens) is distinct from 'array' then
    raise exception 'a carga precisa ser uma lista de bases';
  end if;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_base_id  := v_item ->> 'base_id';
    v_volume   := (v_item ->> 'volume_ml')::numeric;
    v_custo_ml := (v_item ->> 'custo_por_ml')::numeric;

    if v_volume is null or v_volume <= 0 then
      raise exception 'o volume declarado de "%" precisa ser maior que zero', v_base_id;
    end if;
    if v_custo_ml is null or v_custo_ml <= 0 then
      raise exception 'informe o custo por ml de "%" — sem ele não há preço', v_base_id;
    end if;

    select volume_ml, custo_por_ml
      into v_volume_atual, v_custo_atual
      from perfumes_base
     where id = v_base_id
       for update;
    if not found then
      raise exception 'perfume base "%" não existe', v_base_id;
    end if;

    v_lote_id := 'LT-' || lpad(nextval('lotes_id_seq')::text, 3, '0');

    insert into lotes (id, base_id, fornecedor, volume_ml, custo_total, entrada_em)
    values (v_lote_id, v_base_id, 'Carga inicial', v_volume,
            round(v_volume * v_custo_ml, 2), current_date);

    -- Mesma média ponderada da compra: quem já tinha volume com custo não o
    -- perde só porque a carga passou por cima.
    if v_volume_atual <= 0 or v_custo_atual <= 0 then
      v_custo_novo := v_custo_ml;
    else
      v_custo_novo := (v_volume_atual * v_custo_atual + v_volume * v_custo_ml)
                      / (v_volume_atual + v_volume);
    end if;

    update perfumes_base
       set volume_ml    = v_volume_atual + v_volume,
           custo_por_ml = round(v_custo_novo, 4)
     where id = v_base_id
     returning volume_ml into v_saldo;

    insert into movimentacoes (
      base_id, tipo, volume_ml, ref, descricao, responsavel, saldo_ml
    ) values (
      v_base_id, 'entrada', v_volume, v_lote_id,
      'Carga inicial · saldo declarado na virada para o ERP',
      coalesce(nullif(trim(p_operador), ''), 'ERP'), v_saldo
    );

    v_gravadas := v_gravadas + 1;
  end loop;

  return v_gravadas;
end;
$$;

comment on function carregar_estoque_inicial is
  'Declara em lote o volume e o custo por ml que já existem na prateleira. Gera lote, entrada e custo por base.';

-- ── Inventário parcial ─────────────────────────────────────────────────────

-- Contar 412 bases numa sentada não acontece. O fechamento exigia contagem em
-- TODAS, então quem contasse metade não conseguia fechar nada — e o ajuste da
-- metade contada, que é real, ficava preso.
--
-- Novo parâmetro em vez de mudança calada: quem fecha decide se está fechando
-- uma contagem completa (e aí a base sem contar é erro) ou uma parcial (e aí
-- a base sem contar simplesmente não é tocada — ausência não é zero).

drop function if exists fechar_inventario(text, text);

create function fechar_inventario(
  p_inventario_id text,
  p_operador      text,
  p_parcial       boolean default false
) returns integer
language plpgsql
as $$
declare
  v_linha       record;
  v_ajustes     integer := 0;
  v_sem_contar  integer;
  v_saldo       numeric(12, 2);
begin
  if not exists (select 1 from inventarios where id = p_inventario_id) then
    raise exception 'Inventário % não existe', p_inventario_id;
  end if;
  if exists (select 1 from inventarios where id = p_inventario_id and fechado_em is not null) then
    raise exception 'Inventário % já foi fechado', p_inventario_id;
  end if;

  select count(*) into v_sem_contar
    from inventario_contagens
   where inventario_id = p_inventario_id and contado_ml is null;

  if v_sem_contar > 0 and not p_parcial then
    raise exception 'Inventário % tem % base(s) sem contagem', p_inventario_id, v_sem_contar;
  end if;
  if v_sem_contar > 0 then
    -- A linha não contada some da apuração: guardá-la com contagem nula
    -- deixaria a diferença zero parecendo "conferido", que é mentira.
    delete from inventario_contagens
     where inventario_id = p_inventario_id and contado_ml is null;
  end if;
  if not exists (
    select 1 from inventario_contagens where inventario_id = p_inventario_id
  ) then
    raise exception 'Inventário % não tem nenhuma base contada', p_inventario_id;
  end if;

  for v_linha in
    select base_id, diferenca_ml
    from inventario_apuracao
    where inventario_id = p_inventario_id and divergente
  loop
    update perfumes_base
       set volume_ml = greatest(0, volume_ml + v_linha.diferenca_ml)
     where id = v_linha.base_id
     returning volume_ml into v_saldo;

    insert into movimentacoes (
      base_id, tipo, ocorrida_em, volume_ml, ref, descricao, responsavel, saldo_ml
    ) values (
      v_linha.base_id, 'ajuste', now(), v_linha.diferenca_ml, p_inventario_id,
      'Inventário · divergência encontrada na contagem', p_operador, v_saldo
    );

    v_ajustes := v_ajustes + 1;
  end loop;

  update inventarios
     set fechado_em = now(), fechado_por = p_operador
   where id = p_inventario_id;

  return v_ajustes;
end;
$$;

comment on function fechar_inventario(text, text, boolean) is
  'Confirma a contagem e lança um ajuste por divergência. Com p_parcial, as bases não contadas são descartadas em vez de barrar o fechamento.';
