-- Histórico da pesquisa de preços nos concorrentes (Produtos → Pesquisa de mercado).
--
-- O price-lab original não guardava nada: cada consulta morria na aba do
-- navegador. Aqui fica o registro de quando cada perfume foi pesquisado e o
-- resumo do que cada loja respondeu — o suficiente para responder "quanto
-- estava o Invictus semana passada?" sem depender de memória.
create table if not exists public.pesquisas_de_mercado (
  id uuid primary key default gen_random_uuid(),
  -- O que foi digitado e a palavra efetivamente buscada (a primeira).
  termo text not null,
  palavra text not null,
  -- Resumo por loja: [{chave, total, menor_preco, erro}].
  resultados jsonb not null,
  total integer not null default 0,
  executada_em timestamptz not null default now(),
  executada_por text
);

create index if not exists pesquisas_de_mercado_recentes
  on public.pesquisas_de_mercado (executada_em desc);

alter table public.pesquisas_de_mercado enable row level security;
revoke all on public.pesquisas_de_mercado from anon, authenticated;

comment on table public.pesquisas_de_mercado is
  'Histórico da pesquisa de preços nos sites concorrentes. O price-lab original não guardava consulta nenhuma.';
