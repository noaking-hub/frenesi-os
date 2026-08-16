-- Solicitação interna de compra — §4.10 e Fase 4.
--
-- É o ponto onde a recomendação de reposição deixa de ser conversa e vira
-- registro que alguém executa. E é deliberadamente uma SOLICITAÇÃO, não uma
-- compra: pagamento bancário está na classe D do escopo e continua fora da
-- autonomia da IA. O que ela pode é preparar a decisão inteira — produto,
-- quantidade, custo previsto, cobertura pós-compra e efeito no caixa — para um
-- humano aprovar e comprar.
create table if not exists public.solicitacoes_compra (
  id uuid primary key default gen_random_uuid(),
  base_id text references public.perfumes_base(id) on delete set null,
  base_nome text not null,
  quantidade_ml numeric(12,2) not null check (quantidade_ml > 0),
  custo_por_ml numeric(12,4),
  custo_estimado numeric(12,2),
  fornecedor text,
  -- O estado do estoque no MOMENTO do pedido. Guardado junto porque a
  -- justificativa envelhece: em duas semanas a cobertura muda, e sem o retrato
  -- ninguém consegue reconstruir por que a compra pareceu urgente.
  cobertura_dias_no_pedido numeric(8,1),
  disponivel_ml_no_pedido numeric(12,2),
  cobertura_pos_compra_dias numeric(8,1),
  justificativa text not null,
  impacto_no_caixa jsonb,
  situacao text not null default 'aberta'
    check (situacao in ('aberta', 'comprada', 'cancelada')),
  criada_em timestamptz not null default now(),
  criada_por text,
  trace_id uuid,
  atualizada_em timestamptz not null default now(),
  fechada_em timestamptz,
  fechada_por text,
  observacao text
);

create index if not exists solicitacoes_compra_abertas
  on public.solicitacoes_compra (situacao, criada_em desc);

alter table public.solicitacoes_compra enable row level security;

comment on table public.solicitacoes_compra is
  'Pedido interno de reposição criado pelo Gerente. Nunca efetua pagamento: prepara a decisão.';

-- Anotações do Gerente em qualquer registro — classe A, reversível.
create table if not exists public.gerente_anotacoes (
  id uuid primary key default gen_random_uuid(),
  alvo_tipo text not null check (alvo_tipo in ('pedido', 'lancamento', 'base', 'geral')),
  alvo_id text,
  texto text not null,
  trace_id uuid,
  criada_em timestamptz not null default now(),
  criada_por text,
  removida_em timestamptz
);

create index if not exists gerente_anotacoes_alvo
  on public.gerente_anotacoes (alvo_tipo, alvo_id, criada_em desc)
  where removida_em is null;

alter table public.gerente_anotacoes enable row level security;
