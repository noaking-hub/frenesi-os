-- Fatura do cartão da operação: sem os gastos do cartão lançados um a um,
-- o pagamento da fatura É a despesa — classificar como transferência a
-- esconderia da DRE, e "Diversos" esconderia do gestor. Categoria própria,
-- com a mesma natureza administrativa de Diversos.
insert into categorias_financeiras (
  id, nome, natureza, natureza_gerencial, ativa, conta_contabil,
  impacta_dre, impacta_caixa, exige_documento, usar_em_automacao, centro_custo)
select
  'fatura-cartao', 'Fatura do cartão de crédito', natureza, natureza_gerencial, ativa,
  conta_contabil, impacta_dre, impacta_caixa, exige_documento, usar_em_automacao, centro_custo
from categorias_financeiras
where id = 'diversos'
on conflict (id) do nothing;
