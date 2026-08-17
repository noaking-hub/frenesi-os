-- PARCELA QUE JÁ FOI RECEBIDA — o parcelamento com K parcelas retroativas.
--
-- O relato que obrigou esta migração, com a tela de edição aberta na frente do
-- dono: "eu parcelei essa venda em 2x, mas o lançamento eu só fiz depois que
-- recebi a primeira parcela". O ERP tinha gravado `venda-MAN-0001` inteira e
-- baixada — R$ 216,00 recebidos em 12/08 — quando só R$ 108,00 tinham entrado.
-- E não havia como corrigir: `parcelar_lancamento` abortava em "lançamento já
-- baixado não parcela", e `gravar_parcelas_do_lancamento` cravava `recebido = 0`
-- em TODA parcela, sem nenhuma noção de "esta aqui já foi paga".
--
-- O modelo que passa a existir, e que atende os dois lugares com um mecanismo
-- só (parcelar um lançamento existente e a venda que já nasce parcelada):
--
--   "dividir R$ X em N parcelas, das quais as K primeiras já foram recebidas em
--    <data>, e as demais vencem a cada <intervalo> dias"
--
-- Com K = 0 isto é, linha por linha, o parcelamento que o ERP já fazia — os
-- parâmetros novos entram com default (0 e null) justamente para que nenhuma
-- chamada existente mude de comportamento. Com K = 1 é o caso do dono. Não há
-- caminho novo: `gravar_parcelas_do_lancamento` continua sendo o único lugar
-- que sabe repartir valor e espaçar vencimento, e ganhou K ali dentro. Dois
-- caminhos para o mesmo fato divergiriam no primeiro conserto que alguém
-- fizesse em um só deles.
--
-- ── O invariante, que é o coração desta migração ──────────────────────────
--
--   o total marcado como recebido DEPOIS do parcelamento não pode ser MAIOR do
--   que o que já estava recebido ANTES.
--
-- Passar disso é o ERP inventar dinheiro: apareceria na conta uma entrada que
-- nunca existiu no extrato. Por isso o bloqueio antigo ("já baixado não
-- parcela") deixa de ser absoluto e vira esta comparação — lançamento baixado
-- PODE parcelar, desde que as K parcelas recebidas caibam no que já foi
-- recebido.
--
-- Ficar MENOR é correção legítima, e é exatamente o caso do dono: R$ 216,00
-- estavam marcados como recebidos, R$ 108,00 entraram de verdade. Nesse caso o
-- saldo da conta CAI de propósito, e isso não é efeito colateral, é o conserto.
-- Medido no banco antes de escrever esta função, para a tela poder avisar com
-- número: o `saldo_calculado` do Inter cai exatamente R$ 108,00 (29.355,45 →
-- 29.247,45) e a divergência do diálogo "Calculado pelo ERP" encolhe na mesma
-- medida; já o `saldo_disponivel` — o número que Contas e Caixas, o dashboard e
-- o fluxo exibem — NÃO se mexe, porque está ancorado num saldo informado para
-- 2026-08-17 e só soma baixas posteriores a essa data, e a baixa de 12/08 já
-- estava fora dessa conta antes. Quem for escrever o aviso na tela precisa
-- dizer qual dos dois saldos cai, ou o dono vai conferir o número errado.
--
-- ── Por que K parcelas baixadas, e nunca uma parcela com baixa parcial ─────
--
-- A tentação seria gravar uma linha só com `recebido = 108` de `valor = 216`.
-- Não serve, e há duas cicatrizes no banco provando: (1) `registrar_recebimento`
-- zera `baixado_em` em toda baixa parcial (o `case` sem `else` na migração
-- 20260810000014, linha 350), e hoje R$ 1.019,00 já recebidos em LC-00013,
-- LC-00014 e LC-00018 estão invisíveis para TODAS as views de saldo, que exigem
-- `baixado_em is not null`; (2) `fluxo_de_caixa` só enxerga `recebido` quando há
-- `baixado_em`, e o restante da linha some do fluxo. Uma parcela é uma linha,
-- ou paga ou aberta.

-- Os dois DROPs são obrigatórios, não higiene: `create or replace` com
-- parâmetros a mais cria uma SOBRECARGA em vez de substituir, e aí a chamada
-- antiga de três argumentos (que a action ainda faz) ficaria ambígua entre as
-- duas versões e morreria em "function is not unique".
drop function if exists gravar_parcelas_do_lancamento(lancamentos, smallint, int);
drop function if exists parcelar_lancamento(text, smallint, int);

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
  p_intervalo_dias int default 30,
  -- K: quantas das PRIMEIRAS parcelas já foram recebidas. O default 0 é o
  -- parcelamento de sempre — nenhum chamador antigo muda de comportamento.
  p_ja_recebidas smallint default 0,
  -- A data em que essas K entraram. Retroativa, quase sempre: é o dia em que o
  -- dinheiro caiu na conta, não o dia em que o operador está digitando.
  p_recebidas_em date default null
) returns integer
language plpgsql
set search_path = public
as $$
declare
  v_valor numeric;
  v_resto numeric;
  v_valor_i numeric;
  v_primeiro_venc date;
  v_ja smallint := coalesce(p_ja_recebidas, 0);
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

  -- K vive entre 0 e N. Marcar mais parcelas recebidas do que existem daria
  -- baixa numa parcela que ninguém criou, e a soma do que "entrou" passaria do
  -- valor do lançamento.
  if v_ja < 0 then
    raise exception 'não existe número negativo de parcelas já recebidas';
  end if;
  if v_ja > p_parcelas then
    raise exception 'não dá para marcar % parcelas já recebidas em um parcelamento de %',
      v_ja, p_parcelas;
  end if;
  -- Baixa sem dia não entra no fluxo de caixa: `fluxo_de_caixa` usa
  -- `coalesce(baixado_em, vence_em)` para saber em que coluna o dinheiro se
  -- moveu. Assumir `current_date` aqui jogaria um recebimento de 12/08 no dia
  -- do cadastro, e o dono só descobriria conferindo o extrato.
  if v_ja > 0 and p_recebidas_em is null then
    raise exception 'informe a data em que as parcelas já recebidas entraram';
  end if;

  -- O centavo do arredondamento vai na PRIMEIRA parcela, não na última: quem
  -- confere o boleto de hoje encontra a diferença agora, e não daqui a 11
  -- meses. `dividirEmParcelas`, em src/domain/parcelamento.ts, é o espelho
  -- desta conta — é ela que desenha a prévia, e o teste dela existe para que
  -- prévia e gravação nunca discordem em um centavo.
  v_valor := trunc(p_modelo.valor / p_parcelas, 2);
  v_resto := p_modelo.valor - (v_valor * p_parcelas);

  -- Parcela de R$ 0,00 existe na aritmética (R$ 0,01 em 2) e NÃO existe na
  -- tabela: `lancamentos_valor_check` exige valor > 0. Sem esta recusa o erro
  -- chegaria ao operador como violação de constraint em inglês, dentro de um
  -- catch genérico. `planejarParcelamento` recusa o mesmo caso na prévia, com
  -- a mesma razão, antes do clique.
  if v_valor <= 0 then
    raise exception 'não dá para dividir R$ % em % parcelas: sobraria parcela de R$ 0,00',
      to_char(p_modelo.valor, 'FM999999990.00'), p_parcelas;
  end if;

  -- A âncora do cronograma é a data da PRIMEIRA parcela, e com K > 0 essa data
  -- já está decidida: é o dia em que a parcela 1 foi recebida — a mesma que o
  -- laço carimba nela logo abaixo. Ancorar em outra coisa faria a função usar
  -- duas datas diferentes para a mesma parcela: no caso do dono, com a 1ª
  -- recebida em 12/08 e competência 01/08, a 2ª cairia em 31/08 — dezenove
  -- dias depois do pagamento, e não os 30 que ele pediu.
  --
  -- Com K = 0 nada muda: sem vencimento definido, a competência serve de
  -- âncora, porque um compromisso "previsto" ainda precisa cair em algum dia
  -- para entrar na projeção.
  v_primeiro_venc := case when v_ja > 0 then p_recebidas_em
                          else coalesce(p_modelo.vence_em, p_modelo.competencia) end;

  for i in 1..p_parcelas loop
    -- Uma variável só para o valor da parcela, usada em `valor` e em `recebido`:
    -- se as duas colunas fossem calculadas por expressões separadas, um conserto
    -- em uma delas deixaria a parcela paga com saldo aberto de um centavo.
    v_valor_i := v_valor + case when i = 1 then v_resto else 0 end;

    insert into lancamentos (
      id, ocorrido_em, competencia, vence_em, descricao, categoria, categoria_id,
      centro_custo, conta_id, tipo, valor, recebido, baixado_em, origem, favorecido,
      documento, observacao, parcela, parcelas, pai_id, criado_por,
      pedido_id, chave_externa
    ) values (
      p_modelo.id || '-' || i,
      p_modelo.ocorrido_em,
      -- A competência de TODAS é a do fato: a venda aconteceu uma vez só. O que
      -- se espalha pelos vencimentos é o caixa, não o resultado. Distribuir a
      -- competência faria a receita de agosto reaparecer em setembro e outubro.
      p_modelo.competencia,
      -- A parcela já recebida vence no dia em que foi recebida. Manter nela o
      -- vencimento calculado poria data futura numa linha que já está quitada,
      -- e a coluna "vence" contradiria o "baixado em" da mesma linha. As demais
      -- somam dias CORRIDOS, não "todo dia 7": 07/09 + 30 + 30 é 06/11. A tela
      -- mostra a data calculada justamente para não prometer "mensal" e
      -- entregar 06/11.
      case when i <= v_ja then p_recebidas_em
           else v_primeiro_venc + ((i - 1) * p_intervalo_dias) end,
      p_modelo.descricao || ' (' || i || '/' || p_parcelas || ')',
      p_modelo.categoria, p_modelo.categoria_id, p_modelo.centro_custo, p_modelo.conta_id,
      p_modelo.tipo,
      v_valor_i,
      -- As K primeiras nascem QUITADAS: recebido igual ao valor e baixado_em na
      -- data informada. As demais nascem inteiramente a receber, com
      -- `baixado_em` nulo — para elas, parcelar continua sendo o oposto de
      -- baixar. Ou a parcela está paga por inteiro, ou está aberta por inteiro:
      -- baixa parcial numa parcela cairia na cicatriz do `case` sem `else` de
      -- `registrar_recebimento`, que apaga a data e some com o dinheiro das
      -- views de saldo.
      case when i <= v_ja then v_valor_i else 0 end,
      case when i <= v_ja then p_recebidas_em else null end,
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

comment on function gravar_parcelas_do_lancamento(lancamentos, smallint, int, smallint, date) is
  'Escreve um lançamento repartido em N vencimentos, das quais as K primeiras já nascem quitadas. Único lugar do sistema que sabe dividir o valor e espaçar as datas.';

-- ── Parcelar um compromisso que já existe ──────────────────────────────────
--
-- Mesmo resultado gravado de antes quando K = 0: o corpo só terceirizou o laço
-- de INSERT e ganhou o invariante. O que ele continua fazendo sozinho é o que
-- só faz sentido quando há um pai: lê o original, decide o que a parcela NÃO
-- herda dele, confere que o parcelamento não inventa dinheiro, e cancela o
-- original no fim.
create or replace function parcelar_lancamento(
  p_lancamento_id text,
  p_parcelas smallint,
  p_intervalo_dias int default 30,
  p_ja_recebidas smallint default 0,
  p_recebidas_em date default null
) returns integer
language plpgsql
set search_path = public
as $$
declare
  v_pai lancamentos;
  v_modelo lancamentos;
  v_criadas int;
  v_ja smallint := coalesce(p_ja_recebidas, 0);
  v_recebidas_em date;
  v_recebido_novo numeric;
begin
  -- `for update` porque a decisão desta função depende de `v_pai.recebido`: uma
  -- baixa concorrente entre a leitura e o INSERT das parcelas faria o
  -- invariante ser conferido contra um número que já não vale.
  select * into v_pai from lancamentos where id = p_lancamento_id for update;
  if not found then raise exception 'lançamento % não existe', p_lancamento_id; end if;

  -- Parcelar um lançamento cancelado criaria filhas vivas de um pai morto e,
  -- pior, sobrescreveria `cancelado_motivo` — o histórico perderia por que ele
  -- tinha sido cancelado da primeira vez.
  if v_pai.cancelado_em is not null then
    raise exception 'lançamento cancelado não parcela';
  end if;

  -- O bloqueio antigo ("lançamento já baixado não parcela") ficava exatamente
  -- aqui e era absoluto. Ele saiu porque impedia o conserto legítimo: a venda
  -- parcelada cuja primeira parcela foi recebida ANTES de o lançamento existir.
  -- No lugar dele entrou o invariante, mais abaixo — o que precisa ser
  -- protegido nunca foi "estar baixado", foi "não inventar dinheiro".

  -- Sem data informada, a data do recebimento é a da baixa do próprio pai: se o
  -- lançamento está baixado, aquele é o dia em que o dinheiro entrou na conta.
  -- Quando o pai não tem baixa, `recebido` é 0 e o invariante já obriga K = 0,
  -- então a data nula nunca chega a ser usada.
  v_recebidas_em := coalesce(p_recebidas_em, v_pai.baixado_em);

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

  v_criadas := gravar_parcelas_do_lancamento(
    v_modelo, p_parcelas, p_intervalo_dias, v_ja, v_recebidas_em
  );

  -- ── O invariante: o parcelamento não pode inventar dinheiro ─────────────
  --
  -- A soma é lida do que foi REALMENTE gravado, e não recalculada aqui: uma
  -- segunda cópia da divisão discordaria da primeira no dia em que alguém
  -- mexesse só numa delas. As filhas acabaram de ser inseridas nesta mesma
  -- transação, e um segundo parcelamento do mesmo pai é impossível (os ids
  -- '<pai>-1', '<pai>-2' colidiriam na chave primária), então esta soma é
  -- exatamente a das parcelas criadas agora.
  select coalesce(sum(recebido), 0) into v_recebido_novo
    from lancamentos where pai_id = v_pai.id;

  -- MAIOR é o ERP inventando entrada que o extrato nunca teve. A exceção
  -- desfaz os INSERTs junto com a transação inteira.
  --
  -- MENOR é correção legítima, e passa de propósito: foi o caso que originou
  -- esta função (R$ 216,00 marcados como recebidos, R$ 108,00 recebidos de
  -- verdade). O saldo calculado da conta CAI, e essa queda é o conserto — quem
  -- chama precisa avisar o operador com o número antes de confirmar.
  if v_recebido_novo > v_pai.recebido + 0.005 then
    raise exception
      'este parcelamento marcaria R$ % como recebido, mas o lançamento só tem R$ % recebidos',
      to_char(v_recebido_novo, 'FM999999990.00'),
      to_char(v_pai.recebido, 'FM999999990.00');
  end if;

  -- O pai é cancelado, não apagado: sem ele o histórico perderia a origem das
  -- parcelas, e o `pai_id` de cada uma apontaria para o nada. O motivo diz o
  -- que aconteceu com o dinheiro quando K > 0 — é a única pista de por que o
  -- saldo da conta mudou junto. Com K = 0 o texto é o de sempre.
  update lancamentos
     set cancelado_em = now(),
         cancelado_motivo = 'substituído por ' || p_parcelas || ' parcelas' ||
           case when v_ja > 0
                then ' (' || v_ja || case when v_ja > 1 then ' já recebidas em ' else ' já recebida em ' end
                     || to_char(v_recebidas_em, 'DD/MM/YYYY') || ')'
                else '' end,
         parcelas = p_parcelas
   where id = p_lancamento_id;

  return v_criadas;
end;
$$;

comment on function parcelar_lancamento(text, smallint, int, smallint, date) is
  'Substitui um lançamento por N parcelas, das quais as K primeiras já nascem recebidas na data informada. Recusa quando o total recebido depois passaria do que já estava recebido antes.';

-- ── O grant que o DROP devolve ─────────────────────────────────────────────
--
-- Os dois `drop function` do topo criam objetos NOVOS, e objeto novo nasce com
-- `execute` para PUBLIC — inclusive `anon`. Ambas são `invoker` e hoje
-- esbarrariam nos grants revogados de `lancamentos`, mas "hoje" é a garantia
-- frágil que a migration 20260817020515 já recusou como postura. Fechado por
-- padrão; `service_role` continua com acesso, e é por ela que o ERP chama.
revoke execute on function public.gravar_parcelas_do_lancamento(lancamentos, smallint, int, smallint, date)
  from anon, authenticated, public;
revoke execute on function public.parcelar_lancamento(text, smallint, int, smallint, date)
  from anon, authenticated, public;
