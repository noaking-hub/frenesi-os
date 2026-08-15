-- CASAMENTO DO HISTÓRICO DA PAGAR.ME COM OS PEDIDOS DO ERP
--
-- A primeira versão casava pelo código do pedido no gateway. Não casa nada:
-- a verificação em produção deu 0 de 323. O motivo é que o código que a
-- Pagar.me guarda ("3YQGSZSZ5V") é da Yampi, o checkout — o ERP nunca o
-- recebeu, ele guarda o id interno da Yampi (YP-1510190675220737) e o número
-- da loja (SH-1119). São três identificadores para o mesmo pedido e nenhum
-- deles atravessa o gateway.
--
-- O que atravessa é o e-mail do comprador: existe nas duas pontas, nos 369
-- pedidos do período sem exceção. Daí o casamento por aproximação — e-mail,
-- valor e data — em três passadas, da mais segura para a mais tolerante:
--
--   1. código, se um dia existir (mantida por ser barata e exata);
--   2. e-mail + valor exato, dentro de sete dias;
--   3. e-mail + valor compatível, dentro de sete dias, o mais próximo.
--
-- Toda passada é UM-PARA-UM: cada crédito pega no máximo um pedido, e cada
-- pedido é pego no máximo uma vez. Sem isso, um cliente que comprou três
-- vezes na mesma semana teria os três créditos apontando para o mesmo pedido
-- — e o faturamento dele seria contado três vezes.
--
-- Crédito que não casa NÃO se perde: continua sendo caixa (o dinheiro entrou),
-- só entra como "a classificar" em vez de venda com margem. Errar o elo é
-- pior do que não ter elo, e por isso as regras são restritivas.

-- A assinatura muda (antes devolvia um inteiro só), e o Postgres não troca o
-- tipo de retorno de uma função existente com `create or replace`.
drop function if exists ligar_extrato_pagarme();

create or replace function ligar_extrato_pagarme()
returns table (por_codigo integer, por_valor_exato integer, por_aproximacao integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codigo integer := 0;
  v_exato integer := 0;
  v_aprox integer := 0;
begin
  -- 1. Pelo código, quando ele por acaso bate. Custa nada e é exata.
  update extrato_linhas e
     set pedido_id = p.id
    from pedidos p
   where e.origem = 'pagarme'
     and e.pedido_id is null
     and nullif(e.documento, '') is not null
     and (p.id = e.documento or p.shopify_numero = e.documento or p.id = 'YP-' || e.documento)
     and not exists (select 1 from extrato_linhas x where x.pedido_id = p.id);
  get diagnostics v_codigo = row_count;

  -- 2. E-mail + valor exato. `valor` da linha é o LÍQUIDO (já sem a tarifa),
  --    então o que se compara com o pedido é o valor PAGO, guardado no bruto.
  with par as (
    select distinct on (e.chave)
           e.chave,
           p.id as pedido,
           abs(p.comprado_em::date - e.ocorrido_em) as dist
      from extrato_linhas e
      join clientes cl on lower(cl.email) = e.bruto->>'email'
      join pedidos p on p.cliente_id = cl.id
     where e.origem = 'pagarme'
       and e.pedido_id is null
       and nullif(e.bruto->>'email', '') is not null
       and p.valor = round((e.bruto->>'pago')::numeric, 2)
       and abs(p.comprado_em::date - e.ocorrido_em) <= 7
       and not exists (select 1 from extrato_linhas x where x.pedido_id = p.id)
     order by e.chave, abs(p.comprado_em::date - e.ocorrido_em)
  ),
  unico as (
    select distinct on (pedido) chave, pedido from par order by pedido, dist
  )
  update extrato_linhas e set pedido_id = u.pedido from unico u where u.chave = e.chave;
  get diagnostics v_exato = row_count;

  -- 3. E-mail + valor compatível. "Compatível" é o pedido valer pelo menos o
  --    que foi creditado e no máximo um terço a mais: o gateway retém tarifa
  --    e o checkout dá desconto no Pix, mas nem tarifa nem desconto comem um
  --    terço da venda. Acima disso é pedido de outra compra, e o palpite
  --    passa a ser mais caro do que o silêncio.
  with par as (
    select distinct on (e.chave)
           e.chave,
           p.id as pedido,
           abs(p.comprado_em::date - e.ocorrido_em) as dist,
           abs(p.valor - (e.bruto->>'pago')::numeric) as difer
      from extrato_linhas e
      join clientes cl on lower(cl.email) = e.bruto->>'email'
      join pedidos p on p.cliente_id = cl.id
     where e.origem = 'pagarme'
       and e.pedido_id is null
       and nullif(e.bruto->>'email', '') is not null
       and p.valor >= e.valor
       and p.valor <= (e.bruto->>'pago')::numeric * 1.35
       and abs(p.comprado_em::date - e.ocorrido_em) <= 7
       and not exists (select 1 from extrato_linhas x where x.pedido_id = p.id)
     order by e.chave, abs(p.valor - (e.bruto->>'pago')::numeric),
              abs(p.comprado_em::date - e.ocorrido_em)
  ),
  unico as (
    select distinct on (pedido) chave, pedido from par order by pedido, difer, dist
  )
  update extrato_linhas e set pedido_id = u.pedido from unico u where u.chave = e.chave;
  get diagnostics v_aprox = row_count;

  return query select v_codigo, v_exato, v_aprox;
end;
$$;
