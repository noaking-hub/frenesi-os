-- PARCELAMENTO NA VENDA MANUAL — e um só mecanismo de parcelar.
--
-- O dono registrava a venda de balcão e, para parcelar, tinha de achar o
-- lançamento em outra tela e parcelar num segundo passo. Só que esse segundo
-- passo NÃO EXISTIA para a venda manual: `registrar_venda_manual` grava o
-- lançamento já baixado (recebido = total, baixado_em = data da venda), e
-- `parcelar_lancamento` recusa lançamento baixado — "lançamento já baixado não
-- parcela". A tela também escondia o ícone, porque `situacaoDe` devolve
-- 'liquidado' quando não sobra saldo aberto. Ou seja: o caminho que a interface
-- sugeria estava barrado no SQL desde sempre.
--
-- Por que a venda nasce parcelada AQUI, dentro da mesma função, e não por uma
-- segunda chamada logo depois:
--   1. Duas chamadas `.rpc()` do PostgREST são DUAS transações. O comentário da
--      própria action já tinha decidido isso — "meia venda gravada (estoque
--      baixado sem dinheiro no caixa, ou o contrário) seria pior que venda
--      nenhuma". Venda com estoque baixado e parcelamento pela metade é a mesma
--      doença.
--   2. Encadear exigiria nascer baixada e des-baixar em seguida: escrever o
--      falso para corrigir depois.
--   3. `parcelar_lancamento` CANCELA o pai. A venda deixaria na lista um
--      lançamento nascido e morto no mesmo segundo.
--
-- E por que isso NÃO é um segundo mecanismo de parcelamento: a regra de como um
-- valor vira N parcelas saiu de dentro de `parcelar_lancamento` e virou
-- `gravar_parcelas_do_lancamento`. Agora existe UM lugar que sabe dividir o
-- valor, espaçar os vencimentos, preservar a competência e numerar o "(i/n)" —
-- e os dois caminhos (parcelar um compromisso existente, nascer parcelada)
-- chamam esse lugar. Antes de existir esta função, consertar o arredondamento
-- em um dos caminhos deixaria o outro para trás.

-- ── O mecanismo, num lugar só ──────────────────────────────────────────────
--
-- Recebe o lançamento COMO ELE SERIA gravado à vista (`p_modelo`) e o escreve
-- repartido em N vencimentos. O modelo é um `lancamentos` inteiro em vez de
-- vinte parâmetros soltos porque os dois chamadores já têm a linha pronta na
-- mão — um leu do banco, o outro acabou de montar.
--
-- Do modelo, três campos são lidos como BASE e não como valor final:
--   `id`          → prefixo: cada parcela vira '<id>-1', '<id>-2'…
--   `valor`       → total a repartir
--   `vence_em`    → vencimento da PRIMEIRA parcela (as outras somam o intervalo)
create or replace function gravar_parcelas_do_lancamento(
  p_modelo lancamentos,
  p_parcelas smallint,
  p_intervalo_dias int default 30
) returns integer
language plpgsql
set search_path = public
as $$
declare
  v_valor numeric;
  v_resto numeric;
  v_primeiro_venc date;
  v_criadas int := 0;
