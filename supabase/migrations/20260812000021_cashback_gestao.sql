-- Cashback: de retrato de saldo para módulo de gestão.
--
-- O espelho guardava só o saldo. Para gerir vencimento, avisos e métricas
-- de período, a carteira ganha o que a operação precisa ver na tela, e os
-- movimentos do extrato passam a ser gravados — é deles que saem "cashback
-- gerado no mês", "utilizado", "pedidos com cashback" e "tempo médio de uso".

alter table cashback_yampi
  add column if not exists telefone text,
  add column if not exists expira_em date,
  add column if not exists gerado numeric(12, 2) not null default 0,
  add column if not exists usado numeric(12, 2) not null default 0,
  add column if not exists ultimo_credito_em timestamptz,
  add column if not exists aviso_em timestamptz;

comment on column cashback_yampi.expira_em is 'Vencimento do crédito vivo que expira primeiro';
comment on column cashback_yampi.aviso_em is 'Último aviso de vencimento enviado pelo ERP';

create table if not exists cashback_movimentos (
  id text primary key,
  customer_id text not null,
  tipo text not null,
  valor numeric(12, 2) not null default 0,
  usado numeric(12, 2) not null default 0,
  status text,
  pedido text,
  criado_em timestamptz,
  expira_em date,
  vale boolean not null default true
);

create index if not exists cashback_movimentos_criado_idx on cashback_movimentos (criado_em desc);
create index if not exists cashback_movimentos_cliente_idx on cashback_movimentos (customer_id);
create index if not exists cashback_yampi_expira_idx on cashback_yampi (expira_em) where saldo > 0;
