-- ═══════════════════════════════════════════════════════════════════════════
-- DAE não é dedução de receita: é custo da mercadoria que entrou.
--
-- Quatro guias no mesmo dia (10/08), R$ 903,74 no total, estavam em "Imposto"
-- — categoria de DEDUÇÃO DE RECEITA, o lugar do tributo que incide sobre a
-- venda. O dono identificou: são DAE, Documento de Arrecadação Estadual.
--
-- ── Por que isso muda o lugar ──────────────────────────────────────────────
--
-- A operação é optante do Simples Nacional — paga DAS, e no DAS o ICMS da
-- VENDA já está dentro. Optante do Simples não emite DAE por venda. O que ele
-- recolhe em DAE é a antecipação/diferencial de alíquota da ENTRADA
-- interestadual: mercadoria comprada de fora do estado.
--
-- Imposto sobre a entrada compõe o CUSTO DE AQUISIÇÃO. Ele não reduz a
-- receita — encarece o produto. No lugar errado, a receita líquida aparece
-- R$ 903,74 menor do que é e o CMV aparece R$ 903,74 menor também: o
-- resultado final fecha igual, e todas as margens percentuais mentem.
--
-- O calendário reforça a leitura: as quatro guias caem em 10/08, na sequência
-- de um bloco de compras — R$ 2.680,00 em perfume base (31/07), R$ 440,00
-- (01/08) e R$ 900,00 (07/08). Quatro guias de valores diferentes no mesmo dia
-- é a forma de quem recolhe por nota de entrada, não por apuração de saída.
--
-- ── O que ficou como suposição ─────────────────────────────────────────────
--
-- Que o DAE é da entrada, e não da saída. Vem do regime (Simples) e do
-- calendário, não de uma guia lida. Se alguma dessas quatro for ICMS-ST de
-- saída, ela volta para "Imposto" — é um clique, e a diferença aparece na
-- receita líquida, não no resultado.
-- ═══════════════════════════════════════════════════════════════════════════

insert into categorias_financeiras (
  id, nome, natureza, natureza_gerencial, conta_contabil, centro_custo,
  impacta_dre, impacta_caixa, exige_documento, usar_em_automacao, ativa
) values (
  'imposto-sobre-compras', 'Imposto sobre compras', 'Custo variável', 'cmv',
  '3.1.01.005 · icms antecipado e difal sobre entradas', 'producao',
  true, true, false, true, true
)
on conflict (id) do update
   set nome = excluded.nome,
       natureza_gerencial = excluded.natureza_gerencial,
       conta_contabil = excluded.conta_contabil,
       centro_custo = excluded.centro_custo,
       ativa = true;

update lancamentos
   set categoria = 'Imposto sobre compras',
       categoria_id = 'imposto-sobre-compras',
       centro_custo = 'producao',
       descricao = 'DAE — Documento de Arrecadação Estadual',
       favorecido = 'Secretaria de Estado de Fazenda',
       atualizado_em = now()
 where categoria_id = 'imposto'
   and cancelado_em is null
   and ocorrido_em = date '2026-08-10';

-- O DAS segue onde está: aquele SIM incide sobre o faturamento, e dedução de
-- receita é exatamente o lugar dele.
