-- ═══════════════════════════════════════════════════════════════════════════
-- FRENESI OS · schema inicial
--
-- Princípio que atravessa o schema: o estoque autoritativo é volume de perfume
-- base em ml. Consumo de lote, unidades geradas e perda real são DERIVADOS do
-- extrato de saídas — por isso são views, não colunas.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ── Domínios ───────────────────────────────────────────────────────────────

-- Cinco variantes de venda. Não existem outros volumes.
create domain variante_ml as smallint check (value in (3, 5, 8, 10, 15));

create type status_pagamento as enum ('pago', 'pendente', 'divergente');
create type status_envio as enum (
  'nao_iniciado', 'aguardando_envio', 'enviado', 'entregue', 'retido', 'atrasado'
);
create type canal_venda as enum ('shopify', 'yampi', 'whatsapp', 'instagram');
create type gateway_frete as enum ('frenet', 'melhor_envio');
create type acao_sync as enum ('esgotar', 'reduzir', 'repor', 'ok');
create type status_devolucao as enum (
  'nova', 'em_analise', 'aguardando_fotos', 'aprovada', 'recusada',
  'aguardando_postagem', 'em_transito_reverso', 'recebida', 'concluida'
);
create type motivo_devolucao as enum (
  'nao_gostei', 'produto_diferente', 'danificado', 'volume_abaixo', 'outro'
);

-- ── Parâmetros de precificação ─────────────────────────────────────────────
-- Linha única versionada: mexer no parâmetro muda todo preço calculado, então
-- a alteração fica registrada em vez de sobrescrever.

create table parametros_precificacao (
  id                  uuid primary key default gen_random_uuid(),
  intermediador_pct   numeric(6, 3) not null default 4.330,
  intermediador_fixo  numeric(10, 2) not null default 0.60,
  checkout_pct        numeric(6, 3) not null default 1.990,
  imposto_pct         numeric(6, 3) not null default 6.000,
  ads_pct             numeric(6, 3) not null default 12.000,
  insumos             numeric(10, 2) not null default 4.80,
  frete_subsidio      numeric(10, 2) not null default 8.00,
  antifraude          numeric(10, 2) not null default 0.49,
  -- Estimativa de perda no envase. A perda real só é medida ao encerrar o lote.
  perda_pct           numeric(6, 3) not null default 3.000,
  margem_alvo         numeric(6, 3) not null default 25.000,
  vigente_desde       timestamptz not null default now(),
  criado_por          text,
  constraint parametros_coerentes check (
    intermediador_pct + checkout_pct + imposto_pct + ads_pct + margem_alvo < 100
  )
);

comment on constraint parametros_coerentes on parametros_precificacao is
  'Taxas + margem alvo acima de 100% tornam o denominador do preço ideal negativo.';

-- ── Catálogo e estoque ─────────────────────────────────────────────────────

create table perfumes_base (
  id              text primary key,
  nome            text not null,
  marca           text not null,
  genero          text,
  custo_por_ml    numeric(10, 4) not null check (custo_por_ml >= 0),
  -- Fonte autoritativa do estoque.
  volume_ml       numeric(12, 2) not null default 0 check (volume_ml >= 0),
  consumo_diario_ml numeric(10, 2) not null default 0 check (consumo_diario_ml >= 0),
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now()
);

-- Decants já envasados, por base e variante.
create table produtos_derivados (
  base_id         text not null references perfumes_base (id) on delete cascade,
  variante        variante_ml not null,
  envasadas       integer not null default 0 check (envasadas >= 0),
  reservadas      integer not null default 0 check (reservadas >= 0),
  preco_praticado numeric(10, 2),
  primary key (base_id, variante),
  constraint reserva_dentro_do_envasado check (reservadas <= envasadas)
);

-- O que está publicado na Shopify hoje, por variante.
-- O cliente decrementa manualmente lá; esta tabela guarda o que o ERP leu.
create table shopify_publicado (
  base_id      text not null references perfumes_base (id) on delete cascade,
  variante     variante_ml not null,
  publicado    integer not null default 20 check (publicado >= 0),
  lido_em      timestamptz not null default now(),
  primary key (base_id, variante)
);

-- ── Lotes ──────────────────────────────────────────────────────────────────

