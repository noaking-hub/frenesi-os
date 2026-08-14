-- A batida do pulso era recusada em silêncio: o CHECK de origem só conhecia
-- shopify e yampi. O pulso é a terceira fonte de sincronia — e é justamente
-- o registro que torna a rotina auditável.
alter table sincronizacoes drop constraint sincronizacoes_origem_check;
alter table sincronizacoes add constraint sincronizacoes_origem_check
  check (origem in ('shopify', 'yampi', 'pulso'));
