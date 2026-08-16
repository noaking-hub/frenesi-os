create table empresa (
  id             boolean primary key default true check (id),
  razao_social   text not null default '',
  nome_fantasia  text not null default '',
  cnpj           text not null default '',
  inscricao      text not null default '',
  regime         text not null default 'Simples Nacional',
  email          text not null default '',
  telefone       text not null default '',
  cep            text not null default '',
  logradouro     text not null default '',
  cidade         text not null default '',
  uf             char(2),
  atualizado_em  timestamptz not null default now(),
  atualizado_por text
);

comment on table empresa is
  'Linha única (id sempre true): a empresa é uma só. O check impede uma segunda.';

insert into empresa (id) values (true) on conflict (id) do nothing;

alter table empresa enable row level security;
create policy erp_leitura on empresa for select to authenticated using (true);
