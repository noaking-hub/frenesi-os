-- A auditoria do Gerente ganha o que o escopo §11/§12/§28 exige.
--
-- `usuario_id` sozinho não respondia às perguntas que uma auditoria precisa
-- responder: com QUE permissões a pessoa estava, por QUAL canal falou, se o
-- modo de escrita estava ligado naquele instante e por que a interação parou.
-- Sem esses campos, um incidente vira arqueologia; com eles, vira consulta.
--
-- `trace_id` é o fio que costura tudo. Uma interação toca modelo, ferramentas
-- e (na Fase 3) ações pendentes e mutações. Sem um identificador propagado,
-- não há como reconstruir a sequência — só listas paralelas que ninguém
-- consegue casar depois.
alter table public.assessor_auditoria
  add column if not exists trace_id uuid,
  -- O ator INTEIRO, congelado no momento da interação. Guardar só o id seria
  -- perder a informação que mais importa num incidente: as permissões que a
  -- pessoa tinha naquela hora, que podem já ter mudado quando alguém for olhar.
  add column if not exists ator jsonb,
  add column if not exists canal text check (canal in ('erp', 'whatsapp', 'api')),
  add column if not exists versao_do_prompt text,
  -- A trava da Fase 1 no instante da execução. Se um dia alguém ligar a
  -- escrita, esta coluna é a prova de o que estava valendo em cada linha.
  add column if not exists escrita_liberada boolean,
  add column if not exists parou_por text;

create index if not exists assessor_auditoria_trace on public.assessor_auditoria (trace_id);
create index if not exists assessor_auditoria_canal on public.assessor_auditoria (canal, criada_em desc);

comment on column public.assessor_auditoria.trace_id is
  'Identificador da interação inteira, propagado a ferramentas, ações e mutações.';
comment on column public.assessor_auditoria.parou_por is
  'concluiu | rodadas | tool_calls | duracao | tokens | cancelado. Resposta truncada nunca se passa por completa.';

-- ── Mutações (§12) ────────────────────────────────────────────────────────
--
-- Tabela criada agora, vazia, e é de propósito. A Fase 1 não grava nada, mas o
-- desenho da auditoria de mutação precisa existir ANTES da primeira escrita —
-- caso contrário a primeira escrita acontece sem lugar para ser registrada, que
-- é exatamente a ordem errada de fazer as coisas num sistema financeiro.
create table if not exists public.gerente_mutacoes (
  id bigserial primary key,
  trace_id uuid not null,
  conversa_id uuid references public.assessor_conversas(id) on delete set null,
  ator jsonb not null,
  canal text not null check (canal in ('erp', 'whatsapp', 'api')),
  ferramenta text not null,
  versao_da_ferramenta text not null,
  risco text not null check (risco in ('A', 'B', 'C', 'D')),
  registro_afetado text,
  valor_anterior jsonb,
  valor_novo jsonb,
  -- Qual confirmação sustentou a gravação. 'autonomia' é regra aprovada antes;
  -- nunca pode ficar nulo, porque "não sei como isso foi autorizado" é a pior
  -- resposta possível numa auditoria.
  confirmacao text not null check (confirmacao in ('explicita', 'reforcada', 'autonomia')),
  regra_usada text,
  confianca numeric(5,2),
  idempotency_key text not null,
  resultado text not null check (resultado in ('sucesso', 'erro', 'parcial')),
  erro text,
  reversivel boolean not null default false,
  undo_id text,
  criada_em timestamptz not null default now(),
  -- A mesma chave não grava duas vezes. É a trava de idempotência do §10, e ela
  -- vive no BANCO porque retry de rede não passa pela aplicação duas vezes de
  -- forma coordenada — passa duas vezes e pronto.
  unique (idempotency_key)
);

create index if not exists gerente_mutacoes_trace on public.gerente_mutacoes (trace_id);
create index if not exists gerente_mutacoes_recentes on public.gerente_mutacoes (criada_em desc);

alter table public.gerente_mutacoes enable row level security;

comment on table public.gerente_mutacoes is
  'Toda alteração feita pelo Gerente IA. Rollback gera NOVA linha; histórico nunca é apagado.';

-- ── Ações pendentes (§9 e §25) ────────────────────────────────────────────
create table if not exists public.gerente_acoes_pendentes (
  id uuid primary key default gen_random_uuid(),
  trace_id uuid not null,
  conversa_id uuid references public.assessor_conversas(id) on delete cascade,
  ator jsonb not null,
  canal text not null check (canal in ('erp', 'whatsapp', 'api')),
  ferramenta text not null,
  versao_da_ferramenta text not null,
  parametros jsonb not null,
  risco text not null check (risco in ('A', 'B', 'C', 'D')),
  -- Hash dos parâmetros previsualizados. Confirmar não pode aprovar uma coisa
  -- e executar outra: entre a prévia e o clique, alguém pode ter trocado os
  -- registros por baixo do "sim".
  assinatura text not null,
  previa jsonb,
  criada_em timestamptz not null default now(),
  -- Confirmação tem prazo porque o estado do ERP anda entre a prévia e o
  -- clique. Aprovar sobre prévia velha é aprovar outra coisa.
  valida_ate timestamptz not null,
  confirmada_em timestamptz,
  cancelada_em timestamptz,
  executada_em timestamptz
);

create index if not exists gerente_acoes_abertas
  on public.gerente_acoes_pendentes (valida_ate)
  where confirmada_em is null and cancelada_em is null;

alter table public.gerente_acoes_pendentes enable row level security;

comment on table public.gerente_acoes_pendentes is
  'Ações de escrita aguardando confirmação. Expiram por tempo; a assinatura amarra o sim aos parâmetros exatos.';
