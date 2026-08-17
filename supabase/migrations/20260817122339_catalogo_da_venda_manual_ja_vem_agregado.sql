-- O formulário de venda manual lia 2.054 produtos derivados para montar uma
-- tabela de preços de 412 linhas.
--
-- `produtos_derivados` tem 2.054 linhas e o `tudoDe` pagina de 1.000 em 1.000,
-- então eram TRÊS requisições PostgREST (242.944 bytes medidos) das quais o
-- código usava exatamente duas coisas: o preço praticado por variante e a
-- lista distinta de tamanhos. Enquanto essa leitura vivia no render da lista
-- de Lançamentos, ela era paga a cada mudança de filtro; agora que ela só
-- acontece quando o modal abre, ela virou tempo de espera do operador — e é
-- por isso que ainda vale agregar.
--
-- As duas views devolvem dezenas de linhas em duas requisições, no lugar de
-- 2.054 em três.

-- Só o que tem preço: o `> 0` é o mesmo filtro que o Node aplicava antes de
-- popular o mapa. Variante sem preço praticado não deve sugerir R$ 0,00 no
-- campo — o operador digitaria por cima sem perceber que o zero veio do ERP.
create or replace view public.precos_da_venda_manual as
  select base_id, jsonb_object_agg(variante::text, preco_praticado) as precos
    from produtos_derivados
   where preco_praticado > 0
   group by base_id;

-- Os tamanhos vêm de TODAS as linhas, não só das com preço: o catálogo
-- pratica o tamanho mesmo quando o preço ainda não foi definido, e sumir com
-- ele do <select> impediria de vender o decant que existe na prateleira.
create or replace view public.tamanhos_da_venda_manual as
  select distinct variante
    from produtos_derivados
   order by variante;

-- Mesma trava de 20260817012100: view criada por `postgres` roda com os
-- privilégios do dono, que tem `rolbypassrls`, e pularia o RLS da tabela.
alter view public.precos_da_venda_manual set (security_invoker = on);
alter view public.tamanhos_da_venda_manual set (security_invoker = on);
revoke select on public.precos_da_venda_manual from anon, authenticated;
revoke select on public.tamanhos_da_venda_manual from anon, authenticated;
