-- MÓDULO FINANCEIRO · Fase 1 — o modelo que sustenta caixa e competência.
--
-- O princípio do escopo em uma frase: caixa e competência são coisas
-- diferentes e não podem se misturar. Pedido gera receita gerencial na
-- COMPETÊNCIA; o dinheiro entra no CAIXA quando o gateway liquida; a taxa
-- reduz o resultado; transferência move dinheiro entre contas e não é nem
-- receita nem despesa; compra de estoque sai do caixa hoje e só vira CMV
-- quando o perfume é vendido.
--
-- O que existia tratava tudo como "lançamento com data" — uma coluna só de
-- data, natureza como texto livre ("Despesa", "Custo variável"), sem
-- competência, sem parcelas, sem as duas pernas da transferência. Com isso a
-- DRE não fecha e o fluxo de caixa não projeta.

-- ── 1. Naturezas gerenciais ────────────────────────────────────────────────
--
-- A natureza é o que diz onde a linha entra na DRE. Como texto livre, ela
-- divergia sozinha: "Despesa", "Despesa fixa" e "despesa" eram três coisas
-- para o banco e uma só para quem lê.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'natureza_financeira') then
    create type natureza_financeira as enum (
      'receita_operacional',
      'deducao_receita',
      'cmv',
      'despesa_fixa',
      'despesa_comercial',
      'despesa_administrativa',
      'despesa_financeira',
      'investimento',
      'transferencia',
      'aporte_retirada'
    );
  end if;
end $$;

-- ── 2. Categorias com regras ───────────────────────────────────────────────
alter table categorias_financeiras
  add column if not exists id text,
  add column if not exists natureza_gerencial natureza_financeira,
  add column if not exists impacta_dre boolean not null default true,
  add column if not exists impacta_caixa boolean not null default true,
  add column if not exists exige_documento boolean not null default false,
  add column if not exists usar_em_automacao boolean not null default true,
  add column if not exists centro_custo text,
  add column if not exists criada_em timestamptz not null default now();

update categorias_financeiras set id = coalesce(id, lower(regexp_replace(
  translate(nome, 'áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ', 'aaaaeeiooouucAAAAEEIOOOUUC'),
  '[^a-zA-Z0-9]+', '-', 'g')));

-- Traduz a natureza antiga (texto livre) para o enum gerencial.
update categorias_financeiras
   set natureza_gerencial = case
     when natureza ilike 'receita%' then 'receita_operacional'::natureza_financeira
     when nome ilike '%imposto%' then 'deducao_receita'::natureza_financeira
     when nome in ('Perfume base', 'Frascos e insumos', 'Embalagens') then 'cmv'::natureza_financeira
     when nome in ('Frete', 'Taxas de pagamento') then 'cmv'::natureza_financeira
     when nome ilike '%ADS%' or nome ilike '%marketing%' or nome ilike '%motoboy%'
       then 'despesa_comercial'::natureza_financeira
     when natureza ilike '%fixa%' then 'despesa_fixa'::natureza_financeira
     else 'despesa_administrativa'::natureza_financeira
   end
 where natureza_gerencial is null;

alter table categorias_financeiras alter column natureza_gerencial set not null;

-- A PK da tabela é o NOME (herança do primeiro desenho, e há dados presos a
-- ela). O id ganha unicidade própria para poder ser referenciado por
-- lançamento e por regra sem quebrar o que já aponta para o nome.
alter table categorias_financeiras alter column id set not null;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'categoria_id_unico') then
    alter table categorias_financeiras add constraint categoria_id_unico unique (id);
  end if;
end $$;

comment on column categorias_financeiras.impacta_dre is
  'Transferência e aporte movem caixa sem passar pelo resultado';
comment on column categorias_financeiras.impacta_caixa is
  'Provisão de imposto entra na DRE antes de existir pagamento';

