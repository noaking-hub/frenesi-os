-- ═══════════════════════════════════════════════════════════════════════════
-- Entrega REAL e entrega PREVISTA são fatos diferentes — e estavam na mesma
-- coluna.
--
-- O `date_delivery` da Yampi é a data PROMETIDA no checkout, não a entrega
-- realizada. A importação o gravava em `entregue_em`, e o ERP inteiro passou
-- a afirmar entregas que ainda não tinham acontecido (pedido entregue dia 12
-- constava como dia 19 — a promessa). A previsão ganha coluna própria; a
-- `entregue_em` volta a ser exclusiva do fato: escaneamento de entrega da
-- transportadora, confirmação da Shopify ou entrega em mãos confirmada.
-- ═══════════════════════════════════════════════════════════════════════════

alter table pedidos add column if not exists entrega_prevista_em timestamptz;

comment on column pedidos.entrega_prevista_em is
  'Data de entrega PROMETIDA no checkout (date_delivery da Yampi). Nunca é a entrega realizada.';
comment on column pedidos.entregue_em is
  'Entrega REALIZADA: escaneamento da transportadora, confirmação da Shopify ou entrega em mãos. Nunca previsão.';

-- Reparo do que a importação poluiu: em pedido de transportadora, o valor
-- gravado era a promessa da Yampi. Onde a transportadora registrou a entrega,
-- vale o escaneamento; onde não há evento, a data volta a ser desconhecida —
-- "não sei" é resposta melhor que uma data que não aconteceu. A varredura de
-- rastreio repõe as datas reais aos poucos. Entrega local fica de fora: lá a
-- data veio de confirmação (RPC ou Shopify), que é fato.
update pedidos p
   set entregue_em = ev.quando
  from (
    select pedido_id, max(quando) as quando
      from rastreio_eventos
     where entregue
     group by pedido_id
  ) ev
 where ev.pedido_id = p.id
   and not p.entrega_local
   and p.entregue_em is not null;

update pedidos p
   set entregue_em = null
 where not p.entrega_local
   and p.entregue_em is not null
   and not exists (
     select 1 from rastreio_eventos ev where ev.pedido_id = p.id and ev.entregue
   );
