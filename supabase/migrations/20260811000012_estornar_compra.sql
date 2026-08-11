-- Estorno de compra de frasco lançada por engano.
--
-- Desfaz o que registrar_compra() fez, numa transação: tira o volume do
-- estoque, tira o dinheiro da média ponderada de custo e apaga o lote. A
-- trilha fica: a movimentação de entrada original permanece e o estorno
-- entra como ajuste negativo com a referência do lote.
--
-- Só vale para lote ABERTO e SEM SAÍDAS. Depois que o lote alimentou
-- produção ou venda, apagá-lo falsificaria o histórico — o caminho passa a
-- ser encerrar o lote e acertar pelo Inventário.
create or replace function public.estornar_compra(
  p_lote_id text,
  p_operador text default 'ERP'
) returns void
language plpgsql
as $$
declare
  v_lote   lotes%rowtype;
  v_saidas numeric(12, 2);
  v_volume numeric;
  v_custo  numeric;
  v_novo_volume numeric;
  v_novo_custo  numeric;
  v_saldo  numeric;
begin
  if coalesce(trim(p_operador), '') = '' then
    raise exception 'informe quem está estornando a compra';
  end if;

  select * into v_lote from lotes where id = p_lote_id for update;
  if not found then
    raise exception 'lote "%" não existe', p_lote_id;
  end if;
  if v_lote.encerrado_em is not null then
    raise exception
      'o lote % já foi encerrado e a perda dele já entrou na conta — não dá mais para estornar a compra',
      p_lote_id;
  end if;

  select coalesce(sum(ml), 0) into v_saidas
    from lote_saidas where lote_id = p_lote_id;
  if v_saidas > 0 then
    raise exception
      'o lote % já tem % ml de saídas lançadas — estornar apagaria histórico de produção ou venda. Se a compra foi mesmo errada, estorne primeiro as saídas',
      p_lote_id, v_saidas;
  end if;

  select volume_ml, custo_por_ml into v_volume, v_custo
    from perfumes_base where id = v_lote.base_id for update;

  if v_volume < v_lote.volume_ml then
    raise exception
      'a base só tem % ml em estoque, menos que os % ml deste lote — parte do volume já foi consumida por outro caminho; acerte pelo Inventário',
      v_volume, v_lote.volume_ml;
  end if;

  v_novo_volume := v_volume - v_lote.volume_ml;

  -- O inverso da média ponderada: valor de estoque atual menos o dinheiro
  -- desta compra, dividido pelo volume que fica. Com o estoque zerado não
  -- sobra base para média — o custo volta a zero e a próxima compra o define.
  if v_novo_volume > 0 then
    v_novo_custo := greatest(
      round((v_volume * v_custo - v_lote.custo_total) / v_novo_volume, 4),
      0
    );
  else
    v_novo_custo := 0;
  end if;

  update perfumes_base
     set volume_ml    = v_novo_volume,
         custo_por_ml = v_novo_custo
   where id = v_lote.base_id
   returning volume_ml into v_saldo;

  insert into movimentacoes (
    base_id, tipo, volume_ml, ref, descricao, responsavel, saldo_ml
  ) values (
    v_lote.base_id, 'ajuste', -v_lote.volume_ml, p_lote_id,
    'Estorno da compra · lançamento desfeito', p_operador, v_saldo
  );

  delete from lotes where id = p_lote_id;
end;
$$;
