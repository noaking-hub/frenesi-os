-- Quem pode entrar no ERP.
--
-- A identidade e a senha ficam no Supabase Auth (auth.users) — hash, reset e
-- sessão são problema resolvido, e reimplementar isso à mão é como o vazamento
-- começa. Esta tabela guarda o que é do NEGÓCIO: o nome que aparece na tela, o
-- papel e se a pessoa ainda trabalha aqui.
--
-- `ativo` existe separado do usuário do Auth de propósito: desligar alguém tem
-- que ser um clique reversível na tela, não uma exclusão que apaga o rastro de
-- quem fez o quê.

create table if not exists usuarios (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null,
  email text not null unique,
  -- 'dono' abre Configurações e a gestão de usuários; 'operacao' usa o resto.
  papel text not null default 'operacao' check (papel in ('dono', 'operacao')),
  ativo boolean not null default true,
  ultimo_acesso_em timestamptz,
  criado_em timestamptz not null default now()
);

comment on table usuarios is 'Perfil de negócio de quem entra no ERP; a credencial vive no Supabase Auth';

-- O ERP inteiro roda no servidor com a service role, que ignora RLS. Ligar RLS
-- aqui mesmo assim: se um dia alguém consultar esta tabela com a chave pública
-- do navegador, o padrão tem que ser negar, não expor a lista de quem tem
-- acesso ao sistema.
alter table usuarios enable row level security;

drop policy if exists usuarios_le_a_si_mesmo on usuarios;
create policy usuarios_le_a_si_mesmo on usuarios
  for select using (auth.uid() = id);
