-- A conversão passa a respeitar a linha que JÁ virou lançamento por outro
-- caminho. Sem isso, o mesmo movimento vira dois lançamentos.
--
-- `classificar_extrato` — o clique "Classificar" do Extrato e a regra
-- automática, que usa a mesma função — grava o lançamento assim:
--
--   id            = 'LC-00042'
--   chave_externa = NULL          ← e é aqui que a arbitragem cega
--
-- e carimba `extrato_linhas.lancamento_id`. Como todo `on conflict` desta
-- função arbitra por `chave_externa`, e nenhum dos INSERTs olhava
-- `lancamento_id`, o conversor não enxergava esse lançamento: inseria um
-- segundo, 'ext-' || chave, para a MESMA linha. Pior, o UPDATE do fim
-- repontava a linha do 'LC-00042' para o 'ext-…', deixando o lançamento da
-- regra órfão — no caixa, sem nenhuma linha de extrato apontando para ele, e
-- portanto invisível na tela que o criou.
--
-- É a mesma lição da migration 20260817010900, na outra ponta: lá as duas
-- colunas-chave divergiam e a exceção derrubava a conversão inteira; aqui a
-- chave simplesmente não existe, e em vez de estourar o sistema duplica em
-- silêncio. Chave nula não conflita com nada.
--
-- Nunca disparou até hoje porque o conversor sempre chegava primeiro: a
-- rotina o chamava no topo da rodada, toda linha já nascia com
-- `lancamento_id`, e `aplicar_regras_categoria` — que exige
-- `lancamento_id is null` — não encontrava nada (zero linhas casam com as 9
-- regras neste momento, todas já convertidas). A importação agora roda de
-- verdade a cada hora e aplica as regras ANTES de converter, de propósito.
-- O primeiro Meta ADS ou pagamento de motoboy que chegar como "Compra paga
-- pela conta", ganhar contraparte no enriquecimento e casar com uma regra
-- viraria duas saídas do mesmo dinheiro.
--
-- A guarda é `lancamento_id is null` nos quatro INSERTs cuja chave é a da
-- própria linha. A tarifa (segundo INSERT) fica de fora: ela é a metade
-- que acompanha a venda e tem chave própria ('taxa-' || chave), então
-- precisa continuar podendo nascer depois — quando a ligação com o pedido
-- só aparece na rodada seguinte, a linha já tem `lancamento_id`. Para ela a
-- guarda é ser o lançamento do PRÓPRIO conversor: linha classificada à mão
-- não ganha tarifa por fora.
create or replace function public.converter_extrato_em_caixa()
returns table(criados integer, total_convertidos integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_antes integer;
  v_depois integer;
  v_destino text;
begin
  select count(*) into v_antes from lancamentos where origem like 'Extrato %';
  select id into v_destino from contas_bancarias where recebe_repasses limit 1;

  insert into lancamentos (
    id, ocorrido_em, competencia, descricao, categoria, categoria_id, conta_id,
    tipo, valor, recebido, baixado_em, recorrente, origem, pedido_id, chave_externa, criado_por)
  select 'ext-' || e.chave, e.ocorrido_em, date_trunc('month', e.ocorrido_em)::date,
    'Venda ' || e.pedido_id || coalesce(' – ' || nullif(btrim(e.contraparte), ''), ''),
    'Vendas', 'vendas', e.conta_id, 'entrada', p.valor, p.valor, e.ocorrido_em, false,
    'Extrato ' || c.nome, e.pedido_id, e.chave, 'conversão automática'
  from extrato_linhas e
  join contas_bancarias c on c.id = e.conta_id
  join pedidos p on p.id = e.pedido_id
  where e.descricao = 'Venda recebida' and not e.ignorado and p.valor >= e.valor
    and e.lancamento_id is null
    and not (p.situacao = 'cancelado' and pedido_cancelado_de_verdade(p.id))
  on conflict (chave_externa) do nothing;

  -- A tarifa nasce grudada na venda do conversor, e só nela. Aceita a linha
  -- ainda sem lançamento (mesma rodada, antes do UPDATE lá embaixo) e a que
  -- já virou o 'ext-' desta função — é o caso do pedido que só foi ligado
  -- depois. Linha classificada à mão fica de fora: o valor dela é o líquido,
  -- e descontar a tarifa por cima tiraria do caixa um dinheiro que a linha
  -- já não tinha.
  insert into lancamentos (
    id, ocorrido_em, competencia, descricao, categoria, categoria_id, conta_id,
    tipo, valor, recebido, baixado_em, recorrente, origem, pedido_id, chave_externa, criado_por)
  select 'ext-taxa-' || e.chave, e.ocorrido_em, date_trunc('month', e.ocorrido_em)::date,
    'Tarifa do gateway – ' || e.pedido_id, 'Taxas de pagamento', 'taxas-de-pagamento', e.conta_id,
    'saida', p.valor - e.valor, p.valor - e.valor, e.ocorrido_em, false,
    'Extrato ' || c.nome, e.pedido_id, 'taxa-' || e.chave, 'conversão automática'
  from extrato_linhas e
  join contas_bancarias c on c.id = e.conta_id
  join pedidos p on p.id = e.pedido_id
  where e.descricao = 'Venda recebida' and not e.ignorado and p.valor > e.valor
    and (e.lancamento_id is null or e.lancamento_id = 'ext-' || e.chave)
    and not (p.situacao = 'cancelado' and pedido_cancelado_de_verdade(p.id))
  on conflict (chave_externa) do nothing;

  insert into lancamentos (
    id, ocorrido_em, competencia, descricao, conta_id,
    tipo, valor, recebido, baixado_em, recorrente, origem, chave_externa, criado_por)
  select 'ext-' || e.chave, e.ocorrido_em, date_trunc('month', e.ocorrido_em)::date,
    'Crédito a classificar'
      || coalesce(' – pedido ' || p.id || ' cancelado e estornado', '')
      || coalesce(' – ' || nullif(btrim(e.contraparte), ''), ''),
    e.conta_id, 'entrada', e.valor, e.valor, e.ocorrido_em, false,
    'Extrato ' || c.nome, e.chave, 'conversão automática'
  from extrato_linhas e
  join contas_bancarias c on c.id = e.conta_id
  left join pedidos p on p.id = e.pedido_id
       and p.situacao = 'cancelado' and pedido_cancelado_de_verdade(p.id)
  where e.descricao = 'Venda recebida' and not e.ignorado
    and e.lancamento_id is null
    and (e.pedido_id is null
         or p.id is not null
         or not exists (select 1 from pedidos x where x.id = e.pedido_id and x.valor >= e.valor))
  on conflict (chave_externa) do nothing;

  insert into lancamentos (
    id, ocorrido_em, competencia, descricao, categoria, categoria_id, conta_id,
    tipo, valor, recebido, baixado_em, recorrente, origem, pedido_id, chave_externa, criado_por)
  select 'ext-' || e.chave, e.ocorrido_em, date_trunc('month', e.ocorrido_em)::date,
    e.descricao || coalesce(' – ' || nullif(btrim(e.contraparte), ''), ''),
    case when e.descricao = 'Estorno ao cliente' then 'Estornos e devoluções' end,
    case when e.descricao = 'Estorno ao cliente' then 'estornos-e-devolucoes' end,
    e.conta_id, 'saida', e.valor, e.valor, e.ocorrido_em, false,
    'Extrato ' || c.nome, e.pedido_id, e.chave, 'conversão automática'
  from extrato_linhas e
  join contas_bancarias c on c.id = e.conta_id
  where e.descricao in ('Estorno ao cliente', 'Compra paga pela conta') and not e.ignorado
    and e.lancamento_id is null
  on conflict (chave_externa) do nothing;

  insert into lancamentos (
    id, ocorrido_em, competencia, descricao, categoria, categoria_id, conta_id,
    tipo, valor, recebido, baixado_em, recorrente, origem, transferencia_id,
    conta_destino_id, aguarda_destino, chave_externa, criado_por)
  select 'ext-' || e.chave, e.ocorrido_em, date_trunc('month', e.ocorrido_em)::date,
    'Transferência para conta bancária', 'Transferências', 'transferencias', e.conta_id,
    'saida', e.valor, e.valor, e.ocorrido_em, false,
    'Extrato ' || c.nome, 'transf-' || e.chave,
    v_destino, v_destino is null, e.chave, 'conversão automática'
  from extrato_linhas e
  join contas_bancarias c on c.id = e.conta_id
  where e.descricao = 'Transferência para o banco' and not e.ignorado
    and e.lancamento_id is null
  on conflict (chave_externa) do nothing;

  -- A perna de entrada deriva da SAÍDA já gravada, e só existe enquanto
  -- aquela saída continuar sendo uma transferência para a conta de destino.
  -- Payout reclassificado como despesa perde `transferencia_id`, sai deste
  -- SELECT, e nenhuma entrada é inventada para ele.
  insert into lancamentos (
    id, ocorrido_em, competencia, descricao, categoria, categoria_id, conta_id,
    tipo, valor, recebido, baixado_em, recorrente, origem, transferencia_id,
    conta_destino_id, chave_externa, criado_por)
  select s.id || ':destino', s.ocorrido_em, s.competencia,
    'Transferência recebida – ' || c.nome,
    'Transferências', 'transferencias', s.conta_destino_id,
    'entrada', s.valor, s.valor, s.baixado_em, false,
    s.origem, s.transferencia_id, s.conta_id, s.id || ':destino', 'conversão automática'
  from lancamentos s
  join contas_bancarias c on c.id = s.conta_id
  where s.tipo = 'saida'
    and s.transferencia_id is not null
    and s.conta_destino_id is not null
    and s.conta_destino_id <> s.conta_id
    and s.cancelado_em is null
    and s.origem like 'Extrato %'
    and not s.aguarda_destino
  on conflict (chave_externa) do nothing;

  -- Só carimba linha que ainda não tem dono. Repontar uma linha já
  -- classificada para o lançamento do conversor foi o que transformaria a
  -- duplicidade em lançamento órfão — o da regra some da tela e continua
  -- pesando no caixa.
  update extrato_linhas e set lancamento_id = l.id
    from lancamentos l
   where l.chave_externa = e.chave and e.lancamento_id is null;

  select count(*) into v_depois from lancamentos where origem like 'Extrato %';
  return query select (v_depois - v_antes)::integer, v_depois::integer;
end;
$function$;
