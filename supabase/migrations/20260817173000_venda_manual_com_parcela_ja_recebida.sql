-- VENDA MANUAL COM PARCELA JÁ RECEBIDA — o mesmo K, no outro lugar que parcela.
--
-- A migração anterior (20260817160000) ensinou "as K primeiras já foram
-- recebidas em <data>" a `gravar_parcelas_do_lancamento`, e com isso o
-- parcelamento de um lançamento existente passou a atender o relato do dono.
-- Faltava o outro chamador: `registrar_venda_manual` continuava passando K = 0
-- pelos defaults, então a venda que nasce parcelada nascia inteiramente a
-- receber — e a venda parcelada DESTA operação quase sempre tem a primeira
-- parcela na mão no ato do fechamento.
--
-- Esta migração não cria mecanismo nenhum: só repassa os dois parâmetros que já
-- existem. É de propósito que a venda manual não ganhou uma função própria de
-- dividir valor — dois caminhos para o mesmo fato divergem no primeiro conserto
-- que alguém fizer em um só deles.
--
-- ── A premissa errada que morre aqui ──────────────────────────────────────
--
-- A tentativa anterior de parcelar a venda manual partiu de "parcelamento só
-- faz sentido para venda A RECEBER", e por isso os campos de parcela ficavam
-- desabilitados quando a venda era marcada como recebida. É o contrário do que
-- esta operação faz: parcelar em 2x e receber a primeira parcela na hora é o
-- caso NORMAL. E mesmo a venda recebida por inteiro pode ser parcelada — é o
-- cliente que pagou as duas parcelas adiantadas, K = N.
--
-- ── O que passa a ser possível, e não era ─────────────────────────────────
--
--   N = 1, K = 1  → a venda à vista de sempre, byte a byte (o default)
--   N = 1, K = 0  → venda fiada: o valor inteiro a receber, sem parcelamento
--   N ≥ 2, K = 0  → a venda parcelada que a migração anterior já gravava
--   N ≥ 2, K ≥ 1  → o caso do dono: 1/2 recebida no ato, 2/2 em aberto
--
-- ── Por que `p_ja_recebidas` entra como NULL e não como 0 ─────────────────
--
-- Zero como default silenciaria a venda à vista: toda chamada antiga de
-- `registrar_venda_manual` com uma parcela passaria a gravar o lançamento SEM
-- baixa, e o caixa do dia deixaria de subir sem erro nenhum na tela. NULL
-- significa "não informado", e aí o padrão é o comportamento anterior a esta
-- migração — que era diferente nos dois ramos: uma parcela nascia recebida, N
-- parcelas nasciam a receber.

drop function if exists registrar_venda_manual(
  jsonb, text, text, timestamptz, text, text, text, text, smallint, int
);

create or replace function registrar_venda_manual(
  p_itens jsonb,              -- [{ base_id, ml, quantidade, preco, descricao }]
  p_conta_id text,
  p_canal text default 'manual',
  p_ocorrido_em timestamptz default now(),
  p_cliente_nome text default null,
  p_observacao text default null,
  p_operador text default 'Venda manual',
  p_cliente_email text default null,
  -- 1 (ou nulo) é a venda sem parcelamento. De 2 a 48, o total é repartido.
  p_parcelas smallint default 1,
  p_intervalo_dias int default 30,
  -- K: quantas das PRIMEIRAS parcelas já entraram na conta. Nulo é "não
  -- informado" — ver o bloco acima.
  p_ja_recebidas smallint default null,
  -- O dia em que essas K entraram. Sem valor, é o dia da venda: quem recebeu no
  -- ato não tem outra data para informar.
  p_recebidas_em date default null
)
returns table (
  pedido_id text,
  total numeric,
  -- Quanto do total JÁ está na conta depois desta venda. A tela de sucesso
  -- mostra o que o banco gravou, e sem este número ela teria de deduzir do
  -- cronograma o que o próprio banco acabou de decidir.
  total_recebido numeric,
  ml_baixado numeric,
  parcelas jsonb
)
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
  v_descricao text;
  v_modelo lancamentos;
  v_parcelas jsonb := '[]'::jsonb;
  v_n smallint := coalesce(p_parcelas, 1);
  -- Sem K informado, cada ramo mantém o que fazia antes desta migração.
  v_ja smallint := coalesce(p_ja_recebidas, case when coalesce(p_parcelas, 1) <= 1 then 1 else 0 end);
  v_recebidas_em date := coalesce(p_recebidas_em, p_ocorrido_em::date);
  v_recebido numeric := 0;
