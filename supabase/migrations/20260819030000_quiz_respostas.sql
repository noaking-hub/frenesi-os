-- O espelho das respostas da Curadoria Olfativa (quiz-frenesi).
--
-- O quiz roda em projeto próprio, com Supabase próprio; o ERP importa as
-- respostas de hora em hora e cruza com os clientes por e-mail. A linha
-- inteira vem em `dados` porque o schema do quiz não é nosso: o dia em que o
-- formato do perfil olfativo interessar, ele já estará aqui desde a primeira
-- resposta importada.
create table if not exists quiz_respostas (
  -- '<tabela de origem>:<id na origem>' — idempotência da importação.
  id text primary key,
  email text,
  respondido_em timestamptz,
  dados jsonb not null,
  tabela_origem text not null,
  importado_em timestamptz not null default now()
);

create index if not exists quiz_respostas_email on quiz_respostas (lower(email));

alter table quiz_respostas enable row level security;

comment on table quiz_respostas is
  'Respostas da Curadoria Olfativa, importadas do Supabase do quiz. Linha crua em dados (jsonb).';