begin
  -- A faixa 2..48 é a mesma que a tela oferece e a mesma que a action valida.
  -- Repetir aqui não é desconfiança do TypeScript: é que esta função é
  -- alcançável por RPC direta, sem passar por tela nenhuma.
  if p_parcelas is null or p_parcelas < 2 then
    raise exception 'parcelamento exige ao menos 2 parcelas';
  end if;
  if p_parcelas > 48 then
    raise exception 'no máximo 48 parcelas';
  end if;
  if coalesce(p_intervalo_dias, 0) < 1 then
    raise exception 'o intervalo entre parcelas precisa ser de ao menos 1 dia';
  end if;

  -- O centavo do arredondamento vai na PRIMEIRA parcela, não na última: quem
  -- confere o boleto de hoje encontra a diferença agora, e não daqui a 11
  -- meses. `dividirEmParcelas`, em src/domain/parcelamento.ts, é o espelho
  -- desta conta — é ela que desenha a prévia, e o teste dela existe para que
  -- prévia e gravação nunca discordem em um centavo.
  v_valor := trunc(p_modelo.valor / p_parcelas, 2);
  v_resto := p_modelo.valor - (v_valor * p_parcelas);

  -- Sem vencimento definido, a competência serve de âncora: um compromisso
  -- "previsto" ainda precisa cair em algum dia para entrar na projeção.
  v_primeiro_venc := coalesce(p_modelo.vence_em, p_modelo.competencia);

  for i in 1..p_parcelas loop
    insert into lancamentos (
      id, ocorrido_em, competencia, vence_em, descricao, categoria, categoria_id,
      centro_custo, conta_id, tipo, valor, recebido, origem, favorecido,
      documento, observacao, parcela, parcelas, pai_id, criado_por,
      pedido_id, chave_externa
    ) values (
      p_modelo.id || '-' || i,
      p_modelo.ocorrido_em,
      -- A competência de TODAS é a do fato: a venda aconteceu uma vez só. O que
      -- se espalha pelos vencimentos é o caixa, não o resultado. Distribuir a
      -- competência faria a receita de agosto reaparecer em setembro e outubro.
      p_modelo.competencia,
      -- Dias CORRIDOS, não "todo dia 7": 07/09 + 30 + 30 é 06/11. A tela mostra
      -- a data calculada justamente para não prometer "mensal" e entregar 06/11.
      v_primeiro_venc + ((i - 1) * p_intervalo_dias),
      p_modelo.descricao || ' (' || i || '/' || p_parcelas || ')',
      p_modelo.categoria, p_modelo.categoria_id, p_modelo.centro_custo, p_modelo.conta_id,
      p_modelo.tipo,
      v_valor + case when i = 1 then v_resto else 0 end,
      -- Parcela nasce inteiramente a receber. `baixado_em` fica no default
      -- nulo: parcelar é o oposto de baixar.
      0,
      p_modelo.origem, p_modelo.favorecido,
      p_modelo.documento, p_modelo.observacao,
      i::smallint, p_parcelas, p_modelo.pai_id, p_modelo.criado_por,
      p_modelo.pedido_id,
      -- A chave externa, quando existe, ganha o sufixo da parcela: o índice
      -- único `lancamento_chave_externa_unica` recusaria três linhas com a
      -- mesma chave.
      case when p_modelo.chave_externa is null then null
           else p_modelo.chave_externa || '-' || i end
    );
    v_criadas := v_criadas + 1;
  end loop;

  return v_criadas;
end;
$$;

comment on function gravar_parcelas_do_lancamento(lancamentos, smallint, int) is
  'Escreve um lançamento repartido em N vencimentos. Único lugar do sistema que sabe dividir o valor e espaçar as datas.';

-- ── Parcelar um compromisso que já existe ──────────────────────────────────
--
-- Mesma assinatura, mesmo retorno e MESMO resultado gravado de antes: o corpo
-- só terceirizou o laço de INSERT. O que ele continua fazendo sozinho é o que
-- só faz sentido quando há um pai: lê o original, decide o que a parcela NÃO
-- herda dele, e cancela o original no fim.
create or replace function parcelar_lancamento(
  p_lancamento_id text,
  p_parcelas smallint,
  p_intervalo_dias int default 30
) returns integer
language plpgsql
as $$
declare
  v_pai lancamentos;
  v_modelo lancamentos;
  v_criadas int;
begin
  select * into v_pai from lancamentos where id = p_lancamento_id;
  if not found then raise exception 'lançamento % não existe', p_lancamento_id; end if;
  if v_pai.baixado_em is not null then raise exception 'lançamento já baixado não parcela'; end if;

  v_modelo := v_pai;
  v_modelo.pai_id := v_pai.id;
  v_modelo.origem := 'Parcelamento';

  -- Três heranças cortadas de propósito, e cada uma por um motivo diferente:
  --
  -- `chave_externa` é do registro de ORIGEM (a linha do extrato, o pagamento no
  -- gateway). O pai continua guardando a chave verdadeira, cancelado mas
  -- presente; derivar 'chave-1', 'chave-2' aqui inventaria chaves que nunca
  -- existiram no banco de origem e daria à conciliação três candidatos falsos
  -- para a mesma linha.
  v_modelo.chave_externa := null;
  -- `pedido_id` fica com o pai pelo mesmo motivo — e porque mudá-lo aqui
  -- alteraria o comportamento de todo parcelamento já feito, sem que ninguém
  -- tenha pedido. A venda manual, que nasce parcelada, passa o pedido pelo
  -- modelo dela; este caminho não.
  v_modelo.pedido_id := null;
  -- `recorrente` marca o fato que se REPETE todo mês e gera lançamentos novos.
  -- Parcela é o contrário: um fato só, repartido em vencimentos. Herdar a marca
  -- faria a série se multiplicar sozinha.
  v_modelo.recorrente := false;

  v_criadas := gravar_parcelas_do_lancamento(v_modelo, p_parcelas, p_intervalo_dias);

  -- O pai é cancelado, não apagado: sem ele o histórico perderia a origem das
  -- parcelas, e o `pai_id` de cada uma apontaria para o nada.
  update lancamentos
     set cancelado_em = now(),
         cancelado_motivo = 'substituído por ' || p_parcelas || ' parcelas',
         parcelas = p_parcelas
   where id = p_lancamento_id;

  return v_criadas;
