-- Tokens de integrações que usam OAuth.
--
-- Variável de ambiente não serve para o que o OAuth produz: o access token
-- vale horas e o refresh é rotacionado a cada renovação. Guardar em env
-- exigiria alguém editando o painel da Netlify de madrugada — e um deploy
-- para valer. O lugar disso é o banco.
--
-- Uma linha por integração. O segredo fica aqui e nunca chega ao navegador:
-- o ERP consulta sempre pelo servidor, com a service role.

create table if not exists integracao_tokens (
  chave text primary key,
  access_token text not null,
  refresh_token text,
  -- Quando o access token vence. O ERP renova ANTES, com folga.
  expira_em timestamptz,
  atualizado_em timestamptz not null default now()
);

comment on table integracao_tokens is 'Tokens OAuth das integrações (melhorenvio, …). Nunca sai do servidor.';

alter table integracao_tokens enable row level security;
