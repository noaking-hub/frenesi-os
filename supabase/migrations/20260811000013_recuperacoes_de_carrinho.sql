-- Trilha dos e-mails de recuperação de carrinho.
--
-- A lista de carrinhos é lida ao vivo da Yampi e não vive no banco — mas o
-- que NÓS enviamos precisa viver: é o que evita mandar o mesmo e-mail duas
-- vezes para a mesma pessoa e o que mostra na tela "enviado há 2 dias".
create table recuperacoes_carrinho (
  id          uuid primary key default gen_random_uuid(),
  carrinho_id text not null,
  email       text not null,
  assunto     text not null,
  cupom       text,
  enviado_em  timestamptz not null default now()
);

create index on recuperacoes_carrinho (carrinho_id);

alter table recuperacoes_carrinho enable row level security;
create policy erp_leitura on recuperacoes_carrinho for select to authenticated using (true);
