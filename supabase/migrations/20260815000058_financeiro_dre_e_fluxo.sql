-- MÓDULO FINANCEIRO · Fase 2 e 3 — os dois regimes, cada um no seu lugar.
--
-- CAIXA responde "quanto tenho e quanto vou ter". COMPETÊNCIA responde "quanto
-- realmente ganhei". Misturar os dois é o defeito que este módulo existe para
-- eliminar: o crédito do gateway que chega dia 20 é caixa de dia 20 e receita
-- da data da venda; a compra do frasco é caixa hoje e CMV só quando o decant
-- é vendido.

-- ── Saldo por conta, com a qualidade do dado junto ─────────────────────────
--
-- Quatro números diferentes convivem numa conta, e chamá-los todos de "saldo"
-- é o que faz a tela mentir:
--   disponível  — o que dá para gastar agora
--   a liquidar  — vendas capturadas que o gateway ainda não soltou
--   bloqueado   — o que a instituição reteve
--   calculado   — o que os movimentos do ERP dizem que deveria haver
create or replace view saldos_das_contas as
select
  c.id,
  c.nome,
  c.tipo,
  c.banco,
  c.uso,
  c.finalidade,
  c.principal,
  c.ativa,
  c.origem_saldo,
  c.sincronizado_em,
  c.sincronizacao_status,
  c.cor,
  coalesce(c.saldo_informado, 0)::numeric(12,2) as saldo_informado,
  coalesce(c.saldo_a_liberar, 0)::numeric(12,2) as saldo_a_liquidar,
  coalesce(c.saldo_bloqueado, 0)::numeric(12,2) as saldo_bloqueado,
  -- O calculado sai das baixas: entrada soma, saída subtrai. Só conta o que
  -- foi BAIXADO — compromisso em aberto é projeção, não saldo.
  coalesce((
    select sum(case when l.tipo = 'entrada' then l.recebido else -l.recebido end)
      from lancamentos l
     where l.conta_id = c.id and l.baixado_em is not null and l.cancelado_em is null
  ), 0)::numeric(12,2) as saldo_calculado,
  -- O disponível é o informado quando existe (API ou digitado), e o calculado
  -- quando não existe. A coluna `origem_saldo` diz qual dos dois é.
  coalesce(c.saldo_informado, (
    select sum(case when l.tipo = 'entrada' then l.recebido else -l.recebido end)
      from lancamentos l
     where l.conta_id = c.id and l.baixado_em is not null and l.cancelado_em is null
  ), 0)::numeric(12,2) as saldo_disponivel,
  coalesce((
    select sum(l.recebido) from lancamentos l
     where l.conta_id = c.id and l.tipo = 'entrada'
       and l.baixado_em >= current_date - 30 and l.cancelado_em is null
  ), 0)::numeric(12,2) as entradas_30d,
  coalesce((
    select sum(l.recebido) from lancamentos l
     where l.conta_id = c.id and l.tipo = 'saida'
       and l.baixado_em >= current_date - 30 and l.cancelado_em is null
  ), 0)::numeric(12,2) as saidas_30d
from contas_bancarias c;

comment on view saldos_das_contas is
  'Disponível, a liquidar, bloqueado e calculado — nunca um "saldo" sem origem';

-- ── Receita gerencial por competência ──────────────────────────────────────
--
-- Vem do PEDIDO pago, não do crédito do gateway. É o ponto onde a duplicidade
-- nascia: a venda entrava como receita e o repasse entrava de novo quando o
-- dinheiro caía. O repasse é caixa; a venda é resultado.
create or replace view receita_por_competencia as
select
  to_char(p.comprado_em, 'YYYY-MM') as competencia,
  count(*) as pedidos,
  sum(p.valor)::numeric(12,2) as receita_bruta,
  sum(p.frete)::numeric(12,2) as frete_cobrado,
  sum(p.cashback)::numeric(12,2) as descontos,
  -- Taxa REAL do gateway quando conhecida; sem ela o valor fica zero e a tela
  -- mostra a lacuna em vez de estimar em silêncio.
  coalesce(sum(r.taxa_real), 0)::numeric(12,2) as taxas_pagamento
from pedidos p
left join repasses r on r.pedido_id = p.id
where p.pagamento = 'pago' and p.situacao <> 'cancelado'
group by 1;

-- ── CMV: o custo que ACOMPANHA a venda ─────────────────────────────────────
--
-- Sai do estoque, não da compra. Comprar 200 ml de perfume é caixa no dia da
-- compra e vira custo aos poucos, conforme os decants saem — é exatamente a
-- separação que o escopo chama de "ponto crítico de estoque".
create or replace view cmv_por_competencia as
with liquido as (
  select to_char(m.ocorrida_em, 'YYYY-MM') as competencia,
         sum(abs(m.volume_ml) * b.custo_por_ml) as custo_perfume
    from movimentacoes m
    join perfumes_base b on b.id = m.base_id
   where m.tipo in ('saida', 'perda')
   group by 1
),
insumo as (
  select to_char(i.ocorrida_em, 'YYYY-MM') as competencia,
         sum(abs(i.unidades) * coalesce(i.custo_unitario, 0)) as custo_insumo
    from insumo_movimentacoes i
   where i.tipo = 'saida'
   group by 1
)
select
  coalesce(l.competencia, i.competencia) as competencia,
  coalesce(l.custo_perfume, 0)::numeric(12,2) as custo_perfume,
  coalesce(i.custo_insumo, 0)::numeric(12,2) as custo_insumo,
  (coalesce(l.custo_perfume, 0) + coalesce(i.custo_insumo, 0))::numeric(12,2) as cmv