begin
  if p_itens is null or jsonb_array_length(p_itens) = 0 then
    raise exception 'Informe ao menos um item na venda.';
  end if;
  if not exists (select 1 from contas_bancarias where id = p_conta_id and ativa) then
    raise exception 'Conta % não existe ou está inativa.', p_conta_id;
  end if;
  -- A faixa de K é conferida aqui também, e não só dentro de
  -- `gravar_parcelas_do_lancamento`, porque o ramo de uma parcela não passa
  -- por ela — e "2 parcelas já recebidas" numa venda sem parcelamento marcaria
  -- como recebido o dobro do que a venda vale.
  if v_ja < 0 or v_ja > greatest(v_n, 1) then
    raise exception 'não dá para marcar % parcelas já recebidas em uma venda de %', v_ja, greatest(v_n, 1);
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

  -- `pagamento = 'pago'` vale TAMBÉM na venda parcelada, e isto é uma
  -- armadilha silenciosa: a Receita bruta da DRE sai de `receita_por_competencia`,
  -- que filtra `pedidos.pagamento = 'pago'` e agrupa por `comprado_em` — não do
  -- lançamento. Marcar 'pendente' para representar "a receber" faria a venda
  -- sumir da receita do mês sem erro nenhum na tela. A venda aconteceu; o que
  -- está parcelado é o caixa, e é o lançamento que conta essa parte.
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

  -- Estoque: mesmo caminho da venda online, com perda de envase e insumos. Não
  -- muda com o parcelamento nem com K — o perfume saiu do frasco hoje, tenha o
  -- dinheiro entrado ou não. Esta chamada é a ÚNICA que mexe em estoque nesta
  -- função, e continua sendo feita uma vez só: `baixar_estoque_do_pedido` tem
  -- guarda de reentrada e devolveria 0 numa segunda passagem, mas quem parcela
  -- dinheiro não tem por que chamá-la de novo.
  select baixar_estoque_do_pedido(v_id, p_operador) into v_ml;

  v_descricao := 'Venda manual ' || v_id || coalesce(' – ' || v_nome, '');

  if v_n <= 1 then
    -- Sem parcelamento: uma linha só, recebida ou a receber conforme K.
    insert into lancamentos (
      id, ocorrido_em, competencia, vence_em, descricao, categoria, categoria_id, conta_id,
      tipo, valor, recebido, baixado_em, recorrente, origem, pedido_id,
      chave_externa, criado_por
    ) values (
      'venda-' || v_id,
      p_ocorrido_em::date,
      date_trunc('month', p_ocorrido_em)::date,
      -- Venda já recebida continua nascendo SEM vencimento, como antes desta
      -- migração: prazo de coisa paga é ruído na coluna "vence". A venda fiada
      -- precisa de um dia, ou some da projeção de caixa — `fluxo_de_caixa`
      -- posiciona o previsto por `vence_em`, e sem ele a linha não cai em dia
      -- nenhum. O dia é o da venda: quem fia sem combinar prazo está devendo
      -- desde hoje, e é isso que a fila de cobrança precisa mostrar.
      case when v_ja >= 1 then null else p_ocorrido_em::date end,
      v_descricao,
      'Vendas', 'vendas', p_conta_id,
      'entrada', v_total,
      case when v_ja >= 1 then v_total else 0 end,
      case when v_ja >= 1 then v_recebidas_em else null end,
      false,
      'Venda manual', v_id,
      'venda-' || v_id, p_operador
    );
    v_recebido := case when v_ja >= 1 then v_total else 0 end;
  else
    -- O total vira N parcelas, todas na competência do mês da venda, cada uma
    -- no seu vencimento — e as K primeiras já nascem baixadas.
    v_modelo.id := 'venda-' || v_id;
    v_modelo.ocorrido_em := p_ocorrido_em::date;
    v_modelo.competencia := date_trunc('month', p_ocorrido_em)::date;
    -- Vencimento da primeira parcela. Com K > 0 quem manda é a data do
    -- recebimento: `gravar_parcelas_do_lancamento` ancora o cronograma nela,
    -- justamente para a 2ª parcela cair 30 dias depois do que o cliente pagou,
    -- e não 30 dias depois de uma data que ninguém combinou.
    v_modelo.vence_em := p_ocorrido_em::date;
    v_modelo.descricao := v_descricao;
    v_modelo.categoria := 'Vendas';
    v_modelo.categoria_id := 'vendas';
    v_modelo.conta_id := p_conta_id;
    v_modelo.tipo := 'entrada';
    v_modelo.valor := v_total;
    v_modelo.origem := 'Venda manual';
    -- Diferente do parcelamento avulso, a parcela de venda manual GUARDA o
    -- pedido: é ele que o painel de detalhe usa para mostrar itens, cliente e
    -- irmãs. Uma parcela sem `pedido_id` abriria a tela que explica de onde
    -- veio o dinheiro sem nada para explicar.
    v_modelo.pedido_id := v_id;
    v_modelo.chave_externa := 'venda-' || v_id;
    v_modelo.criado_por := p_operador;

    perform gravar_parcelas_do_lancamento(
      v_modelo, v_n, p_intervalo_dias, v_ja, v_recebidas_em
    );

    -- O cronograma devolvido é LIDO de volta do que foi gravado, não recalculado
    -- aqui: a tela de sucesso promete mostrar o que o banco escreveu. Vale
    -- também para o que já entrou — `total_recebido` é a soma das parcelas
    -- baixadas, não K × valor da parcela.
    select coalesce(
             jsonb_agg(
               jsonb_build_object(
                 'numero', l.parcela,
                 'vence_em', l.vence_em,
                 'valor', l.valor,
                 'recebida_em', l.baixado_em
               )
               order by l.parcela
             ),
             '[]'::jsonb
           ),
           coalesce(sum(l.recebido), 0)
      into v_parcelas, v_recebido
      from lancamentos l
     where l.pedido_id = v_id and l.parcela is not null;
  end if;

  return query select v_id, v_total, v_recebido, coalesce(v_ml, 0), v_parcelas;