end;
$$;

-- ── Venda manual, à vista ou parcelada ─────────────────────────────────────
--
-- Precisa de DROP porque a assinatura mudou duas vezes: entraram dois
-- parâmetros com default (que sozinhos criariam uma sobrecarga ambígua para
-- quem chama com os oito nomes de antes) e o retorno ganhou o cronograma.
drop function if exists registrar_venda_manual(
  jsonb, text, text, timestamptz, text, text, text, text
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
  -- 1 (ou nulo) é a venda à vista de sempre — byte a byte o que era gravado
  -- antes desta migração. De 2 a 48, a venda nasce a receber.
  p_parcelas smallint default 1,
  p_intervalo_dias int default 30
)
returns table (pedido_id text, total numeric, ml_baixado numeric, parcelas jsonb)
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
  -- muda com o parcelamento — o perfume saiu do frasco hoje, tenha o dinheiro
  -- entrado ou não.
  select baixar_estoque_do_pedido(v_id, p_operador) into v_ml;

  v_descricao := 'Venda manual ' || v_id || coalesce(' – ' || v_nome, '');

  if coalesce(p_parcelas, 1) <= 1 then
    -- Caixa: entrada já baixada na conta escolhida.
    insert into lancamentos (
      id, ocorrido_em, competencia, descricao, categoria, categoria_id, conta_id,
      tipo, valor, recebido, baixado_em, recorrente, origem, pedido_id,
      chave_externa, criado_por
    ) values (
      'venda-' || v_id,
      p_ocorrido_em::date,
      date_trunc('month', p_ocorrido_em)::date,
      v_descricao,
      'Vendas', 'vendas', p_conta_id,
      'entrada', v_total, v_total, p_ocorrido_em::date, false,
      'Venda manual', v_id,
      'venda-' || v_id, p_operador
    );
  else
    -- Caixa: nada entra hoje. O total vira N parcelas a receber, todas na
    -- competência do mês da venda, cada uma no seu vencimento.
    v_modelo.id := 'venda-' || v_id;
    v_modelo.ocorrido_em := p_ocorrido_em::date;
    v_modelo.competencia := date_trunc('month', p_ocorrido_em)::date;
    -- A primeira parcela vence no dia da venda; o intervalo empurra as outras.
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

    perform gravar_parcelas_do_lancamento(v_modelo, p_parcelas, p_intervalo_dias);

    -- O cronograma devolvido é LIDO de volta do que foi gravado, não recalculado
    -- aqui: a tela de sucesso promete mostrar o que o banco escreveu.
    select coalesce(
             jsonb_agg(
               jsonb_build_object('numero', l.parcela, 'vence_em', l.vence_em, 'valor', l.valor)
               order by l.parcela
             ),
             '[]'::jsonb
           )
      into v_parcelas
      from lancamentos l
     where l.pedido_id = v_id and l.parcela is not null;
  end if;

  return query select v_id, v_total, coalesce(v_ml, 0), v_parcelas;
end;
$$;

-- ── O grant que o DROP devolve ─────────────────────────────────────────────
--
-- `drop function` + `create function` não SUBSTITUI a função: cria um objeto
-- novo, e todo objeto novo nasce com `execute` para PUBLIC — o que inclui
-- `anon`. Isso desfaz, em silêncio, exatamente o que a migration
-- 20260817020515 fechou (e o comentário dela cita esta função pelo nome).
-- `registrar_venda_manual` é SECURITY DEFINER: ela roda como `postgres` e passa
-- por cima do RLS ligado naquela mesma migration, então uma chamada RPC anônima
-- com a NEXT_PUBLIC_SUPABASE_ANON_KEY — que está num repositório PÚBLICO —
-- gravaria pedido, faturamento e baixa de estoque sem sessão nenhuma.
--
-- Regra para quem mexer aqui depois: todo `drop function` neste arquivo precisa
-- do `revoke` correspondente no fim, com a assinatura NOVA.
revoke execute on function public.registrar_venda_manual(
  jsonb, text, text, timestamptz, text, text, text, text, smallint, int
) from anon, authenticated, public;

-- `gravar_parcelas_do_lancamento` nasceu nesta migration, então também nasceu
-- com o grant. Ela é `invoker` e hoje esbarraria nos grants revogados de
-- `lancamentos`, mas depender disso é depender de uma segunda tranca para
-- justificar a primeira aberta.
revoke execute on function public.gravar_parcelas_do_lancamento(lancamentos, smallint, int)
  from anon, authenticated, public;
