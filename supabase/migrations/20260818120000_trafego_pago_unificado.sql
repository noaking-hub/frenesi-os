-- Uma categoria só para o tráfego pago, a pedido do dono.
--
-- "Google ADS - Tráfego Pago" e "Meta ADS - Tráfego Pago" eram a MESMA
-- despesa com nomes diferentes — a DRE quer saber quanto custou o tráfego,
-- não em qual plataforma. A plataforma continua visível, mas no lugar certo:
-- o favorecido na descrição do lançamento ("Google ADS", "Meta ADS").
insert into categorias_financeiras (
  id, nome, natureza, natureza_gerencial, ativa, conta_contabil,
  impacta_dre, impacta_caixa, exige_documento, usar_em_automacao, centro_custo)
select
  'trafego-pago', 'Tráfego Pago', natureza, natureza_gerencial, ativa, conta_contabil,
  impacta_dre, impacta_caixa, exige_documento, usar_em_automacao, centro_custo
from categorias_financeiras
where id = 'google-ads-trafego-pago'
on conflict (id) do nothing;

-- O favorecido entra ANTES da troca de categoria: depois dela, a categoria
-- antiga não diz mais qual plataforma era.
update lancamentos
   set descricao = case when categoria_id = 'google-ads-trafego-pago' then 'Google ADS' else 'Meta ADS' end
 where categoria_id in ('google-ads-trafego-pago', 'meta-ads-trafego-pago')
   and descricao = 'Transferência para conta bancária';

update lancamentos
   set categoria_id = 'trafego-pago',
       categoria = 'Tráfego Pago',
       atualizado_em = now()
 where categoria_id in ('google-ads-trafego-pago', 'meta-ads-trafego-pago');

-- A regra referencia a categoria DUAS vezes: pelo id e pelo nome (o FK é no
-- nome). As duas precisam andar juntas, senão a exclusão abaixo é recusada.
update regras_categoria
   set categoria_id = 'trafego-pago',
       categoria = 'Tráfego Pago'
 where categoria_id in ('google-ads-trafego-pago', 'meta-ads-trafego-pago')
    or categoria in ('Google ADS - Tráfego Pago', 'Meta ADS - Tráfego Pago');

delete from categorias_financeiras
 where id in ('google-ads-trafego-pago', 'meta-ads-trafego-pago');
