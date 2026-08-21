-- ═══════════════════════════════════════════════════════════════════════════
-- Dinheiro que VOLTA de uma despesa não é receita — e "Amortização" não é
-- opção de "A receber".
--
-- ── O vazamento ───────────────────────────────────────────────────────────
--
-- "Amortização de empréstimo" nasceu com `natureza_gerencial = 'aporte_retirada'`
-- porque era o rótulo do enum mais próximo de "dinheiro trocado com quem
-- financia a empresa sem passar pelo resultado". O efeito colateral não foi
-- previsto: a tela oferece, em "A receber", as categorias de natureza
-- `receita_operacional` OU `aporte_retirada` — então ela apareceu na lista,
-- em primeiro lugar por ordem alfabética, e virou o valor PRÉ-SELECIONADO.
-- Dois lançamentos reais foram gravados assim antes de alguém notar.
--
-- Passa a `investimento`: fora dos dois filtros da tela, e `impacta_dre =
-- false` continua sendo quem de fato a mantém fora do resultado. O nome e o
-- comportamento não mudam para o pagamento da parcela, que é o uso real.
--
-- ── Reembolso de despesa ──────────────────────────────────────────────────
--
-- Seguro de pedido extraviado, estorno de assinatura, devolução de fornecedor:
-- é dinheiro entrando que NÃO é venda. Lançar como receita infla o
-- faturamento e estraga toda margem percentual — a base do cálculo cresce sem
-- que a operação tenha vendido nada.
--
-- O modelo do banco já sabe fazer isso certo: `lancamentos_por_natureza` soma
-- `saída − entrada` por natureza, então uma ENTRADA numa categoria de despesa
-- já abate aquela despesa na DRE. Nada aqui muda de cálculo; o que faltava era
-- a tela deixar escolher, e é o que a mudança de interface libera.
--
-- ── Os dois lançamentos gravados errado ───────────────────────────────────
--
-- R$ 499,56 · seguro de pedido extraviado (Enviali/Loja Integrada) → Frete,
-- centro Logística: o prejuízo do extravio é do transporte, e o seguro abate
-- exatamente esse custo.
--
-- R$ 96,73 · estorno da Manus AI → Inteligência artificial, centro Tecnologia:
-- o dinheiro voltou da própria despesa que o consumiu.
--
-- Os dois caem no Cartão Next e reduzem a fatura — isso é caixa, e não muda
-- com a reclassificação. O que muda é a linha da DRE.
-- ═══════════════════════════════════════════════════════════════════════════

update categorias_financeiras
   set natureza_gerencial = 'investimento'
 where id = 'amortizacao-de-emprestimo';

update lancamentos
   set categoria = 'Frete',
       categoria_id = 'frete',
       centro_custo = 'logistica'
 where id = 'LC-MT37MPUR-P2PU'
   and categoria_id = 'amortizacao-de-emprestimo';

update lancamentos
   set categoria = 'Inteligência artificial',
       categoria_id = 'inteligencia-artificial',
       centro_custo = 'tecnologia'
 where id = 'LC-MT37NOS2-LL2R'
   and categoria_id = 'amortizacao-de-emprestimo';

-- ── Equipamento não é despesa do mês ───────────────────────────────────────
--
-- Um iPad de R$ 2.070,56 comprado para a operação, em 8× no cartão. Lançado
-- como "Administrativo", ele derruba o resultado de agosto inteiro por causa
-- de um bem que vai servir por anos — e o mês seguinte, sem a compra, parece
-- ótimo pelo motivo errado. Os dois números ficam sem significado.
--
-- `investimento` com `impacta_dre = false`: a saída aparece no fluxo de caixa,
-- parcela por parcela, e fica fora do resultado. É a mesma natureza da
-- amortização de empréstimo, e pela mesma razão — dinheiro que sai sem ser
-- custo de operar no mês em que saiu.
--
-- Sem centro padrão de propósito: equipamento é de quem vai usá-lo. Um iPad da
-- operação é Tecnologia; uma bancada de envase é Produção; uma cadeira é
-- Administrativo. Deixar um padrão aqui carimbaria todos com o primeiro caso.
--
-- O que esta categoria NÃO faz é depreciar. Reconhecer o desgaste mês a mês
-- exigiria um lançamento recorrente de depreciação, e isso é decisão de quem
-- fecha o resultado — não algo para o ERP assumir sozinho.
insert into categorias_financeiras (
  id, nome, natureza, natureza_gerencial, conta_contabil, centro_custo,
  impacta_dre, impacta_caixa, exige_documento, usar_em_automacao, ativa
) values (
  'equipamentos', 'Equipamentos e mobiliário', 'Despesa', 'investimento',
  '1.2.03.001 · imobilizado', null,
  false, true, false, true, true
)
on conflict (id) do update
   set nome = excluded.nome,
       natureza = excluded.natureza,
       natureza_gerencial = excluded.natureza_gerencial,
       conta_contabil = excluded.conta_contabil,
       impacta_dre = excluded.impacta_dre,
       ativa = true;
