/**
 * Classifica de uma vez os recebimentos que não têm o que decidir.
 *
 * Uma linha de entrada JÁ LIGADA a um pedido é o crédito daquela venda — não
 * há categoria a escolher, porque a receita do DRE vem do pedido, não do
 * lançamento. Obrigar alguém a clicar 141 vezes para dizer "sim, é venda"
 * não é conferência: é digitação, e depois de vinte linhas ninguém mais lê o
 * que está aprovando.
 *
 * O que NÃO entra aqui, de propósito:
 *  - entrada sem pedido casado: é dinheiro que entrou sem venda registrada,
 *    exatamente o caso que precisa de gente olhando;
 *  - qualquer saída: tarifa, estorno e fornecedor têm categoria, e é ela que
 *    sustenta o DRE.
 */
create function classificar_recebimentos(
  p_origem   text,
  p_conta_id text,
  p_operador text
) returns integer
language plpgsql
as $$
declare
  v_linha record;
  v_feitas integer := 0;
begin
  for v_linha in
    select origem, chave
      from extrato_linhas
     where origem = p_origem
       and conta_id = p_conta_id
       and tipo = 'entrada'
       and pedido_id is not null
       and lancamento_id is null
       and not ignorado
     order by ocorrido_em
  loop
    perform classificar_extrato(v_linha.origem, v_linha.chave, '', '', p_operador);
    v_feitas := v_feitas + 1;
  end loop;

  return v_feitas;
end;
$$;

comment on function classificar_recebimentos is
  'Classifica em lote os créditos de venda já casados com pedido. Entrada sem pedido e saídas ficam na fila.';
