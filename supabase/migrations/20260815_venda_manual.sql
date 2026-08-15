-- VENDA MANUAL — a venda que não nasceu na loja, mas consome o mesmo estoque
-- e entra no mesmo caixa.
--
-- Vender no balcão e não registrar cria dois erros de uma vez: o perfume sai
-- do frasco sem sair do saldo (e o ERP manda repor tarde demais), e o dinheiro
-- entra sem aparecer no caixa. Esta função fecha o ciclo numa transação só —
-- ou tudo acontece, ou nada acontece; meia venda registrada seria pior do que
-- nenhuma.
--
-- Ela reaproveita o MESMO caminho da venda da loja: cria pedido e itens, chama
-- `baixar_estoque_do_pedido` (que desconta o líquido com a perda de envase,
-- escreve a movimentação, libera reserva e baixa frasco, válvula e tampa) e
-- grava o lançamento de entrada já baixado. Nada aqui é cálculo paralelo, e é
-- por isso que o número bate com o da venda online.

-- Venda feita fora da loja precisa de canal próprio. WhatsApp e Instagram já
-- existiam e continuam servindo para a venda que nasceu numa conversa;
-- "manual" é a que não nasceu em lugar nenhum digital.
alter type canal_venda add value if not exists 'manual';

create or replace function registrar_venda_manual(
  p_itens jsonb,              -- [{ base_id, ml, quantidade, preco, descricao }]
  p_conta_id text,
  p_canal text default 'manual',
  p_ocorrido_em timestamptz default now(),
  p_cliente_nome text default null,
  p_observacao text default null,
  p_operador text default 'Venda manual',
  p_cliente_email text default null
)
returns table (pedido_id text, total numeric, ml_baixado numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
  v_total numeric := 0;
  v_ml numeric := 0;
  v_item jsonb;
  v_cliente_id uuid;
  v_seq integer;
  v_nome text := nullif(trim(coalesce(p_cliente_nome, '')), '');
  v_email text := nullif(lower(trim(coalesce(p_cliente_email, ''))), '');
begin
  if p_itens is null or jsonb_array_length(p_itens) = 0 then
    raise exception 'Informe ao menos um item na venda.';
  end if;
  if not exists (select 1 from contas_bancarias where id = p_conta_id and ativa) then
    raise exception 'Conta % não existe ou está inativa.', p_conta_id;
  end if;

  -- Identificador legível: MAN-0001, MAN-0002…  A sequência é das vendas
  -- manuais, não um carimbo de tempo, porque quem procura depois lembra
  -- "a terceira venda de balcão", não o segundo em que ela foi digitada.
  select coalesce(max(substring(id from 5)::integer), 0) + 1 into v_seq
    from pedidos where id ~ '^MAN-[0-9]+$';
  v_id := 'MAN-' || lpad(v_seq::text, 4, '0');

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    if coalesce((v_item->>'quantidade')::numeric, 0) <= 0 then
      raise exception 'Quantidade precisa ser maior que zero.';
    end if;
    if coalesce((v_item->>'preco')::numeric, -1) < 0 then
      raise exception 'Preço não pode ser negativo.';
    end if;
    v_total := v_total + (v_item->>'preco')::numeric * (v_item->>'quantidade')::numeric;
  end loop;

  if v_total <= 0 then
    raise exception 'O total da venda precisa ser maior que zero.';
  end if;

  -- Cliente do balcão nem sempre tem e-mail, e o cadastro do CRM exige um.
  -- Inventar "semnome@frenesi" para fechar a venda encheria a base de
  -- clientes falsos e estragaria as métricas de recorrência. Com e-mail,
  -- vira cliente de verdade; sem e-mail, o nome fica no pedido e o CRM
  -- continua limpo.
  if v_email is not null then
    select id into v_cliente_id from clientes where lower(email) = v_email limit 1;
    if v_cliente_id is null then
      insert into clientes (nome, email)
      values (coalesce(v_nome, v_email), v_email)
      returning id into v_cliente_id;
    end if;
  elsif v_nome is not null then
    select id into v_cliente_id from clientes
     where lower(nome) = lower(v_nome) limit 1;
  end if;

  insert into pedidos (
    id, cliente_id, canal, valor, frete, cashback, pagamento, envio, situacao,
    comprado_em, entrega_local, estoque_fora_do_controle, destino
  ) values (
    v_id, v_cliente_id, p_canal::canal_venda, v_total, 0, 0, 'pago', 'entregue', 'entregue',
    p_ocorrido_em, true, false,
    coalesce(v_nome, 'Venda manual') ||
      coalesce(' · ' || nullif(trim(coalesce(p_observacao, '')), ''), '')
  );

  -- O id do item é uuid com default do banco: montar um texto próprio aqui
  -- quebraria o insert.
  insert into pedido_itens (pedido_id, base_id, descricao, variante, quantidade, preco)
  select
    v_id,
    nullif(item->>'base_id', ''),
    coalesce(nullif(item->>'descricao', ''), 'Item da venda manual'),
    nullif(item->>'ml', '')::smallint,
    (item->>'quantidade')::numeric,
    (item->>'preco')::numeric
  from jsonb_array_elements(p_itens) as item;

  -- Estoque: mesmo caminho da venda online, com perda de envase e insumos.
  select baixar_estoque_do_pedido(v_id, p_operador) into v_ml;

  -- Caixa: entrada já baixada na conta escolhida.
  insert into lancamentos (
    id, ocorrido_em, competencia, descricao, categoria, categoria_id, conta_id,
    tipo, valor, recebido, baixado_em, recorrente, origem, pedido_id,
    chave_externa, criado_por
  ) values (
    'venda-' || v_id,
    p_ocorrido_em::date,
    date_trunc('month', p_ocorrido_em)::date,
    'Venda manual ' || v_id || coalesce(' – ' || v_nome, ''),
    'Vendas', 'vendas', p_conta_id,
    'entrada', v_total, v_total, p_ocorrido_em::date, false,
    'Venda manual', v_id,
    'venda-' || v_id, p_operador
  );

  return query select v_id, v_total, coalesce(v_ml, 0);
end;
$$;

-- Corrigir um lançamento antigo de insumo reescreve o razão inteiro: apaga
-- linhas, regrava saldos, atualiza o cadastro e registra a trilha. Pelo
-- PostgREST isso são quatro chamadas soltas — e entre a primeira e a última
-- cabe um faturamento baixando frasco. O estoque terminaria com um saldo que
-- nunca existiu. Aqui tudo acontece numa transação, com trava na linha do
-- insumo. O RECÁLCULO continua no TypeScript, onde está testado; esta função
-- só aplica o resultado.
create or replace function aplicar_razao_insumo(
  p_insumo_id text,
  p_linhas jsonb,
  p_excluidas text[],
  p_saldo integer,
  p_custo numeric,
  p_trilha text,
  p_operador text,
  p_tipo_trilha text default 'estorno'
)
returns table (saldo integer, custo_unitario numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existe boolean;
begin
  perform 1 from insumos where id = p_insumo_id for update;
  select true into v_existe from insumos where id = p_insumo_id;
  if not v_existe then
    raise exception 'Insumo % não existe.', p_insumo_id;
  end if;

  if p_excluidas is not null and array_length(p_excluidas, 1) > 0 then
    delete from insumo_movimentacoes
     where insumo_id = p_insumo_id
       and id = any (p_excluidas::uuid[])
       -- Baixa de faturamento é intocável: apagá-la faria estoque e venda
       -- pararem de bater, e a venda é a que tem nota.
       and pedido_id is null;
  end if;

  update insumo_movimentacoes m
     set unidades = (l->>'unidades')::integer,
         saldo_anterior = (l->>'saldo_anterior')::integer,
         saldo = (l->>'saldo')::integer,
         custo_unitario = nullif(l->>'custo_unitario', '')::numeric,
         descricao = coalesce(nullif(l->>'descricao', ''), m.descricao),
         ref = nullif(l->>'ref', ''),
         responsavel = coalesce(nullif(l->>'responsavel', ''), m.responsavel)
    from jsonb_array_elements(p_linhas) as l
   where m.id = (l->>'id')::uuid
     and m.insumo_id = p_insumo_id;

  update insumos
     set unidades = p_saldo, custo_unitario = p_custo
   where id = p_insumo_id;

  insert into insumo_movimentacoes (
    insumo_id, tipo, unidades, saldo_anterior, saldo, descricao, responsavel, ocorrida_em
  ) values (
    p_insumo_id, p_tipo_trilha, 0, p_saldo, p_saldo, p_trilha, p_operador, now()
  );

  return query select p_saldo, p_custo;
end;
$$;
