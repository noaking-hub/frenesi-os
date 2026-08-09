-- ═══════════════════════════════════════════════════════════════════════════
-- Saída de lote que não veio de ordem de produção.
-- ═══════════════════════════════════════════════════════════════════════════

-- O extrato de um lote só aceitava saída de produção, e sempre em unidades ×
-- variante. Isso deixava sem lugar o caso mais comum na virada para o ERP:
-- "comprei o frasco de 100 ml, mas 7 ml eu já tinha vendido antes de
-- cadastrar". Sem um lugar para esses 7 ml, eles só apareceriam ao declarar o
-- frasco vazio — como PERDA TÉCNICA. E perda técnica alimenta o parâmetro que
-- entra no custo de todo preço calculado: 7 ml de venda viram 7% de perda
-- inventada, e o preço de todo perfume sobe por causa disso.
--
-- Duas mudanças, então:
--   1. a saída passa a ser medida em ml. Unidades e variante viram opcionais,
--      porque nem toda saída é decant (amostra, respingo, venda antiga sem
--      registro de tamanho);
--   2. existe uma função para lançá-la à mão, com motivo obrigatório.

alter table lote_saidas add column ml     numeric(12, 2);
alter table lote_saidas add column motivo text;

-- Backfill: tudo o que existe hoje veio de ordem de produção, onde o ml É o
-- produto de unidades por variante.
update lote_saidas set ml = unidades * variante where ml is null;

alter table lote_saidas alter column ml       set not null;
alter table lote_saidas alter column unidades drop not null;
alter table lote_saidas alter column variante drop not null;
alter table lote_saidas alter column ordem_id drop not null;
alter table lote_saidas add constraint lote_saidas_ml_check check (ml > 0);

comment on column lote_saidas.ml is
  'Volume que saiu do lote. É a medida autoritativa — unidades × variante só descreve COMO saiu.';
comment on column lote_saidas.motivo is
  'Por que saiu, quando não foi ordem de produção. Nulo em saída de produção.';

-- ── Tudo o que somava unidades × variante passa a somar ml ─────────────────

-- `create or replace` não muda o tipo de uma coluna já existente: somar ml
-- devolve numeric onde antes vinha bigint. Recriar é o único caminho, e as
-- duas views que leem esta caem junto — recriadas idênticas logo abaixo.
drop view if exists lote_apuracao cascade;

create view lote_apuracao as
select l.id,
       l.base_id,
       b.nome as perfume,
       l.fornecedor,
       l.volume_ml as comprado_ml,
       coalesce(sum(s.ml), 0) as consumido_ml,
       coalesce(sum(s.unidades), 0) as unidades,
       l.entrada_em,
       l.encerrado_em,
       l.encerrado_em is null as aberto,
       l.volume_ml - coalesce(sum(s.ml), 0) as diferenca_ml,
       case
         when l.encerrado_em is null or l.volume_ml = 0 then null
         else (l.volume_ml - coalesce(sum(s.ml), 0)) / l.volume_ml * 100
       end as perda_pct
  from lotes l
  join perfumes_base b on b.id = l.base_id
  left join lote_saidas s on s.lote_id = l.id
 group by l.id, b.nome;

-- Recriadas sem alteração: caíram só por dependerem da view acima.
create view perda_real as
select count(*) filter (where not a.aberto) as lotes_encerrados,
       count(*) filter (where a.aberto)     as lotes_abertos,
       case
         when coalesce(sum(a.comprado_ml) filter (where not a.aberto), 0) = 0 then 0
         else sum(a.diferenca_ml) filter (where not a.aberto)
              / sum(a.comprado_ml) filter (where not a.aberto) * 100
       end as media_pct,
       coalesce(sum(a.diferenca_ml * b.custo_por_ml) filter (where not a.aberto), 0) as custo
  from lote_apuracao a
  join perfumes_base b on b.id = a.base_id;

create view conciliacao_lotes as
select (select coalesce(sum(diferenca_ml), 0) from lote_apuracao where aberto) as saldo_lotes_ml,
       (select coalesce(sum(volume_ml), 0) from perfumes_base)                 as estoque_ml,
       (select coalesce(sum(diferenca_ml), 0) from lote_apuracao where aberto)
         - (select coalesce(sum(volume_ml), 0) from perfumes_base)             as divergencia_ml;

create or replace function encerrar_lote(p_lote_id text, p_operador text)
returns numeric
language plpgsql
as $$
declare
  v_lote        lotes%rowtype;
  v_consumido   numeric(12, 2);
  v_perda       numeric(12, 2);
  v_volume_base numeric(12, 2);
  v_saldo       numeric(12, 2);