create table lotes (
  id            text primary key,
  base_id       text not null references perfumes_base (id),
  fornecedor    text not null,
  volume_ml     numeric(12, 2) not null check (volume_ml > 0),
  custo_total   numeric(12, 2),
  entrada_em    date not null,
  -- Null = lote aberto. Preenchido quando o operador declara o frasco vazio.
  encerrado_em  date,
  encerrado_por text,
  constraint encerramento_apos_entrada check (encerrado_em is null or encerrado_em >= entrada_em)
);

-- Extrato de saídas de produção. Fonte única do consumo do lote.
create table lote_saidas (
  id            uuid primary key default gen_random_uuid(),
  lote_id       text not null references lotes (id) on delete cascade,
  ordem_id      text not null,
  ocorrida_em   date not null,
  unidades      integer not null check (unidades > 0),
  variante      variante_ml not null
);

create index on lote_saidas (lote_id);

-- ── Movimentações de estoque ───────────────────────────────────────────────
-- Uma ação, um lançamento: encerrar um lote GERA a movimentação de ajuste
-- (mesma data, mesma quantidade, ref = id do lote). Não são registros separados.

create table movimentacoes (
  id            uuid primary key default gen_random_uuid(),
  base_id       text not null references perfumes_base (id),
  tipo          text not null check (tipo in ('entrada', 'saida', 'ajuste', 'devolucao')),
  ocorrida_em   timestamptz not null default now(),
  -- Positivo entra, negativo sai.
  volume_ml     numeric(12, 2) not null,
  -- Volume líquido efetivamente envasado numa saída. A perda técnica é a
  -- diferença entre |volume_ml| e este valor.
  liquido_ml    numeric(12, 2),
  -- Origem do lançamento: id do lote, da ordem de produção ou da devolução.
  ref           text,
  descricao     text not null,
  criado_em     timestamptz not null default now()
);

create index on movimentacoes (base_id, ocorrida_em desc);
create index on movimentacoes (ref);

-- ── Pedidos ────────────────────────────────────────────────────────────────

create table clientes (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  email      text not null unique,
  cpf        text unique,
  telefone   text,
  cidade     text,
  uf         char(2),
  criado_em  timestamptz not null default now()
);

create index on clientes (cpf);

create table pedidos (
  id             text primary key,
  cliente_id     uuid references clientes (id),
  canal          canal_venda not null,
  valor          numeric(12, 2) not null,
  frete          numeric(12, 2) not null default 0,
  cashback       numeric(12, 2) not null default 0,
  pagamento      status_pagamento not null default 'pendente',
  envio          status_envio not null default 'nao_iniciado',
  comprado_em    timestamptz not null,
  -- Marcação de entrega vinda da Yampi. É daqui que o prazo de devolução conta.
  entregue_em    timestamptz,
  destino        text,
  cep            text,
  logradouro     text,
  peso           text,
  dimensoes      text,
  -- O reverso é gerado na mesma plataforma que emitiu a etiqueta de ida.
  gateway        gateway_frete,
  rastreio       text,
  -- A Yampi recebe o rastreio mas não reporta a entrega para a Shopify.
  baixado_shopify boolean not null default false
);

create index on pedidos (cliente_id);
create index on pedidos (entregue_em);

create table pedido_itens (
  id         uuid primary key default gen_random_uuid(),
  pedido_id  text not null references pedidos (id) on delete cascade,
  base_id    text references perfumes_base (id),
  descricao  text not null,
  variante   variante_ml,
  quantidade integer not null default 1 check (quantidade > 0),
  preco      numeric(10, 2) not null
);

create index on pedido_itens (pedido_id);

-- ── Devoluções ─────────────────────────────────────────────────────────────

create table devolucoes (
  id            text primary key,
  pedido_id     text not null references pedidos (id),
  motivo        motivo_devolucao not null,
  comentario    text,
  status        status_devolucao not null default 'nova',
  aberta_em     timestamptz not null default now(),
  analisada_em  timestamptz,
  analisada_por text,
  -- Reverso emitido na mesma plataforma da etiqueta de ida.
  reverso_gateway gateway_frete,
  reverso_codigo  text,
  reverso_enviado_em timestamptz
);

create table devolucao_itens (
  id             uuid primary key default gen_random_uuid(),
  devolucao_id   text not null references devolucoes (id) on delete cascade,
  pedido_item_id uuid not null references pedido_itens (id),
  -- Volume medido na conferência. Critério interno: aceita-se até 10% abaixo
  -- do volume fracionado. NUNCA exibido ao cliente.
  volume_medido_ml numeric(8, 2)
);

