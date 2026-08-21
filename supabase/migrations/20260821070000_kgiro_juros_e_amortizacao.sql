-- ═══════════════════════════════════════════════════════════════════════════
-- KGIRO FAMPE: só os juros são despesa, e faltava/sobrava parcela.
--
-- Dados do contrato (app do Sicredi, título C517206125): liberado em
-- 20/03/2025, 1,89% a.m., 36 parcelas, 17 pagas (R$ 16.420,13), próximo
-- vencimento 16/09/2026.
--
-- ── O "valor liberado" da tela não é o dinheiro que entrou ─────────────────
--
-- A tela mostra R$ 34.772,04 como valor liberado, e 965,89 × 36 = 34.772,04
-- EXATO. É o total do título, não o crédito na conta — a conferência fecha até
-- o centavo duas vezes: 965,89 × 17 = 16.420,13, o "valor pago" da mesma tela.
-- Descontadas as 36 parcelas a 1,89% a.m., o principal financiado foi de
-- ~R$ 25.060 e os juros do contrato, ~R$ 9.712.
--
-- Isto é DERIVADO da taxa e do número de parcelas, não lido de uma tabela de
-- amortização. O rateio mês a mês pode divergir em centavos do que o Sicredi
-- calcula; o "Ver Histórico de Crédito" do app tem o PDF que fecha a questão.
-- O que não muda com ele é a ordem de grandeza nem a estrutura.
--
-- ── Por que dividir cada parcela em duas linhas ────────────────────────────
--
-- Parcela de empréstimo não é despesa. Só o JURO é: o resto é devolver
-- dinheiro que entrou, movimento de dívida, não custo de operar. Com os
-- R$ 965,89 cheios na DRE, agosto/2026 a março/2028 aparecem com R$ 15.962,61
-- de despesa que nunca existiu — 5,2 vezes o custo real de R$ 3.055,19 em
-- juros no mesmo período.
--
-- Duas linhas somando 965,89 mantêm o CAIXA idêntico (a projeção continua
-- vendo a saída cheia no dia 16) e separam o que a DRE deve enxergar:
--   · "Juros de empréstimo"       — despesa financeira, entra na DRE
--   · "Amortização de empréstimo" — impacta_dre = false, some do resultado
--
-- `impacta_dre` já é respeitado pela DRE e pelos relatórios; não é flag nova
-- nem regra escrita aqui.
--
-- ── A parcela 37 que não existe ────────────────────────────────────────────
--
-- O ERP tinha 20 parcelas em aberto, de 16/09/2026 a 16/04/2028. O contrato
-- tem 36 no total e 17 pagas: restam 19, terminando em 16/03/2028. A de
-- 16/04/2028 (LC-00041) nunca vai ser cobrada e some aqui.
--
-- A de 16/08/2026 (a 17ª, já paga) é dividida também: as duas metades nascem
-- baixadas na mesma data e na mesma conta, então o saldo não se mexe em um
-- centavo — o que muda é a competência de agosto parar de carregar R$ 664,20
-- de despesa que era amortização.
-- ═══════════════════════════════════════════════════════════════════════════

insert into categorias_financeiras (
  id, nome, natureza, natureza_gerencial, conta_contabil, centro_custo,
  impacta_dre, impacta_caixa, exige_documento, usar_em_automacao, ativa
) values
  ('juros-de-emprestimo', 'Juros de empréstimo', 'Despesa fixa', 'despesa_financeira',
   '3.2.01.001 · juros e encargos de empréstimo', 'financeiro',
   true, true, false, true, true),
  -- `natureza` só aceita quatro valores (Receita, Custo variável, Despesa
  -- fixa, Despesa) — é o rótulo antigo, e quem classifica de verdade é
  -- `natureza_gerencial`. Amortização usa `aporte_retirada` lá porque é o
  -- único rótulo do enum que
  -- descreve dinheiro trocado com quem financia a empresa sem passar pelo
  -- resultado. Quem de fato a tira da DRE é `impacta_dre = false`.
  ('amortizacao-de-emprestimo', 'Amortização de empréstimo', 'Despesa', 'aporte_retirada',
   '2.1.02.001 · empréstimos e financiamentos', 'financeiro',
   false, true, false, true, true)