begin
  if coalesce(trim(p_operador), '') = '' then
    raise exception 'informe quem está declarando o frasco vazio';
  end if;

  select * into v_lote from lotes where id = p_lote_id for update;
  if not found then
    raise exception 'lote "%" não existe', p_lote_id;
  end if;
  if v_lote.encerrado_em is not null then
    raise exception 'lote % já foi encerrado em %', p_lote_id, v_lote.encerrado_em;
  end if;

  select coalesce(sum(ml), 0) into v_consumido
    from lote_saidas where lote_id = p_lote_id;

  v_perda := v_lote.volume_ml - v_consumido;

  if v_perda < 0 then
    raise exception
      'o extrato do lote % soma % ml de saídas, mais que os % ml comprados — corrija as saídas antes de encerrar',
      p_lote_id, v_consumido, v_lote.volume_ml;
  end if;

  select volume_ml into v_volume_base
    from perfumes_base where id = v_lote.base_id for update;

  if v_perda > v_volume_base then
    raise exception
      'a perda apurada (% ml) é maior que o volume em estoque da base (% ml) — há movimentação lançada fora do fluxo de lotes; acerte pelo Inventário antes de encerrar',
      v_perda, v_volume_base;
  end if;

  update lotes
     set encerrado_em = current_date, encerrado_por = p_operador
   where id = p_lote_id;

  if v_perda > 0 then
    update perfumes_base
       set volume_ml = volume_ml - v_perda
     where id = v_lote.base_id
     returning volume_ml into v_saldo;

    insert into movimentacoes (
      base_id, tipo, ocorrida_em, volume_ml, ref, descricao, responsavel, saldo_ml
    ) values (
      v_lote.base_id, 'ajuste', now(), -v_perda, p_lote_id,
      'Encerramento do lote · perda real medida no frasco', p_operador, v_saldo
    );
  end if;

  return v_perda;
end;
$$;

/**
 * Lança uma saída de lote que não veio de ordem de produção.
 *
 * O caso que a motivou: frasco comprado antes do ERP, do qual parte já tinha
 * sido vendida. Sem isso, esses ml só apareceriam ao declarar o frasco vazio
 * e seriam contados como perda técnica — inflando o parâmetro que entra no
 * custo de TODO preço calculado.
 *
 * Baixa o volume da base junto, porque a saída é real: o líquido não está
 * mais no frasco.
 */
create function registrar_saida_lote(
  p_lote_id  text,
  p_ml       numeric,
  p_motivo   text,
  p_unidades integer default null,
  p_variante smallint default null,
  p_operador text default 'ERP'
) returns numeric
language plpgsql
as $$
declare
  v_lote        lotes%rowtype;
  v_consumido   numeric(12, 2);
  v_saldo_lote  numeric(12, 2);
  v_volume_base numeric(12, 2);
  v_saldo       numeric(12, 2);
begin
  if p_ml is null or p_ml <= 0 then
    raise exception 'o volume da saída deve ser maior que zero';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'informe o motivo da saída — sem ele a apuração do lote fica sem explicação';
  end if;

  select * into v_lote from lotes where id = p_lote_id for update;
  if not found then
    raise exception 'lote "%" não existe', p_lote_id;
  end if;
  if v_lote.encerrado_em is not null then
    raise exception 'o lote % já foi encerrado — o extrato dele é histórico', p_lote_id;
  end if;

  select coalesce(sum(ml), 0) into v_consumido
    from lote_saidas where lote_id = p_lote_id;
  v_saldo_lote := v_lote.volume_ml - v_consumido;

  -- Tirar mais do que o frasco tinha é erro de lançamento, não perda negativa.
  if p_ml > v_saldo_lote then
    raise exception
      'o lote % tem % ml de saldo teórico e a saída pede % ml',
      p_lote_id, v_saldo_lote, p_ml;
  end if;

  select volume_ml into v_volume_base
    from perfumes_base where id = v_lote.base_id for update;
  if p_ml > v_volume_base then
    raise exception
      'a base tem % ml em estoque e a saída pede % ml — acerte pelo Inventário primeiro',
      v_volume_base, p_ml;
  end if;

  insert into lote_saidas (lote_id, ordem_id, ocorrida_em, ml, unidades, variante, motivo)
  values (p_lote_id, null, current_date, round(p_ml, 2), p_unidades, p_variante, trim(p_motivo));

  update perfumes_base
     set volume_ml = volume_ml - p_ml
   where id = v_lote.base_id
   returning volume_ml into v_saldo;

  insert into movimentacoes (
    base_id, tipo, ocorrida_em, volume_ml, ref, descricao, responsavel, saldo_ml
  ) values (
    v_lote.base_id, 'saida', now(), -round(p_ml, 2), p_lote_id,
    trim(p_motivo), coalesce(nullif(trim(p_operador), ''), 'ERP'), v_saldo
  );

  return v_saldo_lote - p_ml;
