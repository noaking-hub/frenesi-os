-- O DNA olfativo do quiz, espelhado no ERP.
--
-- A "base de conhecimento" que faz a curadoria do quiz acertar mora em duas
-- tabelas do Supabase dele: `perfumes` (nome, marca, gênero, descrição feita
-- para o quiz) e `perfume_tags` (categoria → valor: acorde, clima, estilo,
-- ocasião — o mesmo vocabulário das respostas do lead). Sem esse espelho, o
-- Gerente recusou recomendar — corretamente: regra dele é não afirmar sem
-- dado. Com o espelho, a recomendação vira cruzamento determinístico de
-- perfil × DNA, e a IA entra só para compor o texto, por cima de fato.
create table if not exists quiz_perfumes (
  id text primary key,
  nome text not null,
  marca text,
  genero text,
  ativo boolean not null default true,
  em_estoque boolean not null default true,
  descricao text,
  importado_em timestamptz not null default now()
);

create table if not exists quiz_perfume_tags (
  perfume_id text not null,
  categoria text not null,
  valor text not null,
  primary key (perfume_id, categoria, valor)
);

create index if not exists quiz_perfume_tags_perfume on quiz_perfume_tags (perfume_id);

alter table quiz_perfumes enable row level security;
alter table quiz_perfume_tags enable row level security;

comment on table quiz_perfumes is
  'Catálogo do quiz-frenesi espelhado de hora em hora — a base da curadoria.';
comment on table quiz_perfume_tags is
  'DNA olfativo por perfume (categoria → valor), espelhado do quiz.';
