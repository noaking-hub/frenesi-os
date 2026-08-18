-- O diário de bordo das rotinas automáticas.
--
-- A varredura de rastreio do Melhor Envio respondeu erro 422 em TODA rodada
-- durante semanas e ninguém soube: o relatório de cada rodada só existia como
-- resposta HTTP, que o pg_net descarta em horas. Rotina que falha em silêncio
-- é pior que rotina desligada — desligada ao menos não passa a impressão de
-- que está cobrindo o assunto.
--
-- Cada rodada grava aqui um resumo compacto: nome, duração e os erros
-- extraídos do relatório (campo `erro` em qualquer nível). A vigília do
-- Gerente lê as últimas rodadas e abre alerta quando o MESMO ponto falha em
-- rodadas seguidas — uma falha isolada é a internet piscando; três seguidas é
-- integração quebrada.
create table if not exists rotinas_saude (
  id bigint generated always as identity primary key,
  rotina text not null,
  rodada_em timestamptz not null default now(),
  duracao_ms integer,
  -- [{ onde: 'rastreioMelhorEnvio', erro: '...' }]
  erros jsonb not null default '[]'::jsonb
);

create index if not exists rotinas_saude_rotina_rodada
  on rotinas_saude (rotina, rodada_em desc);

-- Só o servidor escreve e lê; sem policies, anon e authenticated não enxergam.
alter table rotinas_saude enable row level security;
