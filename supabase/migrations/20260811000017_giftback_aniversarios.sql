-- Giftback: aniversário no cadastro do cliente + registro do parabéns.
--
-- O unique (email, ano) é a regra de negócio: um presente por aniversário.
-- Reenviar no mesmo ano é recusado pelo banco, não por lembrança da tela.
alter table clientes add column aniversario date;

create table giftbacks_enviados (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  ano        integer not null,
  cupom      text,
  canal      text not null default 'email',
  enviado_em timestamptz not null default now(),
  unique (email, ano)
);

alter table giftbacks_enviados enable row level security;
create policy erp_leitura on giftbacks_enviados for select to authenticated using (true);