-- ── 3. Centros de custo ────────────────────────────────────────────────────
create table if not exists centros_custo (
  id text primary key,
  nome text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

insert into centros_custo (id, nome) values
  ('operacoes', 'Operações'),
  ('marketing', 'Marketing'),
  ('logistica', 'Logística'),
  ('administrativo', 'Administrativo'),
  ('producao', 'Produção'),
  ('financeiro', 'Financeiro'),
  ('vendas', 'Vendas')
on conflict (id) do nothing;

-- ── 4. Lançamentos: competência, vencimento e pagamento são TRÊS datas ─────
--
-- `ocorrido_em` fazia o papel das três, e por isso a DRE do mês incluía o que
-- foi PAGO no mês em vez do que foi CONSUMIDO nele. A conta de agosto paga em
-- setembro pertence a agosto na DRE e a setembro no caixa; sem colunas
-- separadas não há como dizer as duas coisas.
alter table lancamentos
  add column if not exists competencia date,
  add column if not exists categoria_id text references categorias_financeiras(id),
  add column if not exists centro_custo text references centros_custo(id),
  add column if not exists favorecido text,
  add column if not exists documento text,
  add column if not exists observacao text,
  add column if not exists multa numeric(12,2) not null default 0,
  add column if not exists juros numeric(12,2) not null default 0,
  add column if not exists desconto numeric(12,2) not null default 0,
  add column if not exists parcela smallint,
  add column if not exists parcelas smallint,
  add column if not exists pai_id text,
  add column if not exists transferencia_id text,
  add column if not exists conta_destino_id text references contas_bancarias(id),
  add column if not exists cancelado_em timestamptz,
  add column if not exists cancelado_motivo text,
  add column if not exists chave_externa text,
  add column if not exists atualizado_em timestamptz not null default now();

-- A competência de quem já existe é a data que havia: o histórico não inventa
-- um fato econômico que ninguém registrou.
update lancamentos set competencia = coalesce(competencia, ocorrido_em);
alter table lancamentos alter column competencia set not null;

update lancamentos l
   set categoria_id = c.id
  from categorias_financeiras c
 where l.categoria_id is null and c.nome = l.categoria;

comment on column lancamentos.competencia is
  'Data do FATO econômico — é ela que a DRE usa';
comment on column lancamentos.vence_em is
  'Data esperada do pagamento/recebimento — é ela que a projeção usa';
comment on column lancamentos.baixado_em is
  'Data EFETIVA da baixa — é ela que o caixa usa';
comment on column lancamentos.transferencia_id is
  'Une as duas pernas de uma transferência: saída em A, entrada em B';

-- Reimportar não pode duplicar: a chave externa é do registro de origem.
create unique index if not exists lancamento_chave_externa_unica
  on lancamentos (chave_externa) where chave_externa is not null;

create index if not exists lancamento_competencia on lancamentos (competencia);
create index if not exists lancamento_vencimento on lancamentos (vence_em) where baixado_em is null;
create index if not exists lancamento_transferencia on lancamentos (transferencia_id)
  where transferencia_id is not null;

-- ── 5. Contas: o saldo tem QUALIDADE, não só valor ─────────────────────────
--
-- "Saldo" sem origem é o que faz a tela mentir. Saldo lido por API, saldo
-- digitado à mão e saldo calculado pelos movimentos do ERP são três números
-- diferentes, e a interface precisa poder dizer qual está mostrando.
alter table contas_bancarias
  add column if not exists saldo_bloqueado numeric(12,2) not null default 0,
  add column if not exists origem_saldo text not null default 'calculado',
  add column if not exists sincronizado_em timestamptz,
  add column if not exists sincronizacao_status text,
  add column if not exists finalidade text,
  add column if not exists instituicao_codigo text,
  add column if not exists cor text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'conta_origem_saldo_valida') then
    alter table contas_bancarias add constraint conta_origem_saldo_valida
      check (origem_saldo in ('api', 'informado', 'calculado'));
  end if;
end $$;

update contas_bancarias
   set origem_saldo = case when saldo_informado is not null then 'informado' else 'calculado' end
 where origem_saldo = 'calculado' and saldo_informado is not null;

comment on column contas_bancarias.origem_saldo is
  'api | informado | calculado — a tela NUNCA chama de "saldo real" um valor inferido';

-- ── 6. Transferência: duas pernas, efeito zero no consolidado ──────────────
create or replace function registrar_transferencia(
  p_conta_origem text,
  p_conta_destino text,
  p_valor numeric,
  p_data date,
  p_descricao text default 'Transferência entre contas',
  p_operador text default 'ERP'
) returns text
language plpgsql
as $$
declare
  v_id text := 'TR-' || substr(md5(random()::text || clock_timestamp()::text), 1, 10);
  v_categoria text;
begin
  if p_conta_origem = p_conta_destino then
    raise exception 'origem e destino são a mesma conta';
  end if;
  if p_valor <= 0 then
    raise exception 'valor da transferência precisa ser positivo';
  end if;

  -- Categoria de transferência é criada sob demanda: ela não impacta DRE, e
  -- sem `impacta_dre = false` a movimentação viraria despesa e receita no
  -- mesmo mês, inflando os dois lados do resultado.
  select id into v_categoria from categorias_financeiras
   where natureza_gerencial = 'transferencia' limit 1;
  if v_categoria is null then
    insert into categorias_financeiras
      (id, nome, natureza, natureza_gerencial, impacta_dre, impacta_caixa, ativa)
    values
      ('transferencia', 'Transferência entre contas', 'Transferência', 'transferencia', false, true, true)
    returning id into v_categoria;
  end if;

  insert into lancamentos (
    id, ocorrido_em, competencia, vence_em, baixado_em, descricao, categoria,
    categoria_id, conta_id, conta_destino_id, tipo, valor, recebido, origem,
    transferencia_id, criado_por
  ) values (
    v_id || '-S', p_data, p_data, p_data, p_data, p_descricao, 'Transferência entre contas',
    v_categoria, p_conta_origem, p_conta_destino, 'saida', p_valor, p_valor, 'Transferência',
    v_id, p_operador
  ), (
    v_id || '-E', p_data, p_data, p_data, p_data, p_descricao, 'Transferência entre contas',
    v_categoria, p_conta_destino, p_conta_origem, 'entrada', p_valor, p_valor, 'Transferência',
    v_id, p_operador
  );

  return v_id;
