-- Tentativas de login que FALHARAM.
--
-- Só as falhas ficam registradas, e por um motivo: o sucesso já tem seu
-- registro em usuarios.ultimo_acesso_em, e guardar todo acerto aqui criaria um
-- histórico de presença que ninguém pediu.
--
-- A chave é o e-mail em minúsculas e o IP. Nenhuma senha, nem hash dela,
-- encosta nesta tabela.
create table if not exists public.login_tentativas (
  id bigserial primary key,
  email text not null,
  ip text,
  motivo text,
  criada_em timestamptz not null default now()
);

-- Os dois índices são as duas perguntas que a porta faz a cada tentativa:
-- "quantas falhas neste e-mail?" e "quantas falhas desta origem?".
create index if not exists login_tentativas_email_idx
  on public.login_tentativas (email, criada_em desc);
create index if not exists login_tentativas_ip_idx
  on public.login_tentativas (ip, criada_em desc);

-- Tentativa velha não protege ninguém e vira peso morto. A limpeza roda junto
-- com a própria consulta da porta, sem depender de agendador.
create or replace function public.limpar_login_tentativas()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.login_tentativas where criada_em < now() - interval '2 hours';
$$;

alter table public.login_tentativas enable row level security;
-- Sem policy: só a service role (o servidor do ERP) enxerga. O navegador não
-- tem por que ler quantas vezes alguém errou a senha.
