-- MEU ASSESSOR — conversa, resposta e trilha.
--
-- Três tabelas, e a terceira é a que dá licença para as outras duas
-- existirem: sem auditoria por interação, um assistente que lê o financeiro
-- inteiro é um risco sem contrapartida. A seção 11 do escopo é explícita, e o
-- que está aqui é o mínimo dela.
--
-- O que NÃO está aqui, de propósito: nada de dado de negócio copiado. A
-- conversa guarda a pergunta, a resposta e quais ferramentas rodaram; os
-- números vêm do ERP em tempo de resposta, sempre. Memória que guarda saldo
-- vira saldo velho apresentado como atual.

create table if not exists assessor_conversas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references auth.users(id),
  titulo text not null default 'Nova conversa',
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now(),
  arquivada_em timestamptz
);

create index if not exists assessor_conversas_recentes
  on assessor_conversas (usuario_id, atualizada_em desc);

create table if not exists assessor_mensagens (
  id bigserial primary key,
  conversa_id uuid not null references assessor_conversas(id) on delete cascade,
  papel text not null check (papel in ('usuario', 'assessor')),
  texto text not null,
  -- As ferramentas que sustentaram ESTA resposta, com parâmetros e tempo.
  -- É o "Como cheguei nisso" da seção 6, e o que permite refazer a conta.
  ferramentas jsonb not null default '[]'::jsonb,
  criada_em timestamptz not null default now()
);

create index if not exists assessor_mensagens_da_conversa
  on assessor_mensagens (conversa_id, id);

create table if not exists assessor_auditoria (
  id bigserial primary key,
  conversa_id uuid references assessor_conversas(id) on delete set null,
  usuario_id uuid references auth.users(id),
  pergunta text,
  resposta text,
  ferramentas jsonb not null default '[]'::jsonb,
  modelo text,
  -- Tokens e milissegundos: sem isso não há como saber quanto o assistente
  -- custa por mês, e um custo que ninguém mede é um custo que só aparece na
  -- fatura.
  tokens_entrada integer,
  tokens_saida integer,
  duracao_ms integer,
  erro text,
  criada_em timestamptz not null default now()
);

create index if not exists assessor_auditoria_recente on assessor_auditoria (criada_em desc);

alter table assessor_conversas enable row level security;
alter table assessor_mensagens enable row level security;
alter table assessor_auditoria enable row level security;

-- Sem política de acesso público: tudo passa pelo servidor do ERP, que já
-- autentica a sessão. A RLS aqui é a tranca de reserva, não a principal.