end;
$$;

comment on function registrar_saida_lote is
  'Baixa ml de um lote fora do fluxo de produção (venda anterior ao ERP, amostra, acidente). Retorna o saldo teórico restante do lote.';

-- `concluir_ordem_producao` precisa gravar o ml agora que ele é obrigatório,
-- e ler o saldo do lote pela mesma coluna — senão uma saída avulsa não
-- contaria no rateio e a produção enxergaria saldo que já saiu.
create or replace function concluir_ordem_producao(
  p_ordem_id  text,
  p_envasadas integer,
  p_operador  text
) returns numeric
language plpgsql
as $$
declare
  v_ordem     ordens_producao%rowtype;
  v_liquido   numeric(12, 2);
  v_volume    numeric(12, 2);
  v_saldo     numeric(12, 2);
  v_restantes integer;
  v_cabem     integer;
  v_lote      record;
  v_abertos   integer;
  v_indice    integer := 0;
begin
  if coalesce(trim(p_operador), '') = '' then
    raise exception 'informe quem conferiu o envase';
  end if;

  select * into v_ordem from ordens_producao where id = p_ordem_id for update;
  if not found then
    raise exception 'ordem "%" não existe', p_ordem_id;
  end if;
  if v_ordem.status = 'concluida' then
    raise exception 'ordem % já foi concluída em %', p_ordem_id, v_ordem.concluida_em;
  end if;
  if p_envasadas is null or p_envasadas <= 0 then
    raise exception 'informe quantas unidades foram envasadas';
  end if;
  if p_envasadas > v_ordem.quantidade then
    raise exception
      'a ordem % planejou % unidades; para envasar % abra outra ordem',
      p_ordem_id, v_ordem.quantidade, p_envasadas;
  end if;

  v_liquido := p_envasadas * v_ordem.variante;

  select volume_ml into v_volume
    from perfumes_base where id = v_ordem.base_id for update;
  if v_volume < v_liquido then
    raise exception
      '% ml em estoque não envasam % unidades de % ml (% ml)',
      v_volume, p_envasadas, v_ordem.variante, v_liquido;
  end if;

  select count(*) into v_abertos
    from lotes where base_id = v_ordem.base_id and encerrado_em is null;
  if v_abertos = 0 then
    raise exception
      'não há lote aberto de % — registre a compra do frasco antes de envasar',
      v_ordem.base_id;
  end if;

  v_restantes := p_envasadas;
  for v_lote in
    select l.id,
           l.volume_ml - coalesce((
             select sum(s.ml) from lote_saidas s where s.lote_id = l.id
           ), 0) as saldo_ml
      from lotes l
     where l.base_id = v_ordem.base_id and l.encerrado_em is null
     order by l.entrada_em, l.id
  loop
    exit when v_restantes = 0;
    v_indice := v_indice + 1;

    if v_indice = v_abertos then
      v_cabem := v_restantes;
    else
      v_cabem := least(v_restantes, floor(greatest(v_lote.saldo_ml, 0) / v_ordem.variante)::int);
    end if;
    continue when v_cabem = 0;

    insert into lote_saidas (lote_id, ordem_id, ocorrida_em, ml, unidades, variante)
    values (v_lote.id, p_ordem_id, current_date,
            v_cabem * v_ordem.variante, v_cabem, v_ordem.variante);

    v_restantes := v_restantes - v_cabem;
  end loop;

  update perfumes_base
     set volume_ml = volume_ml - v_liquido
   where id = v_ordem.base_id
   returning volume_ml into v_saldo;

  insert into movimentacoes (
    base_id, tipo, ocorrida_em, volume_ml, liquido_ml, ref, descricao, responsavel, saldo_ml
  ) values (
    v_ordem.base_id, 'saida', now(), -v_liquido, v_liquido, p_ordem_id,
    format('Ordem de produção %s · %s un de %s ml', p_ordem_id, p_envasadas, v_ordem.variante),
    p_operador, v_saldo
  );

  insert into produtos_derivados (base_id, variante, envasadas)
  values (v_ordem.base_id, v_ordem.variante, p_envasadas)
  on conflict (base_id, variante)
  do update set envasadas = produtos_derivados.envasadas + excluded.envasadas;

  update ordens_producao
     set status = 'concluida',
         concluida_em = now(),
         envasadas = p_envasadas,
         responsavel = p_operador
   where id = p_ordem_id;

  return v_liquido;
end;
$$;
