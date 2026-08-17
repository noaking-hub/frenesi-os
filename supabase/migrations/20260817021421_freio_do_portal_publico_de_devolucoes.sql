-- O portal de devoluções responde sem senha: informar um e-mail revela se
-- existe compra naquele endereço. Sem freio, isso é uma varredura barata.
-- Esta tabela é o placar — e guarda HASH da identidade consultada, nunca o
-- e-mail ou o CPF em claro: proteger o portal não pode custar um novo
-- depósito de dado pessoal.
create table if not exists portal_consultas (
  id bigserial primary key,
  chave text not null,
  ip text,
  motivo text not null default 'busca',
  criada_em timestamptz not null default now()
);

create index if not exists portal_consultas_chave_idx on portal_consultas (chave, criada_em desc);
create index if not exists portal_consultas_ip_idx on portal_consultas (ip, criada_em desc);
create index if not exists portal_consultas_criada_idx on portal_consultas (criada_em desc);

alter table portal_consultas enable row level security;
revoke all on portal_consultas from anon, authenticated;
revoke all on sequence portal_consultas_id_seq from anon, authenticated;

-- Placar não é histórico: o que passou da janela não protege ninguém e só
-- engorda a tabela.
create or replace function limpar_portal_consultas() returns void
language sql
security definer
set search_path = public
as $$
  delete from portal_consultas where criada_em < now() - interval '1 day';
$$;

revoke execute on function limpar_portal_consultas() from anon, authenticated, public;