on conflict (id) do update
   set nome = excluded.nome,
       natureza = excluded.natureza,
       natureza_gerencial = excluded.natureza_gerencial,
       conta_contabil = excluded.conta_contabil,
       centro_custo = excluded.centro_custo,
       impacta_dre = excluded.impacta_dre,
       ativa = true;

-- ── A parcela 37, que o contrato não tem ───────────────────────────────────
delete from lancamentos where id = 'LC-00041';

-- ── Cada parcela vira juros + amortização ──────────────────────────────────
--
-- A tabela abaixo é o rateio derivado: `j` são os juros do mês sobre o saldo
-- devedor, `a` é o que sobra da parcela e abate a dívida. j + a = 965,89 em
-- todas as vinte linhas, e é por isso que o caixa não se mexe.
with plano (lanc, venc, baixa, conta, numero, j, a) as (values
  ('LC-00021','2026-08-16'::date,'2026-08-16'::date,'rafael-pf',17,301.69,664.20),
  ('LC-00022','2026-09-16'::date,null,'inter',18,289.14,676.75),
  ('LC-00023','2026-10-16'::date,null,'inter',19,276.35,689.54),
  ('LC-00024','2026-11-16'::date,null,'inter',20,263.32,702.57),
  ('LC-00025','2026-12-16'::date,null,'inter',21,250.04,715.85),
  ('LC-00026','2027-01-16'::date,null,'inter',22,236.51,729.38),
  ('LC-00027','2027-02-16'::date,null,'inter',23,222.72,743.17),
  ('LC-00028','2027-03-16'::date,null,'inter',24,208.68,757.21),
  ('LC-00029','2027-04-16'::date,null,'inter',25,194.37,771.52),
  ('LC-00030','2027-05-16'::date,null,'inter',26,179.79,786.10),
  ('LC-00031','2027-06-16'::date,null,'inter',27,164.93,800.96),
  ('LC-00032','2027-07-16'::date,null,'inter',28,149.79,816.10),
  ('LC-00033','2027-08-16'::date,null,'inter',29,134.37,831.52),
  ('LC-00034','2027-09-16'::date,null,'inter',30,118.65,847.24),
  ('LC-00035','2027-10-16'::date,null,'inter',31,102.64,863.25),
  ('LC-00036','2027-11-16'::date,null,'inter',32,86.32,879.57),
  ('LC-00037','2027-12-16'::date,null,'inter',33,69.70,896.19),
  ('LC-00038','2028-01-16'::date,null,'inter',34,52.76,913.13),
  ('LC-00039','2028-02-16'::date,null,'inter',35,35.50,930.39),
  ('LC-00040','2028-03-16'::date,null,'inter',36,17.92,947.97)
),
parte (sufixo, rotulo, cat, cid, quanto) as (values
  ('juros',     'juros',      'Juros de empréstimo',       'juros-de-emprestimo',       'j'),
  ('principal', 'amortização','Amortização de empréstimo', 'amortizacao-de-emprestimo', 'a')
)
insert into lancamentos (
  id, ocorrido_em, competencia, vence_em, baixado_em, descricao, favorecido,
  categoria, categoria_id, centro_custo, conta_id, tipo, valor, recebido,
  recorrente, origem, documento, criado_por
)
select p.lanc || '-' || t.sufixo,
       p.venc,
       date_trunc('month', p.venc)::date,
       p.venc,
       p.baixa,
       'Sicredi KGIRO FAMPE ' || p.numero || '/36 · ' || t.rotulo,
       'Sicredi',
       t.cat, t.cid, 'financeiro', p.conta, 'saida',
       case when t.quanto = 'j' then p.j else p.a end,
       case when p.baixa is null then 0
            else case when t.quanto = 'j' then p.j else p.a end end,
       false, 'Manual', 'C517206125', 'ajuste-emprestimo'
  from plano p cross join parte t;

-- As originais saem só depois das novas entrarem: numa transação só, e as
-- duas metades já gravadas, nenhum instante do banco tem a dívida a menos.
delete from lancamentos where id in (
  select 'LC-000' || lpad(n::text, 2, '0') from generate_series(21, 40) n
);