create table devolucao_fotos (
  id           uuid primary key default gen_random_uuid(),
  devolucao_id text not null references devolucoes (id) on delete cascade,
  slot         text not null check (slot in ('nivel', 'lacre', 'dano')),
  storage_path text not null,
  enviada_em   timestamptz not null default now()
);

-- ── Views derivadas ────────────────────────────────────────────────────────
-- Nada de número escrito à mão: se duas telas mostram a mesma grandeza,
-- elas leem o mesmo cálculo.

-- Consumo e unidades de cada lote, derivados do extrato de saídas.
create view lote_apuracao as
select
  l.id,
  l.base_id,
  b.nome as perfume,
  l.fornecedor,
  l.volume_ml as comprado_ml,
  coalesce(sum(s.unidades * s.variante), 0) as consumido_ml,
  coalesce(sum(s.unidades), 0) as unidades,
  l.entrada_em,
  l.encerrado_em,
  l.encerrado_em is null as aberto,
  -- Aberto: saldo teórico. Encerrado: perda real.
  l.volume_ml - coalesce(sum(s.unidades * s.variante), 0) as diferenca_ml,
  case
    when l.encerrado_em is null or l.volume_ml = 0 then null
    else ((l.volume_ml - coalesce(sum(s.unidades * s.variante), 0)) / l.volume_ml) * 100
  end as perda_pct
from lotes l
join perfumes_base b on b.id = l.base_id
left join lote_saidas s on s.lote_id = l.id
group by l.id, b.nome;

-- Perda real média ponderada por volume comprado, sobre os lotes encerrados.
create view perda_real as
select
  count(*) filter (where not aberto) as lotes_encerrados,
  count(*) filter (where aberto) as lotes_abertos,
  case
    when coalesce(sum(comprado_ml) filter (where not aberto), 0) = 0 then 0
    else (sum(diferenca_ml) filter (where not aberto)
          / sum(comprado_ml) filter (where not aberto)) * 100
  end as media_pct,
  coalesce(sum(diferenca_ml * b.custo_por_ml) filter (where not aberto), 0) as custo
from lote_apuracao a
join perfumes_base b on b.id = a.base_id;

-- Conciliação: o saldo teórico dos lotes abertos deve igualar o volume em
-- estoque. É invariante do sistema — divergência aqui é lançamento fora do fluxo.
create view conciliacao_lotes as
select
  (select coalesce(sum(diferenca_ml), 0) from lote_apuracao where aberto) as saldo_lotes_ml,
  (select coalesce(sum(volume_ml), 0) from perfumes_base) as estoque_ml,
  (select coalesce(sum(diferenca_ml), 0) from lote_apuracao where aberto)
    - (select coalesce(sum(volume_ml), 0) from perfumes_base) as divergencia_ml;

-- Unidades vendáveis por variante e a ação de sincronia correspondente.
create view sincronia_shopify as
with grade as (
  select b.id as base_id, b.nome, b.marca, b.volume_ml, v.variante
  from perfumes_base b
  cross join (values (3::smallint), (5), (8), (10), (15)) as v (variante)
  where b.ativo
)
select
  g.base_id,
  g.nome,
  g.marca,
  g.volume_ml,
  g.variante,
  coalesce(d.envasadas - d.reservadas, 0) as prontos,
  floor(g.volume_ml / g.variante)::int as do_volume,
  coalesce(d.envasadas - d.reservadas, 0) + floor(g.volume_ml / g.variante)::int as possivel,
  coalesce(p.publicado, 20) as publicado,
  greatest(
    0,
    coalesce(p.publicado, 20)
      - (coalesce(d.envasadas - d.reservadas, 0) + floor(g.volume_ml / g.variante)::int)
  ) as excesso,
  case
    when coalesce(d.envasadas - d.reservadas, 0) + floor(g.volume_ml / g.variante)::int = 0
      then 'esgotar'::acao_sync
    when coalesce(p.publicado, 20)
       > coalesce(d.envasadas - d.reservadas, 0) + floor(g.volume_ml / g.variante)::int
      then 'reduzir'::acao_sync
    when coalesce(p.publicado, 20) < 20
     and coalesce(d.envasadas - d.reservadas, 0) + floor(g.volume_ml / g.variante)::int >= 20
      then 'repor'::acao_sync
    else 'ok'::acao_sync
  end as acao
