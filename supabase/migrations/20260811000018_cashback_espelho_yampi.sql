-- O cashback é GERIDO PELA YAMPI: crédito, resgate e expiração acontecem no
-- checkout dela. O ERP espelha — não mantém livro próprio. As tabelas do
-- desenho anterior (regra + lançamentos locais) saem antes de qualquer dado
-- entrar nelas; fica o espelho: um retrato do saldo de cada carteira, com a
-- data em que foi tirado.
drop table if exists cashback_lancamentos;
drop table if exists cashback_regra;

create table cashback_yampi (
  customer_id   text primary key,
  email         text,
  nome          text,
  saldo         numeric(10, 2) not null default 0,
  atualizado_em timestamptz not null default now()
);

create index on cashback_yampi (email);

alter table cashback_yampi enable row level security;
create policy erp_leitura on cashback_yampi for select to authenticated using (true);
