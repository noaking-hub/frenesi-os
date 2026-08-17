-- Existiam DUAS definições de "base sob controle", e elas discordavam em 59.
--
--   view     bases_sob_controle  = select distinct base_id from movimentacoes  → 78
--   função   base_sob_controle() = exists (select 1 from lotes ...)            → 19
--
-- A view é quem o app lê para decidir se uma base tem carga; a função é quem
-- reserva e baixa estoque. Com as duas discordando, 59 bases eram declaradas
-- controladas sem ter um único lote comprado.
--
-- O que as colocou lá: 125 linhas de `reserva` com `volume_ml = 0`, resíduo da
-- versão antiga de `reservar_pedido`. Uma linha de volume zero bastava.
--
-- A cadeia até o estrago: `temCarga()` devolve true → `disponivelMl` é 0 →
-- a sincronia decide `acao = 'esgotar'` → e `esgotar` NÃO é pulado, então
-- grava zero na Shopify. A proteção `sem_carga`, escrita exatamente para isso
-- ("Gravar zero aí tiraria o produto do ar"), ficava desarmada.
--
-- Medido: 257 variantes de 53 perfumes ATIVOS iriam a zero na primeira
-- sincronia — Sauvage, Bleu de Chanel, Good Girl, Acqua di Giò entre eles.
--
-- A definição correta é a do LOTE, e não por elegância: é a regra do dono da
-- operação, dita com todas as letras — "não contabilizar nenhum tipo de
-- estoque de produto que não tenha compra de frasco/lote cadastrada".
create or replace view public.bases_sob_controle as
  select distinct base_id from lotes;

comment on view public.bases_sob_controle is
  'Bases com LOTE comprado — a mesma regra da função base_sob_controle(text). '
  'Movimentação não serve de critério: reserva de volume zero criava base '
  'controlada sem carga, e a sincronia zerava o produto na loja.';
