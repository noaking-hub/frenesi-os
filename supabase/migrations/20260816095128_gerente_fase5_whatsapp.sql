-- WhatsApp — §24 e §25 do escopo.
--
-- A regra que desenha estas duas tabelas está no escopo em uma frase: "nunca
-- confiar apenas no número de telefone; resolver identidade autorizada e
-- sessão". Número é identificador FRACO — chip clonado, aparelho emprestado,
-- número reciclado pela operadora. Por isso a autorização é uma lista explícita
-- que alguém preencheu, e não uma dedução a partir de quem mandou mensagem.
create table if not exists public.gerente_whatsapp_autorizados (
  telefone text primary key,
  usuario_id text,
  nome text not null,
  perfil text not null default 'operador',
  -- As permissões que ESTE canal concede, que podem ser menores que as do
  -- mesmo usuário no ERP. Ler o caixa pelo celular no ônibus é uma coisa;
  -- aprovar classificação em massa é outra.
  permissoes text[] not null default array['gerente.ler'],
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  ultimo_contato_em timestamptz
);

alter table public.gerente_whatsapp_autorizados enable row level security;

comment on table public.gerente_whatsapp_autorizados is
  'Quem pode falar com o Gerente pelo WhatsApp. Número não autorizado recebe recusa e não chega ao motor.';

-- Idempotência do canal — §25.
--
-- O WhatsApp reentrega mensagem quando não recebe o 200 a tempo, e o usuário
-- reenvia quando acha que não foi. As duas coisas produzem a MESMA mensagem
-- duas vezes; sem esta tabela, "crie a solicitação de compra" viraria duas
-- solicitações.
create table if not exists public.gerente_whatsapp_mensagens (
  id text primary key,
  telefone text not null,
  texto text,
  recebida_em timestamptz not null default now(),
  respondida_em timestamptz,
  trace_id uuid,
  resposta text,
  erro text
);

create index if not exists gerente_whatsapp_recentes
  on public.gerente_whatsapp_mensagens (telefone, recebida_em desc);

alter table public.gerente_whatsapp_mensagens enable row level security;
