-- A PARCELA NÃO PERDE O PEDIDO — o vínculo que o botão Parcelar cortava.
--
-- `20260817160000_parcela_que_ja_foi_recebida` derrubou o bloqueio "lançamento
-- já baixado não parcela" justamente para o dono poder consertar a
-- `venda-MAN-0001`: R$ 216,00 gravados como recebidos quando só R$ 108,00 da
-- primeira parcela tinham entrado. O conserto passou a ser possível — e cobrava
-- um preço que ninguém pediu: `parcelar_lancamento` zerava o `pedido_id` das
-- filhas. Depois do clique, as duas parcelas ficavam sem o MAN-0001, e o painel
-- "Pedido que originou este lançamento" perdia o cliente e os decants. Medido no
-- banco: `venda-MAN-0001` tem `pedido_id = 'MAN-0001'`, e as filhas nasciam com
-- null.
--
-- O zeramento era herança do parcelamento original (20260815000059), que nem
-- listava `pedido_id` no INSERT — a coluna caía no default nulo sem decisão
-- nenhuma. Enquanto o bloqueio de "já baixado" existia, quase nenhuma venda
-- chegava aqui; agora o caminho principal é exatamente uma venda com pedido.
--
-- ── Por que a justificativa que estava escrita não se sustenta ─────────────
--
-- O comentário anterior mandava o `pedido_id` embora "pelo mesmo motivo" da
-- `chave_externa`: não dar à conciliação três candidatos falsos para a mesma
-- linha do extrato. Vale para a chave, e só para ela — quem casa extrato com
-- lançamento é `chave_externa` (índice único `lancamento_chave_externa_unica`,
-- e o `on conflict (chave_externa)` de `converter_extrato_em_caixa`) ou
-- `extrato_linhas.lancamento_id`. Conferido objeto por objeto no banco: NENHUMA
-- view usa `lancamentos.pedido_id`, e das funções que o tocam
-- (`converter_extrato_em_caixa`, `classificar_extrato`, `registrar_venda_manual`)
-- todas ESCREVEM a coluna; nenhuma a lê para escolher candidato. No aplicativo
-- há um leitor só, `explicarLancamento` em src/data/financeiro.ts — o painel de
-- detalhe. Cortar o vínculo não protegia conciliação nenhuma: cegava a ficha.
--
-- Por isso a `chave_externa` continua sendo cortada logo abaixo, e o
-- `pedido_id` passa a ser herdado. As duas linhas parecem simétricas e nunca
-- foram: uma é identidade no sistema de origem, a outra é a venda que o dinheiro
-- paga.
--
-- ── E porque os dois caminhos precisam contar a mesma história ─────────────
--
-- `registrar_venda_manual` (20260817173000) grava as parcelas COM `pedido_id` —
-- o comentário de lá diz, com todas as letras, que "uma parcela sem `pedido_id`
-- abriria a tela que explica de onde veio o dinheiro sem nada para explicar".
-- Duas vendas de 2× idênticas para o dono, uma nascida parcelada e a outra
-- parcelada no dia seguinte, mostravam fichas diferentes. Divergência entre dois
-- caminhos do mesmo fato é o defeito que a migração anterior passou parágrafos
-- evitando no cálculo do valor — e deixou passar no vínculo.
--
-- ── O que muda de fato ─────────────────────────────────────────────────────
--
-- Só o futuro, e de propósito. O banco tem hoje três filhas de
-- `parcelar_lancamento` — LC-00015-1/2/3, o 212 Vip Black repartido em 3× — e o
-- pai delas, LC-00015, é um lançamento manual SEM pedido. O null nelas espelha o
-- null dele: não há vínculo perdido para devolver, e um UPDATE aqui não teria de
-- onde tirar pedido nenhum. Se um dia houver, o reparo entra em migração à parte
-- — reescrever linha de dinheiro no meio de uma troca de função esconde o reparo
-- dentro do conserto.
--
-- Na ficha das parcelas passam a aparecer: o pedido com cliente e itens, e a
-- seção "Lançamentos ligados a este" com as parcelas irmãs e o pai cancelado —
-- que a tela já rotula como `cancelado`, então o histórico fica legível em vez
-- de confuso.
--
-- `create or replace`, e não `drop` + `create`: a assinatura é a mesma, e assim
-- os privilégios do objeto seguem de pé. Objeto NOVO nasceria com `execute` para
-- PUBLIC — a armadilha que 20260817170000 teve de varrer o banco inteiro para
-- desfazer.
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

  -- Duas heranças cortadas de propósito — e `pedido_id` não é uma delas:
  --
  -- `chave_externa` é do registro de ORIGEM (a linha do extrato, o pagamento no
  -- gateway). O pai continua guardando a chave verdadeira, cancelado mas
  -- presente; derivar 'chave-1', 'chave-2' aqui inventaria chaves que nunca
  -- existiram no banco de origem e daria à conciliação três candidatos falsos
  -- para a mesma linha.
  v_modelo.chave_externa := null;
  -- `recorrente` marca o fato que se REPETE todo mês e gera lançamentos novos.
  -- Parcela é o contrário: um fato só, repartido em vencimentos. Herdar a marca
  -- faria a série se multiplicar sozinha.
  v_modelo.recorrente := false;

  -- `pedido_id` VAI JUNTO, e é o conserto desta migração — `v_modelo := v_pai`
  -- já o copiou, e a linha que o zerava saiu. Parcelar reparte o CAIXA de uma
  -- venda; a venda continua sendo a mesma, e é ela que a ficha da parcela
  -- precisa mostrar. Sem esta herança, o painel do lançamento perde cliente e
  -- itens no clique em que o dono só queria corrigir quanto tinha entrado.
  -- Nada aqui alimenta conciliação: quem casa extrato é `chave_externa`, e essa
  -- continua cortada acima.

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
  --
  -- A soma continua sendo por `pai_id`, e não por `pedido_id`: agora que a filha
  -- herda o pedido, somar por ele varreria também os OUTROS lançamentos da mesma
  -- venda (a tarifa do gateway, um estorno) e o invariante passaria a comparar
  -- coisas diferentes.
  select coalesce(sum(recebido), 0) into v_recebido_novo
    from lancamentos where pai_id = v_pai.id;

  -- MAIOR é o ERP inventando entrada que o extrato nunca teve. A exceção
  -- desfaz os INSERTs junto com a transação inteira.
  --
  -- MENOR é correção legítima, e passa de propósito: foi o caso que originou
  -- esta função (R$ 216,00 marcados como recebidos, R$ 108,00 recebidos de
  -- verdade). O saldo calculado da conta CAI, e essa queda é o conserto — quem
  -- chama precisa avisar o operador com o número antes de confirmar.
  --
  -- O TETO É O QUE ESTÁ NO CAIXA, NÃO O QUE ESTÁ NA COLUNA.
  --
  -- `v_pai.recebido` sozinho é teto frouxo, e o furo foi provado em produção:
  -- lançamento com `recebido > 0` e `baixado_em` NULO é dinheiro que NENHUMA
  -- view de saldo soma — `saldos_das_contas` exige `baixado_em is not null`.
  -- Parcelar um desses com uma parcela "já recebida" dá uma DATA àquele
  -- dinheiro, e ele aparece no caixa pela primeira vez. A soma de `recebido`
  -- não muda em nada, o invariante antigo passava liso, e o saldo subia.
  --
  -- Medido em clones descartáveis das três linhas reais que estão nessa
  -- situação (LC-00013, LC-00014, LC-00018 — R$ 1.019,00 de baixa parcial no
  -- Sicoob, cicatriz de `registrar_recebimento`): parcelar o clone de LC-00018
  -- em 2x com a primeira "recebida" deixava `recebido` idêntico, 150,00 antes e
  -- depois, e subia R$ 150,00 no saldo calculado. Com data posterior ao saldo
  -- informado, subia também no saldo EXIBIDO — o número do dashboard.
  --
  -- Pai sem baixa, portanto, tem teto ZERO: nenhuma filha nasce baixada. Quem
  -- precisar parcelar uma dessas linhas dá a baixa primeiro, com a data em que
  -- o dinheiro entrou de verdade, e aí parcela. É uma etapa a mais, e ela
  -- existe porque a alternativa é o ERP decidir sozinho quando um dinheiro sem
  -- data entrou na conta.
  if v_recebido_novo > (case when v_pai.baixado_em is null then 0 else v_pai.recebido end) + 0.005 then
    if v_pai.baixado_em is null then
      raise exception
        'este lançamento tem R$ % marcados como recebidos mas nenhuma data de baixa, então esse dinheiro não está em nenhum saldo. Dê a baixa com a data real antes de parcelar, senão o parcelamento faria o caixa subir R$ %',
        replace(to_char(v_pai.recebido, 'FM999999990.00'), '.', ','),
        replace(to_char(v_recebido_novo, 'FM999999990.00'), '.', ',');
    end if;
    raise exception
      'este parcelamento marcaria R$ % como recebido, mas o lançamento só tem R$ % recebidos',
      replace(to_char(v_recebido_novo, 'FM999999990.00'), '.', ','),
      replace(to_char(v_pai.recebido, 'FM999999990.00'), '.', ',');
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
  'Substitui um lançamento por N parcelas, das quais as K primeiras já nascem recebidas na data informada. As filhas herdam o pedido do pai e perdem a chave externa. Recusa quando o total recebido depois passaria do que já estava recebido antes.';
