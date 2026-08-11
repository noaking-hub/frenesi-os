-- ═══════════════════════════════════════════════════════════════════════════
-- O pedido de relatório sobrevive ao F5.
--
-- O estado "pedi um relatório e estou esperando" morava na memória da tela.
-- Recarregar a página perdia a lista de arquivos que existiam antes do
-- pedido, e o clique seguinte pedia OUTRO relatório — a conta enchia de
-- arquivos idênticos e a espera recomeçava do zero. Foi exatamente o que
-- aconteceu quando o Mercado Pago demorou mais de seis minutos.
--
-- Uma linha só (chave booleana com CHECK): só existe um pedido pendente por
-- vez, e é assim que a tela, o F5 e a rotina de hora em hora enxergam o MESMO
-- pedido em vez de cada um abrir o seu.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists mp_pedido_relatorio (
  id          boolean primary key default true check (id),
  pedido_em   timestamptz not null default now(),
  /** Arquivos que já existiam no instante do pedido. O relatório novo é o que
      não está nesta lista — comparação por nome, sem depender de relógio. */
  ja_existiam text[] not null default '{}'
);

comment on table mp_pedido_relatorio is
  'O pedido de relatório em andamento no Mercado Pago. Uma linha só: tela, F5 e rotina esperam o mesmo pedido.';
