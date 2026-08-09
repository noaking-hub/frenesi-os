-- ═══════════════════════════════════════════════════════════════════════════
-- Financeiro: contas, categorias, lançamentos, repasses e envio contábil.
-- ═══════════════════════════════════════════════════════════════════════════

create table contas_bancarias (
  id         text primary key,
  nome       text not null,
  tipo       text not null,
  banco      text not null,
  uso        text not null default '',
  principal  boolean not null default false,
  ativa      boolean not null default true,
  criada_em  timestamptz not null default now()
);

-- Saldo NÃO é coluna: é a soma dos lançamentos baixados. Guardar o número
-- aqui criaria uma segunda verdade que envelhece a cada baixa esquecida.
comment on table contas_bancarias is
  'Contas do caixa. O saldo é derivado dos lançamentos, nunca armazenado.';

create table categorias_financeiras (
  nome      text primary key,
  natureza  text not null check (natureza in ('Custo variável', 'Despesa fixa', 'Despesa')),
  ativa     boolean not null default true
);

comment on column categorias_financeiras.natureza is
  'Separa o que varia com a venda do que existe vendendo ou não — é a divisão que sustenta o ponto de equilíbrio.';

create sequence lancamentos_id_seq start 1;

create table lancamentos (
  id          text primary key,
  ocorrido_em date not null,
  descricao   text not null,
  categoria   text references categorias_financeiras (nome),
  conta_id    text references contas_bancarias (id),
  tipo        text not null check (tipo in ('entrada', 'saida')),
  valor       numeric(12, 2) not null check (valor > 0),
  -- Null = ainda não houve baixa. É o que separa previsto de realizado, e o
  -- que faz o saldo da conta ser fato em vez de intenção.
  baixado_em  date,
  vence_em    date,
  recorrente  boolean not null default false,
  origem      text not null default 'Manual',
  pedido_id   text references pedidos (id),
  criado_em   timestamptz not null default now(),
  criado_por  text
);

create index on lancamentos (ocorrido_em);
create index on lancamentos (conta_id);
create index on lancamentos (baixado_em);

/**
 * Saldo e movimento do mês por conta, derivados dos lançamentos baixados.
 *
 * Só entra o que foi baixado: previsão não é dinheiro em conta.
 */
create view contas_saldo as
select
  c.id,
  c.nome,
  c.tipo,
  c.banco,
  c.uso,
  c.principal,
  c.ativa,
  coalesce(sum(l.valor) filter (where l.tipo = 'entrada' and l.baixado_em is not null), 0)
    - coalesce(sum(l.valor) filter (where l.tipo = 'saida' and l.baixado_em is not null), 0)
    as saldo,
  coalesce(sum(l.valor) filter (
    where l.tipo = 'entrada' and l.baixado_em >= date_trunc('month', current_date)
  ), 0) as entradas_mes,
  coalesce(sum(l.valor) filter (
    where l.tipo = 'saida' and l.baixado_em >= date_trunc('month', current_date)
  ), 0) as saidas_mes
from contas_bancarias c
left join lancamentos l on l.conta_id = c.id
group by c.id;

/**
 * Repasse de um pedido: o que a plataforma deve creditar e o que caiu.
 *
 * A linha nasce do pedido; só `recebido` e `creditado_em` são informados pela
 * conciliação. A taxa fica congelada aqui porque o parâmetro muda com o tempo
 * e um repasse antigo tem de continuar explicável pela taxa da época.
 */
create table repasses (
  pedido_id    text primary key references pedidos (id) on delete cascade,
  origem       text not null,
  taxa_pct     numeric(6, 3) not null default 0,
  recebido     numeric(12, 2),
  creditado_em date,
  conciliado_por text
);

create table envios_contabeis (
  id         bigint generated always as identity primary key,
  competencia date not null,
  arquivo    text not null,
  conteudo   text not null,
  registros  integer not null default 0,
  bytes      bigint not null default 0,
  estado     text not null default 'Processando'
    check (estado in ('Aceito', 'Processando', 'Recusado')),
  nota       text not null default '',
  enviado_em timestamptz not null default now(),
  enviado_por text
);

/**
 * Cria o lançamento com id sequencial legível.
 *
 * `baixado_em` decide tudo o que a tela mostra depois: com data é realizado e
 * entra no saldo; sem data é previsão e fica na fila de baixa.
 */
create function registrar_lancamento(
  p_descricao   text,
  p_categoria   text,
  p_conta_id    text,
  p_tipo        text,
  p_valor       numeric,
  p_ocorrido_em date,
  p_vence_em    date,
  p_baixado     boolean,
  p_recorrente  boolean,
  p_origem      text,
  p_operador    text
) returns text
language plpgsql
as $$
declare
  v_id text;
