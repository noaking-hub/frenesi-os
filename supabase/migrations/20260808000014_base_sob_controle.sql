-- ═══════════════════════════════════════════════════════════════════════════
-- Quais bases o ERP realmente controla em estoque.
-- ═══════════════════════════════════════════════════════════════════════════

-- Até aqui, "o ERP conhece esta base" era inferido de `custo_por_ml > 0`. Isso
-- funcionava enquanto o custo só nascia junto com a compra do frasco. Deixa de
-- funcionar no momento em que alguém quiser cadastrar o custo de um perfume
-- para precificá-lo SEM declarar volume — que é exatamente o que faz sentido
-- quando o estoque vai entrar aos poucos, frasco a frasco.
--
-- O perigo é concreto: com custo preenchido e volume zero, a base sairia de
-- "sem carga" e entraria em "esgotada". A sincronia então gravaria zero na
-- Shopify e tiraria o produto do ar — por causa de um cadastro de preço.
--
-- Preço e estoque são coisas diferentes. Uma base está sob controle de estoque
-- quando ENTROU no livro de movimentações: compra, carga, produção ou
-- inventário. Custo é atributo de catálogo e não coloca ninguém sob controle.

create view bases_sob_controle as
select distinct base_id
  from movimentacoes;

comment on view bases_sob_controle is
  'Bases que já tiveram alguma movimentação de estoque. Só estas entram na sincronia e podem ser declaradas esgotadas.';

grant select on bases_sob_controle to authenticated, anon, service_role;