from liquido l
full outer join insumo i on i.competencia = l.competencia;

-- ── Lançamentos agrupados por natureza, na competência ─────────────────────
create or replace view lancamentos_por_natureza as
select
  to_char(l.competencia, 'YYYY-MM') as competencia,
  c.natureza_gerencial,
  sum(case when l.tipo = 'saida' then l.valor else -l.valor end)::numeric(12,2) as valor,
  count(*) as quantidade
from lancamentos l
join categorias_financeiras c on c.id = l.categoria_id
where l.cancelado_em is null
  -- Transferência e aporte movem caixa sem passar pelo resultado. Deixá-los
  -- entrar aqui inflaria despesa e receita no mesmo mês.
  and c.impacta_dre
group by 1, 2;

-- ── DRE gerencial ──────────────────────────────────────────────────────────
--
-- Uma função, não uma view: a DRE precisa responder por competência escolhida
-- e comparar com o mês anterior, e isso é argumento, não filtro de leitura.
create or replace function dre_gerencial(p_competencia text)
returns table (
  linha text,
  ordem int,
  valor numeric,
  destaque boolean
)
language sql
stable
as $$
  with r as (
    select coalesce(receita_bruta, 0) as receita_bruta,
           coalesce(descontos, 0) as descontos,
           coalesce(taxas_pagamento, 0) as taxas
      from receita_por_competencia where competencia = p_competencia
  ),
  base as (
    select
      coalesce((select receita_bruta from r), 0) as receita_bruta,
      coalesce((select descontos from r), 0) as descontos,
      coalesce((select taxas from r), 0) as taxas,
      coalesce((select cmv from cmv_por_competencia where competencia = p_competencia), 0) as cmv,
      coalesce((select valor from lancamentos_por_natureza
                 where competencia = p_competencia and natureza_gerencial = 'deducao_receita'), 0) as tributos,
      coalesce((select valor from lancamentos_por_natureza
                 where competencia = p_competencia and natureza_gerencial = 'despesa_fixa'), 0) as desp_fixa,
      coalesce((select valor from lancamentos_por_natureza
                 where competencia = p_competencia and natureza_gerencial = 'despesa_comercial'), 0) as desp_comercial,
      coalesce((select valor from lancamentos_por_natureza
                 where competencia = p_competencia and natureza_gerencial = 'despesa_administrativa'), 0) as desp_admin,
      coalesce((select valor from lancamentos_por_natureza
                 where competencia = p_competencia and natureza_gerencial = 'despesa_financeira'), 0) as desp_financeira
  ),
  calc as (
    select *,
      receita_bruta - descontos - tributos as receita_liquida,
      cmv + taxas as custos_variaveis
    from base
  )
  select * from (values
    ('Receita bruta', 1, (select receita_bruta from calc), false),
    ('(-) Descontos e devoluções', 2, -(select descontos from calc), false),
    ('(-) Tributos sobre vendas', 3, -(select tributos from calc), false),
    ('= Receita líquida', 4, (select receita_liquida from calc), true),
    ('(-) CMV', 5, -(select cmv from calc), false),
    ('(-) Taxas de pagamento', 6, -(select taxas from calc), false),
    ('= Margem de contribuição', 7,
      (select receita_liquida - custos_variaveis from calc), true),
    ('(-) Despesas fixas', 8, -(select desp_fixa from calc), false),
    ('(-) Despesas comerciais', 9, -(select desp_comercial from calc), false),
    ('(-) Despesas administrativas', 10, -(select desp_admin from calc), false),
    ('(+/-) Resultado financeiro', 11, -(select desp_financeira from calc), false),
    ('= Resultado gerencial', 12,
      (select receita_liquida - custos_variaveis - desp_fixa - desp_comercial
              - desp_admin - desp_financeira from calc), true)
  ) as t(linha, ordem, valor, destaque)
  order by ordem
$$;

comment on function dre_gerencial is
  'Resultado por COMPETÊNCIA: receita da venda, custo do consumo, nunca do caixa';

-- ── Fluxo de caixa: realizado e projetado, dia a dia ───────────────────────
create or replace function fluxo_de_caixa(p_de date, p_ate date)
returns table (
  dia date,
  entradas numeric,
  saidas numeric,
  realizado boolean
)
language sql
stable
as $$
  with dias as (
    select generate_series(p_de, p_ate, '1 day'::interval)::date as dia
  )
  select
    d.dia,
    coalesce((
      select sum(case when l.baixado_em is not null then l.recebido else l.valor - l.recebido end)
        from lancamentos l
        join categorias_financeiras c on c.id = l.categoria_id
       where l.tipo = 'entrada' and l.cancelado_em is null and c.impacta_caixa
         and coalesce(l.baixado_em, l.vence_em) = d.dia
    ), 0)::numeric(12,2) as entradas,
    coalesce((
      select sum(case when l.baixado_em is not null then l.recebido else l.valor - l.recebido end)
        from lancamentos l
        join categorias_financeiras c on c.id = l.categoria_id
       where l.tipo = 'saida' and l.cancelado_em is null and c.impacta_caixa
         and coalesce(l.baixado_em, l.vence_em) = d.dia
    ), 0)::numeric(12,2) as saidas,
    d.dia <= current_date as realizado
  from dias d
  order by d.dia
$$;

comment on function fluxo_de_caixa is
  'Por dia: o que já entrou/saiu até hoje, o que está previsto depois';
