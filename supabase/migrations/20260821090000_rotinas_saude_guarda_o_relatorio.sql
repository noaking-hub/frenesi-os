-- ═══════════════════════════════════════════════════════════════════════════
-- A rodada passa a guardar O QUE FEZ, não só o que quebrou.
--
-- `rotinas_saude` gravava `erros` e `duracao_ms`. Tudo o que a rodada apurou —
-- quantas etiquetas do Melhor Envio foram examinadas, quantos pedidos casaram,
-- quais etapas foram cortadas por falta de tempo, quais pedidos estão faturados
-- sem rastreio — morria na resposta HTTP.
--
-- Isso custou caro numa apuração real: para descobrir por que sete pedidos
-- postados não fechavam, foi preciso raspar `net._http_response`, que o
-- Postgres guarda por poucas horas. A pergunta "isso vem acontecendo desde
-- quando?" não tinha como ser respondida, porque a única cópia do relatório
-- era volátil.
--
-- `jsonb` e não colunas: cada rotina relata coisas diferentes, e uma coluna
-- por contador viraria uma migração a cada campo novo. O relatório é o mesmo
-- objeto que a rotina já devolve — nada de novo para o chamador montar.
--
-- Sem retenção automática aqui: a tabela cresce uma linha por rodada e o
-- volume é pequeno. Se um dia incomodar, a limpeza é um `delete` por data, e
-- é melhor decidir isso com o tamanho na mão do que chutar um corte agora.
-- ═══════════════════════════════════════════════════════════════════════════

alter table rotinas_saude add column if not exists relatorio jsonb;

comment on column rotinas_saude.relatorio is
  'O relatório completo que a rodada devolveu — contadores, etapas puladas por tempo, listas de pendências. É o que permite responder "desde quando" sem depender do log volátil do Postgres.';