begin
  if coalesce(trim(p_descricao), '') = '' then
    raise exception 'informe a descrição do lançamento';
  end if;
  if p_valor is null or p_valor <= 0 then
    raise exception 'o valor deve ser maior que zero';
  end if;
  if p_tipo not in ('entrada', 'saida') then
    raise exception 'tipo inválido: %', p_tipo;
  end if;

  v_id := 'LC-' || lpad(nextval('lancamentos_id_seq')::text, 5, '0');

  insert into lancamentos (
    id, ocorrido_em, descricao, categoria, conta_id, tipo, valor,
    baixado_em, vence_em, recorrente, origem, criado_por
  ) values (
    v_id, coalesce(p_ocorrido_em, current_date), trim(p_descricao),
    nullif(trim(p_categoria), ''), nullif(trim(p_conta_id), ''), p_tipo, p_valor,
    case when p_baixado then coalesce(p_ocorrido_em, current_date) end,
    p_vence_em, coalesce(p_recorrente, false),
    coalesce(nullif(trim(p_origem), ''), 'Manual'), p_operador
  );

  return v_id;
end;
$$;

comment on function registrar_lancamento is
  'Cria um lançamento financeiro. Baixado entra no saldo; não baixado fica na fila.';

/** Dar baixa é reconhecer que o dinheiro entrou ou saiu de fato. */
create function baixar_lancamento(p_id text, p_quando date, p_operador text)
returns void
language plpgsql
as $$
declare
  v_baixado date;
begin
  select baixado_em into v_baixado from lancamentos where id = p_id for update;
  if not found then
    raise exception 'lançamento % não existe', p_id;
  end if;
  if v_baixado is not null then
    raise exception 'lançamento % já foi baixado em %', p_id, v_baixado;
  end if;

  update lancamentos
     set baixado_em = coalesce(p_quando, current_date),
         criado_por = coalesce(criado_por, p_operador)
   where id = p_id;
end;
$$;

comment on function baixar_lancamento is
  'Marca o lançamento como realizado. Só então ele conta no saldo da conta.';

/**
 * Registra o crédito de um repasse. A divergência não é gravada: ela é a
 * comparação entre o recebido e o líquido esperado, calculada na leitura —
 * assim mudar a taxa não reescreve o histórico.
 */
create function conciliar_repasse(
  p_pedido_id text,
  p_recebido  numeric,
  p_quando    date,
  p_operador  text
) returns void
language plpgsql
as $$
begin
  if p_recebido is null or p_recebido < 0 then
    raise exception 'o valor recebido não pode ser negativo';
  end if;
  if not exists (select 1 from repasses where pedido_id = p_pedido_id) then
    raise exception 'não há repasse previsto para o pedido %', p_pedido_id;
  end if;

  update repasses
     set recebido = p_recebido,
         creditado_em = coalesce(p_quando, current_date),
         conciliado_por = p_operador
   where pedido_id = p_pedido_id;
end;
$$;

comment on function conciliar_repasse is
  'Informa o valor creditado pela plataforma. A divergência é calculada na leitura.';

/**
 * Cria as linhas de repasse que faltam a partir dos pedidos.
 *
 * A taxa vem do parâmetro vigente e fica congelada na linha: repasse antigo
 * precisa continuar explicável pela taxa da época.
 */
create function prever_repasses()
returns integer
language plpgsql
as $$
declare
  v_taxa  numeric;
  v_novos integer;
begin
  select intermediador_pct into v_taxa
    from parametros_precificacao order by vigente_desde desc limit 1;

  insert into repasses (pedido_id, origem, taxa_pct)
  select p.id,
         initcap(p.canal::text) || ' · ' || initcap(p.pagamento::text),
         coalesce(v_taxa, 0)
    from pedidos p
   where not exists (select 1 from repasses r where r.pedido_id = p.id);

  get diagnostics v_novos = row_count;
  return v_novos;
end;
$$;

comment on function prever_repasses is
  'Gera a previsão de repasse dos pedidos ainda sem linha. Retorna quantas criou.';

alter table contas_bancarias      enable row level security;
alter table categorias_financeiras enable row level security;
alter table lancamentos           enable row level security;
alter table repasses              enable row level security;
alter table envios_contabeis      enable row level security;

create policy erp_leitura on contas_bancarias       for select to authenticated using (true);
create policy erp_leitura on categorias_financeiras for select to authenticated using (true);
create policy erp_leitura on lancamentos            for select to authenticated using (true);
create policy erp_leitura on repasses               for select to authenticated using (true);
create policy erp_leitura on envios_contabeis       for select to authenticated using (true);

-- As naturezas que a DRE conhece. Sem elas a primeira classificação seria
-- digitar texto livre, e o relatório passaria a somar categorias parecidas.
insert into categorias_financeiras (nome, natureza) values
  ('Perfume base',        'Custo variável'),
  ('Frascos e insumos',   'Custo variável'),
  ('Frete',               'Custo variável'),
  ('Taxas de pagamento',  'Custo variável'),
  ('Imposto',             'Custo variável'),
  ('Marketing e ADS',     'Despesa'),
  ('Pró-labore',          'Despesa fixa'),
  ('Ocupação',            'Despesa fixa'),
  ('Ferramentas e SaaS',  'Despesa fixa'),
  ('Diversos',            'Despesa')
on conflict (nome) do nothing;