end;
$$;

comment on function registrar_transferencia is
  'Duas pernas vinculadas: o caixa por conta muda, o consolidado e a DRE não';

-- ── 7. Parcelamento ────────────────────────────────────────────────────────
create or replace function parcelar_lancamento(
  p_lancamento_id text,
  p_parcelas smallint,
  p_intervalo_dias int default 30
) returns integer
language plpgsql
as $$
declare
  v_pai record;
  v_valor numeric;
  v_resto numeric;
  v_criadas int := 0;
begin
  select * into v_pai from lancamentos where id = p_lancamento_id;
  if not found then raise exception 'lançamento % não existe', p_lancamento_id; end if;
  if p_parcelas < 2 then raise exception 'parcelamento exige ao menos 2 parcelas'; end if;
  if v_pai.baixado_em is not null then raise exception 'lançamento já baixado não parcela'; end if;

  -- A sobra dos centavos vai na PRIMEIRA parcela: dividir 100 em 3 e deixar
  -- 33,33 três vezes perderia um centavo do total, e o total é o que o
  -- fornecedor cobra.
  v_valor := trunc(v_pai.valor / p_parcelas, 2);
  v_resto := v_pai.valor - (v_valor * p_parcelas);

  for i in 1..p_parcelas loop
    insert into lancamentos (
      id, ocorrido_em, competencia, vence_em, descricao, categoria, categoria_id,
      centro_custo, conta_id, tipo, valor, recebido, origem, favorecido,
      documento, observacao, parcela, parcelas, pai_id, criado_por
    ) values (
      p_lancamento_id || '-' || i,
      v_pai.ocorrido_em,
      v_pai.competencia,
      coalesce(v_pai.vence_em, v_pai.competencia) + ((i - 1) * p_intervalo_dias),
      v_pai.descricao || ' (' || i || '/' || p_parcelas || ')',
      v_pai.categoria, v_pai.categoria_id, v_pai.centro_custo, v_pai.conta_id,
      v_pai.tipo,
      v_valor + case when i = 1 then v_resto else 0 end,
      0, 'Parcelamento', v_pai.favorecido, v_pai.documento, v_pai.observacao,
      i::smallint, p_parcelas, p_lancamento_id, v_pai.criado_por
    );
    v_criadas := v_criadas + 1;
  end loop;

  -- O pai vira o contrato: fica cancelado como compromisso, mas não some —
  -- é ele que amarra as parcelas e guarda o histórico.
  update lancamentos
     set cancelado_em = now(),
         cancelado_motivo = 'substituído por ' || p_parcelas || ' parcelas',
         parcelas = p_parcelas
   where id = p_lancamento_id;

  return v_criadas;
end;
$$;

-- ── 8. Trilha de auditoria ─────────────────────────────────────────────────
create table if not exists financeiro_auditoria (
  id bigserial primary key,
  ocorrido_em timestamptz not null default now(),
  entidade text not null,
  entidade_id text not null,
  acao text not null,
  valor_anterior jsonb,
  valor_novo jsonb,
  operador text,
  justificativa text
);

create index if not exists auditoria_entidade
  on financeiro_auditoria (entidade, entidade_id, ocorrido_em desc);

comment on table financeiro_auditoria is
  'Nenhum registro financeiro conciliado é apagado: estorno e cancelamento deixam rastro';

-- ── 9. Fechamento de competência ───────────────────────────────────────────
create table if not exists competencias_fechadas (
  competencia text primary key,
  fechada_em timestamptz not null default now(),
  fechada_por text,
  hash_conteudo text,
  resumo jsonb,
  reaberta_em timestamptz,
  reaberta_por text,
  reabertura_motivo text
);

comment on table competencias_fechadas is
  'Competência fechada bloqueia alteração; reabrir exige motivo e fica registrado';

create or replace function competencia_esta_fechada(p_data date)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from competencias_fechadas
     where competencia = to_char(p_data, 'YYYY-MM')
       and reaberta_em is null
  )
$$;

-- Alterar lançamento de competência fechada é o erro que ninguém percebe até
-- o contador reclamar que o número mudou depois do envio.
create or replace function bloquear_competencia_fechada()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and old.competencia = new.competencia
     and competencia_esta_fechada(old.competencia)
     -- Baixa continua permitida: o caixa é outro regime e não altera a DRE
     -- já enviada. O que trava é mudar valor, categoria ou competência.
     and (old.valor is distinct from new.valor
          or old.categoria_id is distinct from new.categoria_id
          or old.tipo is distinct from new.tipo) then
    raise exception 'competência % está fechada — reabra antes de alterar',
      to_char(old.competencia, 'YYYY-MM');
  end if;
  return new;
end;
$$;

drop trigger if exists bloquear_competencia_fechada on lancamentos;
create trigger bloquear_competencia_fechada
  before update on lancamentos
  for each row execute function bloquear_competencia_fechada();
