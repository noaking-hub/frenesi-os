-- Onde a varredura do cashback parou.
--
-- A varredura lia o cadastro de clientes por páginas e guardava a página atual
-- numa VARIÁVEL — que morre junto com a execução. Como a Netlify encerra a
-- função em ~26s e a rotina pedia 200s, ela era cortada no meio de toda
-- madrugada, e a rodada seguinte recomeçava da página 1. O efeito: as
-- primeiras páginas eram relidas todo dia e a cauda NUNCA era alcançada.
--
-- Medido antes do conserto: 356 carteiras (24% do cadastro) com leitura de
-- 12/08, cinco dias velhas, enquanto a tela somava R$ 7.208,02 misturando essa
-- safra com a de hoje e dizia "atualizado 17/08" — porque a data exibida era a
-- da carteira MAIS NOVA. A mais nova sempre existe; ela avaliza o resto.
--
-- Com o marcador em tabela, cada rodada continua de onde a anterior parou e a
-- passada fecha em algumas horas, não em nenhuma.
create table if not exists public.cashback_varredura (
  id boolean primary key default true check (id),
  -- A próxima página a ler. 1 significa "começar uma passada nova".
  proxima_pagina integer not null default 1,
  -- Quando a passada atual começou e quando a última terminou por inteiro.
  passada_iniciada_em timestamptz,
  passada_concluida_em timestamptz,
  -- O que a última rodada fez, para a falha deixar de ser muda.
  rodada_em timestamptz,
  rodada_lidos integer not null default 0,
  rodada_erro text,
  total_paginas integer
);

insert into public.cashback_varredura (id) values (true) on conflict (id) do nothing;

alter table public.cashback_varredura enable row level security;
revoke all on public.cashback_varredura from anon, authenticated;

comment on table public.cashback_varredura is
  'Marcador da varredura de carteiras da Yampi. Existe porque a página atual morava numa variável de execução, e a função é encerrada antes do fim da varredura.';
