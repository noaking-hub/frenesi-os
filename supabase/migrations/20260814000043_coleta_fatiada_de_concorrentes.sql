-- A coleta de concorrentes não cabe numa execução: a Netlify corta a função
-- em ~26 s e uma loja Nuvemshop leva minutos para ser lida página a página.
-- A passada agora avança em FATIAS — o cursor fica na própria fonte e as
-- observações acumulam numa tabela de passagem. Só quando a passada fecha é
-- que elas substituem os preços valendo: uma passada cortada no meio nunca
-- deixa a comparação de mercado pela metade.

alter table concorrentes
  add column if not exists coleta_indice integer,
  add column if not exists coleta_iniciada_em timestamptz,
  add column if not exists coleta_observados integer not null default 0;

create table if not exists concorrente_precos_coleta (
  concorrente_id text not null references concorrentes (id) on delete cascade,
  chave text not null,
  base_id text,
  casado_por text check (casado_por in ('apelido', 'titulo')),
  variante smallint,
  titulo text not null,
  preco numeric not null,
  url text,
  lido_em timestamptz not null default now(),
  primary key (concorrente_id, chave)
);

alter table concorrente_precos_coleta enable row level security;

-- O job diário único era cortado antes de terminar a primeira loja. Em vez de
-- uma chamada de minutos, fatias de ~14 s de 5 em 5 minutos numa janela da
-- manhã (6h–8h55 em SP): cada chamada avança a fonte em andamento — ou a de
-- leitura mais velha — e a passada fecha ao longo da janela.
select cron.alter_job(jobid, schedule => '*/5 9-11 * * *')
  from cron.job
  where jobname = 'coletar-concorrentes';
