-- ═══════════════════════════════════════════════════════════════════════════
-- Venda manual: desconto, comprovante — e o PIX que era contado duas vezes.
--
-- O dono pediu duas coisas ao registrar a venda de balcão/WhatsApp: aplicar o
-- DESCONTO que ele combina na hora (a cliente pagou por PIX e levou 10%) e
-- guardar o COMPROVANTE do pagamento. Investigando o pedido apareceu um
-- terceiro defeito, mais grave que os dois:
--
-- ── O caixa dobrado ───────────────────────────────────────────────────────
--
-- A venda manual sempre criou um lançamento de caixa na conta escolhida. Se a
-- conta escolhida for a do Mercado Pago — a única cujo extrato o ERP lê — o
-- MESMO PIX entra duas vezes no saldo, porque `contas_saldo` soma, para conta
-- sem `saldo_informado`, as linhas do extrato MAIS os lançamentos cuja origem
-- não começa com 'Extrato ' (CTEs `do_extrato` e `manuais` da view). O
-- lançamento "Venda manual MAN-0004" e a linha "payment" que o extrato do
-- gateway traz no dia seguinte são o mesmo dinheiro, e nada no banco sabia
-- disso. Medido: a conta mercado-pago tem `saldo_informado` nulo e 379 linhas
-- de extrato; todas as outras contas têm saldo informado e zero linhas.
--
-- A partir daqui, quando a conta escolhida TEM extrato lido, a venda grava
-- pedido + itens + baixa de estoque/insumos como sempre, mas NÃO cria
-- lançamento: naquela conta o extrato é o dono do caixa. É exatamente assim
-- que os 667 pedidos da loja já funcionam — nenhum deles tem lançamento
-- próprio, o caixa deles é a linha do extrato. Nas contas sem extrato (Inter,
-- Sicoob, Rafael PF, dinheiro) nada muda: o lançamento continua nascendo aqui,
-- porque sem ele aquele dinheiro não existiria em lugar nenhum.
--
-- ── O desconto ────────────────────────────────────────────────────────────
--
-- `pedido_itens.preco` continua sendo o preço de TABELA e `pedidos.valor`
-- passa a ser o LÍQUIDO (Σ preço × qtd − desconto). Não é invenção desta
-- migração: é a convenção que a loja já pratica — 535 dos 663 pedidos pagos da
-- Yampi têm `valor` menor que a soma dos itens, porque o cupom sempre veio
-- embutido. O que faltava era registrar o abatimento em algum lugar, e é só
-- para isso que serve a coluna nova: nenhuma view a lê.
--
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Onde o desconto e o comprovante moram ──────────────────────────────

-- `numeric(12,2)` como as irmãs de dinheiro da mesma tabela (valor, frete,
-- cashback). Sem a escala, `valor` arredondaria para dois centavos no insert e
-- `desconto` não: a ficha do pedido passaria a mostrar três números que não
-- fecham entre si, que é exatamente o que esta coluna existe para evitar.
alter table pedidos add column if not exists desconto numeric(12,2) not null default 0;
alter table pedidos add column if not exists comprovante text;

-- O default 0 é a verdade para os 667 pedidos que já existem, não um "não
-- sabemos": o desconto dos cupons da Yampi nunca foi separado em campo nenhum,
-- sempre chegou embutido no valor do pedido.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.pedidos'::regclass and conname = 'pedidos_desconto_nao_negativo'
  ) then
    alter table pedidos
      add constraint pedidos_desconto_nao_negativo check (desconto >= 0);
  end if;
end $$;

comment on column pedidos.desconto is
  'Abatimento em reais concedido na venda. `valor` já é o LÍQUIDO (Σ preço × qtd − desconto) e `pedido_itens.preco` continua sendo o preço de tabela: esta coluna existe só para as telas poderem explicar a diferença entre um e outro. Nenhuma view soma daqui — em particular, NÃO use `cashback`, que `receita_por_competencia` já publica como "descontos" e a DRE subtrai.';
