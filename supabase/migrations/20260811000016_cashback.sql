-- Cashback: regra única + livro de lançamentos por cliente.
--
-- O crédito nasce do pedido PAGO (um por pedido, garantido por índice) e
-- vence; resgates e ajustes são lançamentos negativos feitos pela operação.
-- Saldo é derivado do livro, nunca uma coluna — coluna de saldo diverge.
create table cashback_regra (
  id            boolean primary key default true check (id),
  pct           numeric(5, 2) not null default 5,
  validade_dias integer not null default 90,
  ativo         boolean not null default true,
  atualizado_em timestamptz not null default now()
);

create table cashback_lancamentos (
  id           uuid primary key default gen_random_uuid(),
  email        text not null,
  cliente_nome text,
  pedido_id    text,
  tipo         text not null check (tipo in ('credito', 'resgate', 'ajuste')),
  -- Positivo credita, negativo debita. Resgate é sempre negativo.
  valor        numeric(10, 2) not null,
  descricao    text,
  criado_em    timestamptz not null default now(),
  -- Só crédito vence. Resgate e ajuste não têm validade.
  expira_em    date
);

create index on cashback_lancamentos (email);
create unique index cashback_um_credito_por_pedido
  on cashback_lancamentos (pedido_id) where tipo = 'credito';

alter table cashback_regra enable row level security;
alter table cashback_lancamentos enable row level security;
create policy erp_leitura on cashback_regra for select to authenticated using (true);
create policy erp_leitura on cashback_lancamentos for select to authenticated using (true);
