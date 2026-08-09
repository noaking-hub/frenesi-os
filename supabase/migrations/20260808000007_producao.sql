-- ═══════════════════════════════════════════════════════════════════════════
-- Produção: a única operação que transforma ml de base em unidades vendáveis.
-- ═══════════════════════════════════════════════════════════════════════════

create type status_ordem as enum (
  'em_envase', 'aguardando_conferencia', 'bloqueada', 'concluida'
);

create sequence ordens_id_seq start 2300;

/**
 * Ordem de produção. Abrir é planejar; concluir é o fato físico.
 *
 * Abrir NÃO mexe no estoque: enquanto o frasco não foi aberto e o decant não
 * foi envasado, o líquido continua na base. Reservar volume aqui faria a
 * invariante dos lotes mentir e o "dá para N unidades" encolher por algo que
 * ainda não aconteceu.
 */
create table ordens_producao (
  id           text primary key,
  base_id      text not null references perfumes_base (id),
  variante     variante_ml not null,
  quantidade   integer not null check (quantidade > 0),
  -- Volume que a ordem pretende envasar. Derivado de quantidade × variante,
  -- congelado para o histórico não mudar depois.
  liquido_ml   numeric(12, 2) not null,
  status       status_ordem not null default 'em_envase',
  responsavel  text not null,
  motivo       text not null,
  aberta_em    timestamptz not null default now(),
  concluida_em timestamptz,
  -- Unidades efetivamente envasadas. Pode ser menor que a planejada: quebrou
  -- frasco, faltou insumo. Nunca maior — isso seria outra ordem.
  envasadas    integer check (envasadas >= 0),
  constraint conclusao_completa check (
    (status = 'concluida') = (concluida_em is not null and envasadas is not null)
  ),
  constraint envase_dentro_do_planejado check (envasadas is null or envasadas <= quantidade)
);

create index on ordens_producao (base_id);
create index on ordens_producao (status);

comment on table ordens_producao is
  'Ordem de envase. Abrir planeja; concluir_ordem_producao() é que move estoque.';

/**
 * Abre a ordem. Só planeja — nenhum ml sai daqui.
 *
 * Nasce bloqueada quando o volume não sustenta o envase, contando a perda
 * técnica estimada: é melhor a ordem existir travada, visível na fila, do que
 * ser recusada e sumir.
 */
create function abrir_ordem_producao(
  p_base_id    text,
  p_variante   smallint,
  p_quantidade integer,
  p_motivo     text,
  p_responsavel text
) returns text
language plpgsql
as $$
declare
  v_volume  numeric(12, 2);
  v_perda   numeric(6, 3);
  v_liquido numeric(12, 2);
  v_id      text;
begin
  if coalesce(trim(p_responsavel), '') = '' then
    raise exception 'informe o responsável pela ordem';
  end if;
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'a quantidade a produzir deve ser maior que zero';
  end if;

  select volume_ml into v_volume from perfumes_base where id = p_base_id;
  if not found then
    raise exception 'perfume base "%" não existe', p_base_id;
  end if;

  select perda_pct into v_perda
    from parametros_precificacao order by vigente_desde desc limit 1;

  v_liquido := p_quantidade * p_variante;
  v_id := 'OP-' || nextval('ordens_id_seq')::text;

  insert into ordens_producao (
    id, base_id, variante, quantidade, liquido_ml, status, responsavel, motivo
  ) values (
    v_id, p_base_id, p_variante, p_quantidade, v_liquido,
    case
      when v_volume < v_liquido * (1 + coalesce(v_perda, 0) / 100) then 'bloqueada'::status_ordem
      else 'em_envase'::status_ordem
    end,
    p_responsavel, p_motivo
  );

  return v_id;
end;
$$;

comment on function abrir_ordem_producao is
  'Cria a ordem de envase sem mexer no estoque. Nasce bloqueada se o volume não sustenta.';

/**
 * Conclui o envase. É AQUI que o estoque se move — uma ação, um lançamento.
 *
 * Baixa da base o volume LÍQUIDO envasado, não o líquido mais a perda
 * estimada. A perda técnica do parâmetro serve para precificar; ela não é uma
 * movimentação porque ninguém a mediu ainda. O que se perdeu de verdade
 * aparece inteiro quando o frasco é declarado vazio: comprado − envasado. Se
 * a estimativa saísse do estoque agora, o encerramento mediria só o resíduo
 * do palpite, e a invariante dos lotes abertos deixaria de fechar.
 *
 * O consumo é rateado nos lotes abertos, do mais antigo para o mais novo —
 * é o que alimenta a apuração de perda de cada frasco.
 */
create function concluir_ordem_producao(
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

  -- Rateio nos lotes abertos, do mais antigo para o mais novo. Um decant que
  -- começa num frasco e termina no seguinte fica no seguinte: por isso o
  -- último lote da fila absorve o que sobrou, em vez do piso.
  v_restantes := p_envasadas;
  for v_lote in
    select l.id,
           l.volume_ml - coalesce((
             select sum(s.unidades * s.variante) from lote_saidas s where s.lote_id = l.id
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

    insert into lote_saidas (lote_id, ordem_id, ocorrida_em, unidades, variante)
    values (v_lote.id, p_ordem_id, current_date, v_cabem, v_ordem.variante);

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

  -- Os decants passam a existir como unidades vendáveis.
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

comment on function concluir_ordem_producao is
  'Conclui o envase: baixa o líquido da base, rateia nos lotes abertos, lança a saída e cria os decants. Retorna os ml baixados.';

alter table ordens_producao enable row level security;
create policy erp_leitura on ordens_producao for select to authenticated using (true);