comment on column pedidos.comprovante is
  'Caminho no bucket privado `financeiro` do comprovante de pagamento da venda. Null = não anexado. A leitura é sempre por URL assinada de vida curta, gerada no servidor. Mora no PEDIDO e não no lançamento porque a venda parcelada tem vários lançamentos e um comprovante só.';

-- ── 2. O bucket do comprovante ────────────────────────────────────────────
--
-- Molde do bucket `devolucoes` (20260814000036), com uma diferença que lá
-- custou um conserto em migração separada: `application/pdf` entra desde o
-- primeiro dia. Comprovante de PIX quase sempre é PDF, e o Storage recusa o
-- upload com erro de API quando o MIME não está na lista — a validação da
-- action passa e o arquivo morre no fim do caminho.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'financeiro', 'financeiro', false,
  8388608, -- 8 MB por arquivo: PDF de comprovante e print de celular cabem com folga
  array[
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'
  ]
)
on conflict (id) do nothing;

-- Sem policy, de propósito: `storage.objects` tem RLS ligada e ZERO políticas,
-- e é isso — não o flag `public = false` sozinho — que mantém o bucket fechado
-- para anon e authenticated. Quem lê e escreve é a service role do servidor,
-- que passa por cima do RLS. Criar aqui uma política "só para funcionar"
-- abriria o comprovante para qualquer um com a chave anônima, que está num
-- repositório PÚBLICO.

-- Sobre o `devolucoes`: conferido antes de escrever esta migração — ele JÁ
-- aceita `application/pdf` desde 20260814000037 (e vídeo desde 20260815000054).
-- Não há o que consertar lá; qualquer update aqui seria linha morta.

-- ── 3. registrar_venda_manual ─────────────────────────────────────────────
--
-- Muda o retorno, então precisa de drop + create. O `revoke` que esse par
-- obriga está no fim do arquivo, junto da explicação.
drop function if exists public.registrar_venda_manual(
  jsonb, text, text, timestamptz, text, text, text, text, smallint, integer, smallint, date
);

