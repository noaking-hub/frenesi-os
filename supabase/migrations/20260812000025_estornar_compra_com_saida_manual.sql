-- Estorno de compra em lote que já teve saída lançada à mão.
--
-- A regra antiga era "lote com saída não se estorna", e ela existia por um
-- motivo certo: apagar um lote que alimentou PRODUÇÃO deixaria decants
-- envasados sem origem. Só que ela tratava dois casos como um. A saída
-- lançada à mão não tem contrapartida nenhuma do outro lado — é uma linha
-- digitada. Quando o lote inteiro foi um engano, essa linha é engano junto,
-- e exigir que a pessoa desfaça saída por saída antes de apagar o lote é
-- burocracia sem ganho de integridade.
--
-- Agora: saída de produção continua barrando o estorno; saída manual é
-- desfeita junto, na mesma transação, com cada estorno na trilha.
create or replace function public.estornar_compra(
  p_lote_id text,
  p_operador text default 'ERP'
) returns void
language plpgsql
as $$
declare
  v_lote        lotes%rowtype;
  v_producao    numeric(12, 2);
  v_manuais     numeric(12, 2);
  v_saida       lote_saidas%rowtype;
  v_volume      numeric;
  v_custo       numeric;
  v_novo_volume numeric;
  v_novo_custo  numeric;
  v_saldo       numeric;
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

  select coalesce(sum(ml) filter (where ordem_id is not null), 0),
         coalesce(sum(ml) filter (where ordem_id is null), 0)
    into v_producao, v_manuais
    from lote_saidas where lote_id = p_lote_id;

  if v_producao > 0 then
    raise exception
      'o lote % já rendeu % ml em ordens de produção — apagá-lo deixaria decants envasados sem origem. Encerre o lote e acerte pelo Inventário',
      p_lote_id, v_producao;
  end if;

  -- Devolve cada saída manual ao frasco antes de desfazer a compra. Uma linha
  -- por estorno na trilha: quem auditar depois vê o que foi desfeito, e não
  -- só um ajuste grande sem explicação.
  for v_saida in select * from lote_saidas where lote_id = p_lote_id loop
    delete from lote_saidas where id = v_saida.id;

    update perfumes_base
       set volume_ml = volume_ml + v_saida.ml
     where id = v_lote.base_id
     returning volume_ml into v_saldo;

    insert into movimentacoes (
      base_id, tipo, ocorrida_em, volume_ml, ref, descricao, responsavel, saldo_ml
    ) values (
      v_lote.base_id, 'ajuste', now(), v_saida.ml, p_lote_id,
      format('Estorno de saída lançada à mão · %s (compra estornada)',
             coalesce(v_saida.motivo, 'sem motivo registrado')),
      p_operador, v_saldo
    );
  end loop;

  select volume_ml, custo_por_ml into v_volume, v_custo
    from perfumes_base where id = v_lote.base_id for update;

  if v_volume < v_lote.volume_ml then
    raise exception
      'a base só tem % ml em estoque, menos que os % ml deste lote — parte do volume já foi consumida por outro caminho; acerte pelo Inventário',
      v_volume, v_lote.volume_ml;
  end if;

  v_novo_volume := v_volume - v_lote.volume_ml;

  -- O inverso da média ponderada: valor de estoque atual menos o dinheiro
  -- desta compra, dividido pelo volume que fica.
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
