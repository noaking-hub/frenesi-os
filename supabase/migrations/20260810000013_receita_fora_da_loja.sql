-- ═══════════════════════════════════════════════════════════════════════════
-- Receita que não passa pela loja.
--
-- Venda física, no balcão, recebida em dinheiro. Ela existe, é faturamento, e
-- o ERP não tinha onde colocá-la: toda categoria era de despesa, e a receita
-- do DRE saía exclusivamente dos pedidos pagos da Yampi.
--
-- ── Por que isso não estava lá antes ───────────────────────────────────────
--
-- A regra "receita vem do pedido, nunca do lançamento" existe para impedir
-- dupla contagem: o crédito da venda aparece no extrato E o pedido aparece na
-- Yampi, e somar os dois contaria a mesma venda duas vezes. A regra continua
-- valendo — o que faltava era o caso que ela não cobre, que é a venda sem
-- pedido nenhum.
--
-- Daí a natureza `Receita`: só o lançamento classificado nela entra na
-- receita bruta, e ele aparece no DRE em linha própria, separada da loja.
-- Quem olhar o relatório vê de onde veio cada real, em vez de um total que
-- não bate com nenhuma das duas fontes.
--
-- O risco que sobra, e é responsabilidade de quem classifica: dar categoria
-- de receita a um crédito do extrato que JÁ tem pedido na Yampi contaria duas
-- vezes. A tela protege o caminho comum — crédito casado com pedido nem chega
-- na fila —, mas não há como o banco saber que uma venda de balcão é a mesma
-- de um pedido online.
-- ═══════════════════════════════════════════════════════════════════════════

alter table categorias_financeiras drop constraint categorias_financeiras_natureza_check;

alter table categorias_financeiras add constraint categorias_financeiras_natureza_check
  check (natureza in ('Receita', 'Custo variável', 'Despesa fixa', 'Despesa'));

comment on column categorias_financeiras.natureza is
  'Receita entra na receita bruta do DRE; Custo variável acompanha a venda; Despesa fixa existe vendendo ou não.';

-- Categoria inicial para o caso que motivou tudo isto. Nome no plural porque
-- ela vai receber muitos lançamentos parecidos, não um único evento.
insert into categorias_financeiras (nome, natureza, ativa)
values ('Vendas fora da loja', 'Receita', true)
on conflict (nome) do nothing;