create function public.registrar_venda_manual(
  p_itens jsonb,
  p_conta_id text,
  p_canal text default 'manual',
  p_ocorrido_em timestamptz default now(),
  p_cliente_nome text default null,
  p_observacao text default null,
  p_operador text default 'Venda manual',
  p_cliente_email text default null,
  p_parcelas smallint default 1,
  p_intervalo_dias integer default 30,
  p_ja_recebidas smallint default null,
  p_recebidas_em date default null,
  p_desconto numeric default 0,
  p_transacao_id text default null
)
returns table (
  pedido_id text,
  bruto numeric,
  desconto numeric,
  total numeric,
  total_recebido numeric,
  ml_baixado numeric,
  parcelas jsonb,
  caixa_no_extrato boolean
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id text;
  v_bruto numeric := 0;
  v_desconto numeric := coalesce(p_desconto, 0);
  v_total numeric := 0;
  v_ml numeric := 0;
  v_item jsonb;
  v_cliente_id uuid;
  v_seq integer;
  v_nome text := nullif(trim(coalesce(p_cliente_nome, '')), '');
  v_email text := nullif(lower(trim(coalesce(p_cliente_email, ''))), '');
  v_transacao text := nullif(trim(coalesce(p_transacao_id, '')), '');
  v_descricao text;
  v_modelo lancamentos;
  v_parcelas jsonb := '[]'::jsonb;
  v_n smallint := coalesce(p_parcelas, 1);
  -- Sem K informado, cada ramo mantém o que fazia antes desta migração.
  v_ja smallint := coalesce(p_ja_recebidas, case when coalesce(p_parcelas, 1) <= 1 then 1 else 0 end);
  v_recebidas_em date := coalesce(p_recebidas_em, p_ocorrido_em::date);
  v_recebido numeric := 0;
  v_conta_tem_extrato boolean := false;
begin
  if p_itens is null or jsonb_array_length(p_itens) = 0 then
    raise exception 'Informe ao menos um item na venda.';
  end if;
  if not exists (select 1 from contas_bancarias where id = p_conta_id and ativa) then
    raise exception 'Conta % não existe ou está inativa.', p_conta_id;
  end if;

  -- ── O caixa da conta com extrato não é escriturado aqui ─────────────────
  --
  -- `contas_saldo` calcula o saldo da conta SEM `saldo_informado` somando as
  -- linhas do extrato (CTE `do_extrato`) MAIS os lançamentos cuja origem não
  -- começa com 'Extrato ' (CTE `manuais`). Um lançamento "Venda manual" na
  -- conta do Mercado Pago e a linha "payment" que a importação do extrato
  -- traz depois são o MESMO PIX — e a view somaria os dois, inflando o saldo
  -- em exatamente o valor de cada venda de balcão registrada ali.
  --
  -- Por isso: conta com extrato lido não recebe lançamento nenhum desta
  -- função. O que entra de dinheiro naquela conta chega pelo extrato, que é a
  -- fonte da verdade dela — é assim que os 667 pedidos da loja já funcionam.
  -- O pedido, os itens e a baixa de estoque continuam sendo gravados: o que
  -- some é só a perna de caixa, que teria dono duplo.
  --
  -- Descoberto pela presença de linhas, nunca por id de conta chumbado: no dia
  -- em que o Inter passar a ter extrato importado, a regra passa a valer para
  -- ele sozinha. O filtro `not ignorado` é o mesmo da view — a tela decide o
  -- que oferecer ao operador por `contas_saldo.linhas_extrato`, e as duas
  -- decisões precisam sair da mesma contagem, ou a tela oferece parcelamento
  -- que esta função recusa.
  --
  -- `saldo_informado` entra na conta porque a view tem DOIS ramos, e é ele que
  -- decide qual vale. Sem saldo informado, saldo = extrato + lançamentos
  -- não-extrato (é aí que o caixa dobra). COM saldo informado, saldo = a foto
  -- mais os lançamentos não-extrato posteriores a ela — e as linhas do extrato
  -- não contam. Se alguém informar um saldo para o Mercado Pago (a tela de
  -- Contas permite, num clique), pular o lançamento faria o dinheiro da venda
  -- sumir do saldo sem erro nenhum: o defeito espelhado do que esta regra veio
  -- matar.
  v_conta_tem_extrato := exists (
    select 1 from extrato_linhas where conta_id = p_conta_id and not ignorado
  ) and (select saldo_informado from contas_bancarias where id = p_conta_id) is null;

  -- A faixa de K é conferida aqui também, e não só dentro de
  -- `gravar_parcelas_do_lancamento`, porque o ramo de uma parcela não passa
  -- por ela — e "2 parcelas já recebidas" numa venda sem parcelamento marcaria
  -- como recebido o dobro do que a venda vale.
  if v_ja < 0 or v_ja > greatest(v_n, 1) then
    raise exception 'não dá para marcar % parcelas já recebidas em uma venda de %', v_ja, greatest(v_n, 1);
  end if;

  -- Recusa antes de gravar qualquer coisa: parcelar aqui produziria N
  -- lançamentos que ninguém pode criar nesta conta, e o crédito chega inteiro
  -- pelo extrato de qualquer forma.
  if v_conta_tem_extrato and v_n > 1 then
    raise exception 'A venda nesta conta não pode ser parcelada: o crédito chega inteiro pelo extrato da conta, e é ele que dá baixa no caixa. Para parcelar, escolha uma conta sem extrato importado.';
  end if;

  -- O id do pagamento é digitado à mão, de um número de dez dígitos copiado do
  -- painel do gateway — é onde o erro de digitação mora. A chave primária de
  -- `pedido_transacoes` é (pedido_id, transacao_id), então o mesmo id em dois
  -- pedidos entra sem reclamar, e `ligar_extrato_por_transacao` casa por
  -- `documento = any(identificadores)` sem desempate: a linha do extrato que
  -- chegasse depois seria carimbada no pedido errado. Recusa antes de gravar.
  if v_transacao is not null
     and exists (select 1 from pedido_transacoes where transacao_id = v_transacao) then
    raise exception 'Este ID de pagamento já está vinculado a outro pedido. Confira o número no painel do gateway.';
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
    v_bruto := v_bruto + (v_item->>'preco')::numeric * (v_item->>'quantidade')::numeric;
  end loop;

  if v_bruto <= 0 then
    raise exception 'O total da venda precisa ser maior que zero.';
  end if;
  if v_desconto < 0 then
    raise exception 'O desconto não pode ser negativo.';
  end if;
  if v_desconto >= v_bruto then
    raise exception 'O desconto não pode ser igual ou maior que o total dos itens.';
  end if;

  v_total := v_bruto - v_desconto;

  -- Redundante com a guarda do desconto acima, e fica de propósito: é a última
  -- linha de defesa da invariante que o resto da função assume (venda vale
  -- mais que zero), e ela sobrevive a quem mexer nas contas do bruto.
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
  --
  -- `valor` recebe o LÍQUIDO e `desconto` o abatimento: quem soma faturamento
  -- soma o que entrou, e quem precisa explicar a diferença para a soma dos
  -- itens tem de onde tirar.
  insert into pedidos (
    id, cliente_id, canal, valor, desconto, frete, cashback, pagamento, envio, situacao,
    comprado_em, entrega_local, estoque_fora_do_controle, destino
  ) values (
    v_id, v_cliente_id, p_canal::canal_venda, v_total, v_desconto, 0, 0, 'pago', 'entregue', 'entregue',
    p_ocorrido_em, true, false,
    coalesce(v_nome, 'Venda manual') ||
      coalesce(' · ' || nullif(trim(coalesce(p_observacao, '')), ''), '')
  );

  -- O id do item é uuid com default do banco: montar um texto próprio aqui
  -- quebraria o insert. O preço gravado é o de TABELA, sem rateio do desconto:
  -- ratear apagaria de que preço a venda partiu, e é esse preço que o Produto
  -- 360º e a margem por item leem.
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
  -- muda com o parcelamento, com K nem com o desconto — o perfume saiu do
  -- frasco hoje, tenha o dinheiro entrado ou não. Esta chamada é a ÚNICA que
  -- mexe em estoque nesta função, e continua sendo feita uma vez só:
  -- `baixar_estoque_do_pedido` tem guarda de reentrada e devolveria 0 numa
  -- segunda passagem, mas quem parcela dinheiro não tem por que chamá-la de novo.
  select baixar_estoque_do_pedido(v_id, p_operador) into v_ml;

  v_descricao := 'Venda manual ' || v_id || coalesce(' – ' || v_nome, '');

  if v_conta_tem_extrato then
    -- Nenhum lançamento: ver o bloco do caixa dobrado, lá em cima.
    --
    -- O id do pagamento no gateway, quando o operador informa, faz o casamento
    -- com a linha do extrato deixar de ser por "mesmo dia e mesmo valor" e
    -- passar a ser por igualdade exata — que é como os pedidos importados já
    -- conciliam.
    if v_transacao is not null then
      insert into pedido_transacoes (
        pedido_id, transacao_id, gateway, status, valor, parcelas, identificadores, lido_em
      ) values (
        v_id, v_transacao, 'mercadopago', 'pago', v_total, 1, array[v_transacao], now()
      );
    end if;

    -- Zero recebido no retorno não quer dizer venda fiada: quer dizer que o
    -- caixa desta venda não é escriturado por esta função. Quem conta essa
    -- parte é o extrato da conta.
    v_recebido := 0;
    v_parcelas := '[]'::jsonb;
  elsif v_n <= 1 then
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
    -- O que se parcela é o LÍQUIDO: o desconto sai antes de dividir, senão as
    -- parcelas somariam mais do que o cliente deve.
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

  return query select
    v_id, v_bruto, v_desconto, v_total, v_recebido,
    coalesce(v_ml, 0), v_parcelas, v_conta_tem_extrato;
end;
$function$;

-- ── 4. prever_repasses não espera repasse de venda de balcão ──────────────
--
-- MAN-0001 nasceu com repasse previsto de 14,94% e `recebido` nulo — como se
-- um gateway fosse creditar aquele dinheiro depois. Ninguém vai: a venda de
-- balcão paga em dinheiro, ou por PIX direto no Inter, não passa por
-- intermediador nenhum. E `dispensar_conciliacao_sem_extrato` nunca alcança
-- essa linha, porque ela só dispensa pedido anterior ao primeiro dia com
-- extrato (09/06/2026) — então a venda de balcão vira pendência ETERNA na
-- tela de Conciliação, e a tela deixa de significar alguma coisa.
--
-- O critério é o CANAL, e nenhuma venda manual prevê repasse — nem a paga por
-- link do Mercado Pago. A taxa prevista sai de `parametros_precificacao
-- .intermediador_pct`, hoje 14,940%, que é a régua do checkout parcelado; um
-- PIX no Mercado Pago custa perto de 1%. Prever 14,94% aqui faria a venda cair
-- em "Precisam de ação" como `taxa_divergente` no instante em que o crédito
-- chegasse — o dono abriria a fila de problemas e encontraria a venda que ele
-- mesmo registrou certo. E a taxa REAL não se perde por isso: o ramo "Tarifa do
-- gateway" de `converter_extrato_em_caixa` lança a diferença entre o valor do
-- pedido e o valor creditado. O extrato é a verdade; a previsão só atrapalha.
create or replace function public.prever_repasses()
returns integer
language plpgsql
as $function$
declare
  v_taxa  numeric;
  v_novos integer;
begin
  select intermediador_pct into v_taxa
    from parametros_precificacao order by vigente_desde desc limit 1;

  insert into repasses (pedido_id, origem, taxa_pct)
  select p.id,
         initcap(p.canal::text) || ' · ' || initcap(p.pagamento::text),
         coalesce(v_taxa, 0)
    from pedidos p
   where not exists (select 1 from repasses r where r.pedido_id = p.id)
     -- Canais da venda manual (os três que a tela oferece). Fora deles —
     -- yampi, shopify — todo pedido nasceu de um checkout com gateway.
     and p.canal::text not in ('manual', 'whatsapp', 'instagram');

  get diagnostics v_novos = row_count;
  return v_novos;
end;
$function$;

-- ── 5. O repasse fantasma que já está lá ──────────────────────────────────
--
-- Consertar a função não apaga o que ela já criou: MAN-0001 continuaria
-- pendente para sempre na Conciliação. `recebido is null` é a trava que
-- importa — repasse de venda manual que alguém chegou a conciliar com dinheiro
-- de verdade não é fantasma e não pode ser apagado por uma faxina.
delete from repasses r
 using pedidos p
 where p.id = r.pedido_id
   and p.canal::text in ('manual', 'whatsapp', 'instagram')
   and r.recebido is null;

-- ── O revoke que o `drop function` acima obriga ───────────────────────────
--
-- `create or replace` preserva os privilégios do objeto; `drop` + `create` NÃO,
-- porque o segundo é um objeto novo. A 20260819010000 fechou isso na raiz com
-- `alter default privileges`, mas ela vale para funções criadas pelo papel
-- `postgres` — e esta função é SECURITY DEFINER, roda por cima do RLS e grava
-- pedido, faturamento e baixa de estoque. Já aconteceu antes
-- (20260817170000): um drop+create devolveu `anon=X` e um POST em
-- /rest/v1/rpc/registrar_venda_manual com a chave anônima — que está num
-- repositório PÚBLICO — gravava venda sem sessão nenhuma.
--
-- Regra para quem mexer aqui depois: todo `drop function` neste arquivo precisa
-- do `revoke` correspondente no fim, com a assinatura NOVA.
revoke execute on function public.registrar_venda_manual(
  jsonb, text, text, timestamptz, text, text, text, text, smallint, integer, smallint, date,
  numeric, text
) from anon, authenticated, public;

-- E o grant que o mesmo `drop` obriga do outro lado: quem chama esta função é
-- a service role do servidor. Ela vinha ganhando execute pelos default
-- privileges do Supabase, mas o botão "Registrar venda" morre inteiro se um
-- dia não vier — e dependência silenciosa que só falha em produção não é
-- dependência, é armadilha.
grant execute on function public.registrar_venda_manual(
  jsonb, text, text, timestamptz, text, text, text, text, smallint, integer, smallint, date,
  numeric, text
) to service_role;
