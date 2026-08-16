-- A vigília do Gerente também registra rodada, e o CHECK precisa saber.
--
-- Ampliar a restrição ANTES de a rotina existir, e não depois de descobrir o
-- insert falhando calado — que foi exatamente o erro cometido com a Pagaleve.
alter table public.sincronizacoes drop constraint if exists sincronizacoes_origem_check;

alter table public.sincronizacoes
  add constraint sincronizacoes_origem_check
  check (origem = any (array['shopify', 'yampi', 'pulso', 'pagaleve', 'mercadopago', 'gerente']));