end;
$$;

comment on function registrar_venda_manual(
  jsonb, text, text, timestamptz, text, text, text, text, smallint, int, smallint, date
) is
  'Registra a venda fora da loja numa transação só: pedido, itens, baixa de estoque e o caixa — à vista, a receber ou repartido em N parcelas das quais as K primeiras já entraram.';

-- ── O revoke que o `drop function` acima obriga ────────────────────────────
--
-- `create or replace` preserva os privilégios do objeto; `drop` + `create` NÃO,
-- porque o segundo é um objeto novo — e todo objeto novo nasce com `execute`
-- para PUBLIC, o que inclui `anon`. Esta função é SECURITY DEFINER: ela roda
-- como `postgres` e passa por cima do RLS. Sem a linha abaixo, um POST em
-- /rest/v1/rpc/registrar_venda_manual com a chave anônima — que está num
-- repositório PÚBLICO — grava pedido, faturamento e baixa de estoque sem
-- sessão nenhuma. Conferido em `pg_proc.proacl` logo depois de aplicar a
-- primeira versão desta migração: `anon=X` estava lá.
--
-- A varredura de 20260817170000_o_drop_devolveu_o_execute_a_anon conta a
-- história inteira e reconserta o esquecimento anterior. Este `revoke` explícito
-- fica aqui do mesmo jeito, junto do `drop` que o causou: quem rebuildar o banco
-- só com os arquivos não pode depender da ordem alfabética de dois arquivos
-- para não publicar uma função de escrita na internet.
revoke execute on function registrar_venda_manual(
  jsonb, text, text, timestamptz, text, text, text, text, smallint, int, smallint, date
) from anon, authenticated, public;