from grade g
left join produtos_derivados d on d.base_id = g.base_id and d.variante = g.variante
left join shopify_publicado p on p.base_id = g.base_id and p.variante = g.variante;

-- Cobertura em dias: volume ÷ consumo diário.
create view cobertura_estoque as
select
  b.id,
  b.nome,
  b.marca,
  b.volume_ml,
  b.consumo_diario_ml,
  case when b.consumo_diario_ml = 0 then null
       else round(b.volume_ml / b.consumo_diario_ml) end as dias,
  case
    when b.volume_ml = 0 then 'zero'
    when b.consumo_diario_ml = 0 then 'ok'
    when b.volume_ml / b.consumo_diario_ml < 7 then 'urgente'
    when b.volume_ml / b.consumo_diario_ml < 20 then 'atencao'
    when b.volume_ml / b.consumo_diario_ml > 90 then 'parado'
    else 'ok'
  end as criticidade
from perfumes_base b
where b.ativo;

-- ── Encerramento de lote ───────────────────────────────────────────────────
-- Uma ação, um lançamento: declarar o frasco vazio GERA a movimentação de
-- ajuste. Não existem dois registros para o mesmo fato.

create function encerrar_lote(p_lote_id text, p_operador text)
returns void
language plpgsql
as $$
declare
  v_lote lotes%rowtype;
  v_perda numeric(12, 2);
begin
  select * into v_lote from lotes where id = p_lote_id for update;
  if not found then
    raise exception 'Lote % não existe', p_lote_id;
  end if;
  if v_lote.encerrado_em is not null then
    raise exception 'Lote % já foi encerrado em %', p_lote_id, v_lote.encerrado_em;
  end if;

  select diferenca_ml into v_perda from lote_apuracao where id = p_lote_id;

  update lotes
     set encerrado_em = current_date,
         encerrado_por = p_operador
   where id = p_lote_id;

  insert into movimentacoes (base_id, tipo, ocorrida_em, volume_ml, ref, descricao)
  values (
    v_lote.base_id,
    'ajuste',
    current_date,
    -v_perda,
    p_lote_id,
    format('Encerramento do lote %s · perda real apurada', p_lote_id)
  );

  update perfumes_base
     set volume_ml = greatest(0, volume_ml - v_perda)
   where id = v_lote.base_id;
end;
$$;

comment on function encerrar_lote is
  'Declara o frasco vazio e gera a movimentação de ajuste correspondente. '
  'A perda real é a diferença entre comprado e envasado.';

-- ── RLS ────────────────────────────────────────────────────────────────────
-- O ERP é interno e roda com service role no servidor. O portal público lê e
-- escreve só o que precisa, via rotas do servidor — nenhuma tabela é exposta
-- diretamente ao anon.

alter table parametros_precificacao enable row level security;
alter table perfumes_base           enable row level security;
alter table produtos_derivados      enable row level security;
alter table shopify_publicado       enable row level security;
alter table lotes                   enable row level security;
alter table lote_saidas             enable row level security;
alter table movimentacoes           enable row level security;
alter table clientes                enable row level security;
alter table pedidos                 enable row level security;
alter table pedido_itens            enable row level security;
alter table devolucoes              enable row level security;
alter table devolucao_itens         enable row level security;
alter table devolucao_fotos         enable row level security;

-- Operadores autenticados do ERP leem tudo.
create policy erp_leitura on perfumes_base      for select to authenticated using (true);
create policy erp_leitura on produtos_derivados for select to authenticated using (true);
create policy erp_leitura on shopify_publicado  for select to authenticated using (true);
create policy erp_leitura on lotes              for select to authenticated using (true);
create policy erp_leitura on lote_saidas        for select to authenticated using (true);
create policy erp_leitura on movimentacoes      for select to authenticated using (true);
create policy erp_leitura on clientes           for select to authenticated using (true);
create policy erp_leitura on pedidos            for select to authenticated using (true);
create policy erp_leitura on pedido_itens       for select to authenticated using (true);
create policy erp_leitura on devolucoes         for select to authenticated using (true);
create policy erp_leitura on devolucao_itens    for select to authenticated using (true);
create policy erp_leitura on devolucao_fotos    for select to authenticated using (true);
create policy erp_leitura on parametros_precificacao for select to authenticated using (true);
