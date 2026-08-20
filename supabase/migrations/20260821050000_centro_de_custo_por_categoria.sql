-- ═══════════════════════════════════════════════════════════════════════════
-- Frete não é tecnologia, e centro de custo em branco não é resposta.
--
-- Frenet e Melhor Envio são gateway de frete, e o dinheiro que passa por eles é
-- POSTAGEM POR PEDIDO — não assinatura de ferramenta. Eles já estavam na
-- categoria certa ("Frete", custo variável): o que faltava era o centro de
-- custo, nulo em 41 lançamentos de Frete, 20 de Motoboy e 8 de Embalagens. Sem
-- ele, "quanto custou a logística no mês" não tinha como ser respondido — e o
-- que estava em branco não era desacordo sobre onde classificar, era o campo
-- nunca ter sido preenchido.
--
-- Só entraria em Tecnologia a MENSALIDADE de plano de um desses gateways, se um
-- dia existir: aí é ferramenta, e o Favorecido continua sendo o mesmo nome. A
-- diferença não está em quem cobra, está no que a cobrança é.
--
-- O CENTRO PADRÃO DA CATEGORIA passa a existir de verdade. A coluna
-- `categorias_financeiras.centro_custo` já estava lá, preenchida em três
-- categorias e ignorada por todo mundo — o formulário não a lia. Agora ela é o
-- valor que o "Novo compromisso" carrega ao escolher a categoria, e por isso
-- vale preenchê-la em todas: o lançamento nasce no centro certo em vez de
-- depender de alguém lembrar.
--
-- Nada aqui toca em valor, data ou conta. Centro de custo e categoria mudam a
-- coluna em que o gasto aparece no relatório, não o caixa.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── O padrão de cada categoria ─────────────────────────────────────────────
update categorias_financeiras set centro_custo = 'logistica'
 where id in ('frete', 'motoboy', 'embalagens');

update categorias_financeiras set centro_custo = 'producao'
 where id in ('frascos-e-insumos', 'perfume-base');

update categorias_financeiras set centro_custo = 'tecnologia'
 where id in ('ferramentas-e-saas', 'inteligencia-artificial');

update categorias_financeiras set centro_custo = 'marketing'
 where id in ('trafego-pago', 'marketing-e-ads');

update categorias_financeiras set centro_custo = 'financeiro'
 where id in ('taxas-de-pagamento', 'imposto', 'financiamento');

update categorias_financeiras set centro_custo = 'administrativo'
 where id in ('administrativo', 'ocupacao', 'pro-labore');

-- ── O que já estava lançado sem centro ─────────────────────────────────────
--
-- `is null` de propósito: o que alguém já classificou à mão fica como está.
-- Uma varredura que sobrescrevesse tudo apagaria a única classificação
-- deliberada que existe no meio — e sem deixar rastro de qual era.
update lancamentos l
   set centro_custo = c.centro_custo
  from categorias_financeiras c
 where l.categoria_id = c.id
   and l.centro_custo is null
   and c.centro_custo is not null
   and l.cancelado_em is null;

-- Uma exceção nominal: R$ 423,01 de frascos lançado no centro "Financeiro"
-- quando saiu da conta genérica "Cartão de crédito". Frasco é produção; o
-- centro tinha virado o do meio de pagamento.
update lancamentos
   set centro_custo = 'producao'
 where categoria_id = 'frascos-e-insumos'
   and centro_custo = 'financeiro';
