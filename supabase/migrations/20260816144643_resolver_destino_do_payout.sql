-- A resposta à pergunta "para onde foi esse dinheiro?", atômica.
--
-- Só existem duas respostas possíveis, e elas se excluem: ou o saque foi para
-- uma conta própria (e então é transferência, e falta a perna de entrada), ou
-- pagou alguém de fora (e então é despesa, e a marca de transferência tem de
-- sair). Deixar as duas coisas acontecerem em chamadas separadas abriria a
-- janela em que a linha é as duas coisas ao mesmo tempo.
create or replace function public.resolver_destino_do_payout(
  p_id text,
  p_conta_destino text default null,
  p_categoria_id text default null,
  p_operador text default 'operador'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_l lancamentos%rowtype;
  v_id_entrada text;
begin
  select * into v_l from lancamentos where id = p_id and aguarda_destino;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'Lançamento não está na fila de destino.');
  end if;

  -- Uma resposta, não duas. Aceitar as duas seria aceitar que o dinheiro foi
  -- para a conta própria E para um fornecedor.
  if (p_conta_destino is null) = (p_categoria_id is null) then
    return jsonb_build_object('ok', false,
      'erro', 'Informe a conta de destino OU a categoria da despesa — uma só.');
  end if;

  if p_conta_destino is not null then
    if not exists (select 1 from contas_bancarias where id = p_conta_destino) then
      return jsonb_build_object('ok', false, 'erro', 'Conta de destino não existe.');
    end if;
    if p_conta_destino = v_l.conta_id then
      return jsonb_build_object('ok', false, 'erro', 'Origem e destino são a mesma conta.');
    end if;

    -- Foi para conta própria: nasce a perna que faltava. Com as duas pernas, a
    -- transferência volta a ser neutra no caixa — que é o certo, porque o
    -- consolidado não mudou.
    v_id_entrada := v_l.id || ':destino';
    insert into lancamentos (
      id, ocorrido_em, competencia, descricao, categoria, categoria_id, conta_id,
      tipo, valor, recebido, baixado_em, recorrente, origem, transferencia_id,
      conta_destino_id, chave_externa, criado_por)
    values (
      v_id_entrada, v_l.ocorrido_em, v_l.competencia,
      'Transferência recebida – ' || coalesce(v_l.descricao, 'payout'),
      'Transferências', 'transferencias', p_conta_destino,
      'entrada', v_l.valor, v_l.valor, v_l.baixado_em, false,
      v_l.origem, v_l.transferencia_id, v_l.conta_id, v_id_entrada, p_operador)
    on conflict (id) do nothing;

    update lancamentos
       set conta_destino_id = p_conta_destino,
           categoria_id = 'transferencias',
           categoria = 'Transferências',
           aguarda_destino = false,
           atualizado_em = now()
     where id = p_id;

    return jsonb_build_object('ok', true, 'tipo', 'transferencia',
      'recibo', 'Transferência para ' || p_conta_destino || ' registrada com as duas pernas.');
  end if;

  -- Foi despesa: deixa de ser transferência. O `transferencia_id` é limpo
  -- porque ele é o que fazia o lançamento se apresentar como movimentação
  -- interna — mantê-lo com uma categoria de despesa criaria um híbrido que
  -- nenhuma tela sabe ler.
  if not exists (select 1 from categorias_financeiras where id = p_categoria_id) then
    return jsonb_build_object('ok', false, 'erro', 'Categoria não existe.');
  end if;

  update lancamentos l
     set categoria_id = p_categoria_id,
         categoria = (select nome from categorias_financeiras where id = p_categoria_id),
         transferencia_id = null,
         conta_destino_id = null,
         aguarda_destino = false,
         atualizado_em = now()
   where l.id = p_id;

  return jsonb_build_object('ok', true, 'tipo', 'despesa',
    'recibo', 'Classificado como despesa em ' ||
      (select nome from categorias_financeiras where id = p_categoria_id) || '.');
end;
$function$;
