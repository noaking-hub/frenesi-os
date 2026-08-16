-- Memória do Gerente — §9 e §9.1.
--
-- O escopo separa quatro camadas de contexto, e a quarta é a que dá o desenho
-- desta tabela: DADOS DO NEGÓCIO NUNCA SÃO MEMORIZADOS. Saldo, estoque, preço e
-- pedido são consultados em tempo de resposta, sempre. Memória que guarda saldo
-- vira saldo velho apresentado como atual — e num ERP financeiro isso é pior
-- que não lembrar de nada.
--
-- O que mora aqui são só as duas camadas persistentes: PREFERÊNCIA (como o
-- usuário quer ver) e DECISÃO (o que ele já resolveu e não quer rediscutir).
create table if not exists public.gerente_memorias (
  id uuid primary key default gen_random_uuid(),
  usuario_id text,
  tipo text not null check (tipo in ('preferencia', 'decisao')),
  -- Chave estável para a mesma preferência ser SUBSTITUÍDA e não acumulada.
  -- Sem ela, "prefiro ver em 30 dias" dito três vezes viraria três memórias
  -- concorrentes, e o Gerente teria que escolher uma sem critério.
  chave text not null,
  valor text not null,
  -- De onde veio: o usuário pediu, ou o Gerente propôs e ele aprovou.
  origem text not null default 'usuario' check (origem in ('usuario', 'aprovada')),
  trace_id uuid,
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now(),
  -- Apagar de verdade, e não esconder: §9.1 dá ao usuário o direito de remover
  -- a memória, e uma remoção que só marca uma coluna não é remoção.
  unique (usuario_id, chave)
);

create index if not exists gerente_memorias_do_usuario
  on public.gerente_memorias (usuario_id, tipo, atualizada_em desc);

alter table public.gerente_memorias enable row level security;

comment on table public.gerente_memorias is
  'Preferências e decisões aprovadas. NUNCA dados do negócio: esses são consultados em tempo de resposta.';
